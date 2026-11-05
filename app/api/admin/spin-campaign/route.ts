import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';
import { normalizeKenyanPhone, type SpinCampaign, type SpinCampaignPrize } from '@/lib/spinCampaign';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

async function authorize() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (session.role !== 'owner'
    && session.permissions?.can_manage_settings !== true
    && session.permissions?.can_manage_marketing !== true)) {
    return { response: NextResponse.json({ error: 'Campaign management access required.' }, { status: 403 }) };
  }
  const database = getDatabase();
  if (!database) return { response: NextResponse.json({ error: 'Campaign storage is not configured.' }, { status: 503 }) };
  return { database, session };
}

function migrationMessage(error: { code?: string }) {
  return ['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '')
    ? 'Campaign storage is not installed. Apply supabase/BLACK_NOVEMBER_SPIN_CAMPAIGN_MIGRATION.sql.'
    : 'Campaign data could not be saved or loaded.';
}

function validateCampaign(value: unknown): value is SpinCampaign {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const campaign = value as Partial<SpinCampaign>;
  if (campaign.id !== 'black-november-2026'
    || typeof campaign.title !== 'string' || !campaign.title.trim() || campaign.title.length > 100
    || typeof campaign.active !== 'boolean'
    || typeof campaign.starts_at !== 'string' || !Number.isFinite(Date.parse(campaign.starts_at))
    || typeof campaign.ends_at !== 'string' || !Number.isFinite(Date.parse(campaign.ends_at))
    || Date.parse(campaign.ends_at) <= Date.parse(campaign.starts_at)
    || typeof campaign.terms_url !== 'string' || !campaign.terms_url.startsWith('/') || campaign.terms_url.startsWith('//') || campaign.terms_url.length > 200
    || !Array.isArray(campaign.prizes) || campaign.prizes.length < 2 || campaign.prizes.length > 20) return false;

  const seen = new Set<string>();
  const prizes = campaign.prizes as SpinCampaignPrize[];
  return prizes.every(prize => {
    if (typeof prize !== 'object' || prize === null
      || typeof prize.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(prize.id) || seen.has(prize.id)
      || typeof prize.label !== 'string' || !prize.label.trim() || prize.label.length > 80
      || !['discount', 'free_delivery', 'free_bottle', 'free_mixers'].includes(prize.type)
      || !Number.isFinite(prize.value) || prize.value < 0 || prize.value > 100000
      || !Number.isFinite(prize.weight) || prize.weight < 0 || prize.weight > 100
      || !Number.isFinite(prize.minimum_order) || prize.minimum_order < 0 || prize.minimum_order > 1_000_000
      || (prize.max_winners !== null && (!Number.isSafeInteger(prize.max_winners) || prize.max_winners < 1 || prize.max_winners > 100000))
      || typeof prize.enabled !== 'boolean') return false;
    seen.add(prize.id);
    return true;
  }) && Math.abs(prizes.filter(prize => prize.enabled).reduce((sum, prize) => sum + prize.weight, 0) - 100) < 0.001
    && prizes.some(prize => prize.enabled && prize.weight > 0 && prize.max_winners === null);
}

function makeCode() {
  return `BN-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

export async function GET() {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  const [{ data: campaign, error: campaignError }, { data: wins, error: winsError }] = await Promise.all([
    auth.database.from('spin_campaigns').select('*').eq('id', 'black-november-2026').maybeSingle(),
    auth.database.from('spin_campaign_wins').select('*').eq('campaign_id', 'black-november-2026').order('created_at', { ascending: false }).limit(300)
  ]);
  if (campaignError || winsError) {
    const error = campaignError || winsError!;
    return NextResponse.json({ error: migrationMessage(error) }, { status: 503 });
  }
  return NextResponse.json({ campaign, wins: wins || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  let body: { campaign?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid campaign configuration is required.' }, { status: 400 });
  }
  if (!validateCampaign(body.campaign)) {
    return NextResponse.json({ error: 'Check the campaign dates and prize limits, keep enabled odds at 100%, and leave at least one positive-odds prize unlimited.' }, { status: 400 });
  }
  const campaign = body.campaign;
  const { error } = await auth.database.from('spin_campaigns').upsert({
    id: campaign.id,
    title: campaign.title.trim(),
    is_active: campaign.active,
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
    terms_url: campaign.terms_url,
    prizes: campaign.prizes,
    updated_at: new Date().toISOString(),
    updated_by: auth.session.email
  }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: migrationMessage(error) }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  let body: { action?: unknown; phone?: unknown; prizeId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid winner assignment is required.' }, { status: 400 });
  }
  if (body.action !== 'assign-winner' || typeof body.phone !== 'string' || typeof body.prizeId !== 'string') {
    return NextResponse.json({ error: 'Choose a phone number and a prize to assign.' }, { status: 400 });
  }
  const phone = normalizeKenyanPhone(body.phone);
  if (!phone) return NextResponse.json({ error: 'Enter a valid Kenyan mobile number.' }, { status: 400 });

  const { data: campaign, error: campaignError } = await auth.database.from('spin_campaigns')
    .select('prizes,ends_at')
    .eq('id', 'black-november-2026')
    .maybeSingle();
  if (campaignError || !campaign) return NextResponse.json({ error: migrationMessage(campaignError || {}) }, { status: 503 });
  const prize = (Array.isArray(campaign.prizes) ? campaign.prizes : [])
    .find((item: SpinCampaignPrize) => item.id === body.prizeId && item.enabled);
  if (!prize) return NextResponse.json({ error: 'That prize is not enabled for this campaign.' }, { status: 400 });

  const { data, error } = await auth.database.rpc('issue_spin_campaign_win', {
    campaign_id_input: 'black-november-2026',
    phone_input: phone,
    prize_id_input: prize.id,
    code_input: makeCode(),
    age_confirmed_input: true,
    expires_at_input: campaign.ends_at,
    assigned_by_input: auth.session.email || auth.session.role
  });
  if (error) {
    const duplicate = /already been claimed/i.test(error.message);
    return NextResponse.json({
      error: duplicate
        ? 'This prize has reached its winner limit.'
        : /unique|already has/i.test(error.message)
          ? 'This phone already has a redeemed campaign prize and cannot be reassigned.'
          : migrationMessage(error)
    }, { status: duplicate ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, win: data });
}
