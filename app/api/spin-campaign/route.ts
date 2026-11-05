import { randomInt, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { normalizeKenyanPhone, type SpinCampaignPrize } from '@/lib/spinCampaign';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function migrationError(error: { code?: string; message?: string }) {
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '')) {
    return 'The spin campaign is not installed yet. Ask an administrator to apply supabase/BLACK_NOVEMBER_SPIN_CAMPAIGN_MIGRATION.sql.';
  }
  return 'The spin campaign could not be loaded. Please try again later.';
}

function weightedPrize(prizes: SpinCampaignPrize[]) {
  const total = prizes.reduce((sum, prize) => sum + prize.weight, 0);
  if (!prizes.length || !Number.isFinite(total) || total <= 0) throw new Error('No campaign prizes are currently available.');
  let ticket = randomInt(10_000) / 10_000 * total;
  for (const prize of prizes) {
    ticket -= prize.weight;
    if (ticket < 0) return prize;
  }
  return prizes[prizes.length - 1];
}

function makeCode() {
  return `BN-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

export async function GET() {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Spin campaign service is not configured.' }, { status: 503 });

  const { data: campaign, error } = await database.from('spin_campaigns')
    .select('id,title,is_active,starts_at,ends_at,terms_url,prizes')
    .eq('id', 'black-november-2026')
    .maybeSingle();
  if (error) return NextResponse.json({ error: migrationError(error) }, { status: 503 });

  const now = Date.now();
  const open = Boolean(campaign
    && campaign.is_active
    && now >= Date.parse(campaign.starts_at)
    && now < Date.parse(campaign.ends_at));
  return NextResponse.json({
    campaign: campaign && open ? {
      id: campaign.id,
      title: campaign.title,
      ends_at: campaign.ends_at,
      terms_url: campaign.terms_url,
      prizes: (Array.isArray(campaign.prizes) ? campaign.prizes : [])
        .filter((prize: SpinCampaignPrize) => prize.enabled)
        .map((prize: SpinCampaignPrize) => ({ id: prize.id, label: prize.label, weight: prize.weight }))
    } : null,
    unavailable: campaign ? !open : true
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Spin campaign service is not configured.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid spin campaign request is required.' }, { status: 400 });
  }

  if (body.action === 'validate') {
    const phone = typeof body.phone === 'string' ? normalizeKenyanPhone(body.phone) : null;
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const subtotal = Number(body.subtotal);
    if (!phone || !/^BN-[A-Z0-9]{6}$/.test(code) || !Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json({ error: 'Enter the phone number used for the spin and a valid campaign code.' }, { status: 400 });
    }

    const { data: win, error } = await database.from('spin_campaign_wins')
      .select('code,phone,prize_label,prize_type,value,minimum_order,expires_at,redeemed_at')
      .eq('code', code)
      .maybeSingle();
    if (error) return NextResponse.json({ error: migrationError(error) }, { status: 503 });
    if (!win || win.phone !== phone || win.redeemed_at || Date.parse(win.expires_at) <= Date.now()) {
      return NextResponse.json({ error: 'This code is invalid, expired, already used, or belongs to a different phone number.' }, { status: 400 });
    }
    if (subtotal < Number(win.minimum_order || 0)) {
      return NextResponse.json({ error: `${win.prize_label} requires a minimum item subtotal of KSh ${Number(win.minimum_order).toLocaleString('en-KE')}.` }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      coupon: {
        code: win.code,
        discount_percent: 0,
        discount_amount: win.prize_type === 'discount' ? Number(win.value) : 0,
        spin_prize_type: win.prize_type,
        prize_label: win.prize_label,
        minimum_order: Number(win.minimum_order),
        expires_at: win.expires_at
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.action !== 'spin') return NextResponse.json({ error: 'Unknown campaign action.' }, { status: 400 });
  const phone = typeof body.phone === 'string' ? normalizeKenyanPhone(body.phone) : null;
  if (!phone) return NextResponse.json({ error: 'Enter a valid Kenyan mobile number.' }, { status: 400 });
  if (body.ageConfirmed !== true || body.termsAccepted !== true) {
    return NextResponse.json({ error: 'Confirm that you are 18 or older and accept the campaign terms.' }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await database.from('spin_campaigns')
    .select('id,is_active,starts_at,ends_at,prizes')
    .eq('id', 'black-november-2026')
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: migrationError(campaignError) }, { status: 503 });
  const now = Date.now();
  if (!campaign?.is_active || now < Date.parse(campaign.starts_at) || now >= Date.parse(campaign.ends_at)) {
    return NextResponse.json({ error: 'This campaign is not open right now.' }, { status: 409 });
  }

  const configuredPrizes = (Array.isArray(campaign.prizes) ? campaign.prizes : [])
    .filter((prize: SpinCampaignPrize) => prize.enabled && prize.weight > 0);
  try {
    if (Math.abs(configuredPrizes.reduce((sum, prize) => sum + prize.weight, 0) - 100) > 0.001) {
      throw new Error('Campaign prize odds must total exactly 100%.');
    }
    const availablePrizes: SpinCampaignPrize[] = [];
    for (const prize of configuredPrizes) {
      if (prize.max_winners === null) {
        availablePrizes.push(prize);
        continue;
      }
      const { count, error: countError } = await database.from('spin_campaign_wins')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('prize_id', prize.id);
      if (countError) return NextResponse.json({ error: migrationError(countError) }, { status: 503 });
      if ((count || 0) < prize.max_winners) availablePrizes.push(prize);
    }

    for (let attempt = 0; attempt < 8 && availablePrizes.length > 0; attempt += 1) {
      const prize = weightedPrize(availablePrizes);

      const { data, error } = await database.rpc('issue_spin_campaign_win', {
        campaign_id_input: campaign.id,
        phone_input: phone,
        prize_id_input: prize.id,
        code_input: makeCode(),
        age_confirmed_input: true,
        expires_at_input: campaign.ends_at,
        assigned_by_input: null
      });
      if (!error) {
        const win = data as {
          prize_id: string;
          code: string;
          prize_label: string;
          prize_type: string;
          value: number;
          minimum_order: number;
          expires_at: string;
        };
        return NextResponse.json({
          ok: true,
          prize: {
            id: win.prize_id,
            label: win.prize_label,
            type: win.prize_type,
            value: Number(win.value),
            minimum_order: Number(win.minimum_order),
            code: win.code,
            expires_at: win.expires_at
          }
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (/already has a campaign result/i.test(error.message)) {
        return NextResponse.json({ error: 'This phone number has already used its spin for this campaign.' }, { status: 409 });
      }
      if (/already been claimed/i.test(error.message)) {
        const index = availablePrizes.findIndex(availablePrize => availablePrize.id === prize.id);
        if (index >= 0) availablePrizes.splice(index, 1);
        continue;
      }
      console.error('[SpinCampaign] Could not issue a campaign win:', error);
      return NextResponse.json({ error: /not open/i.test(error.message) ? error.message : 'The prize could not be issued. Please try again.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'The available prize pool changed. Please try again.' }, { status: 409 });
  } catch (error) {
    console.error('[SpinCampaign] Spin failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The spin could not be completed.' }, { status: 503 });
  }
}
