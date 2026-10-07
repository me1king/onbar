import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/affiliateAgreement';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getCustomer(request: Request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Customer authentication is not configured.');

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Your sign-in session is invalid. Please sign in again.');
  return data.user;
}

export async function GET(request: Request) {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Affiliate services are not configured.' }, { status: 503 });

  let user;
  try {
    user = await getCustomer(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Your sign-in session is invalid.' }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });

  try {
    const [{ data: application, error: applicationError }, { data: performance, error: performanceError }, { data: payouts, error: payoutsError }] = await Promise.all([
      database.from('affiliates').select('id, verification_status, business_name, bio, audience_size, primary_channels, preferred_payout_method, payout_details, commission_rate_override').eq('user_id', user.id).maybeSingle(),
      database.from('affiliate_performance_summary').select('referral_code, clicks, conversions, total_revenue, available_earnings, pending_earnings, last_conversion_at, pending_orders, pending_sales').eq('affiliate_id', user.id).maybeSingle(),
      database.from('affiliate_payouts').select('id, amount, status, payment_method, created_at, processed_at, mpesa_receipt').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(50)
    ]);
    if (applicationError) throw applicationError;
    if (performanceError) throw performanceError;
    if (payoutsError) throw payoutsError;

    if (application?.verification_status !== 'Verified') {
      return NextResponse.json({ application, referralCode: null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!performance) throw new Error('Affiliate performance summary is unavailable. Please contact support.');

    const referralCode = performance?.referral_code;
    if (!referralCode) throw new Error('Your profile does not have a referral code yet. Please contact support.');

    const rate = Number(application.commission_rate_override) || 5;

    return NextResponse.json({
      application,
      referralCode,
      stats: {
        clicks: Number(performance.clicks || 0),
        conversions: Number(performance.conversions || 0),
        sales: Number(performance.total_revenue || 0),
        earned: Number(performance.total_revenue || 0) * rate / 100,
        available: Number(performance.available_earnings || 0),
        pendingOrders: Number(performance.pending_orders || 0),
        pendingSales: Number(performance.pending_sales || 0),
        commissionRate: rate
      },
      payouts: payouts || []
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Affiliate] Could not load customer affiliate data:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load affiliate details.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Affiliate applications are not configured.' }, { status: 503 });

  let user;
  try {
    user = await getCustomer(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Your sign-in session is invalid.' }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: 'Please sign in to apply.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Please submit a valid affiliate application.' }, { status: 400 });
  }

  const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
  const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
  const audienceSize = Number(body.audience_size);
  const channels = Array.isArray(body.primary_channels) ? body.primary_channels : [];
  const payoutMethod = body.preferred_payout_method;
  const payoutDetails = typeof body.payout_details === 'string' ? body.payout_details.trim() : '';
  const agreementAccepted = body.marketing_agreement_accepted === true;
  const agreementVersion = body.agreement_version;
  const agreementAcknowledged = body.agreement_draft_acknowledged === true
    && agreementVersion === AFFILIATE_AGREEMENT_VERSION;
  const allowedChannels = new Set(['Instagram', 'TikTok', 'WhatsApp', 'Website']);
  if (
    businessName.length < 2 || businessName.length > 120
    || bio.length < 10 || bio.length > 2000
    || !Number.isSafeInteger(audienceSize) || audienceSize < 0 || audienceSize > 100_000_000
    || channels.length < 1 || channels.some(channel => typeof channel !== 'string' || !allowedChannels.has(channel))
    || !['M-Pesa', 'Bank'].includes(String(payoutMethod))
    || payoutDetails.length < 3 || payoutDetails.length > 200
    || !agreementAccepted
    || !agreementAcknowledged
  ) {
    return NextResponse.json({ error: 'Complete each application field with valid details and select at least one channel.' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await database.from('profiles').select('referral_code').eq('id', user.id).maybeSingle();
  if (profileError) {
    console.error('[Affiliate] Could not verify customer profile:', profileError);
    return NextResponse.json({ error: 'Could not verify your customer profile.' }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ error: 'Create a customer profile before applying.' }, { status: 409 });

  const { data: existing, error: existingError } = await database.from('affiliates').select('id, verification_status').eq('user_id', user.id).maybeSingle();
  if (existingError) {
    console.error('[Affiliate] Could not check application status:', existingError);
    return NextResponse.json({ error: 'Could not check your current application.' }, { status: 500 });
  }
  if (existing?.verification_status === 'Pending' || existing?.verification_status === 'Verified') {
    return NextResponse.json({ error: 'You already have an active affiliate application.' }, { status: 409 });
  }

  let referralCode = typeof profile.referral_code === 'string' ? profile.referral_code : '';
  if (!referralCode) {
    referralCode = `OB-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: codeError } = await database.from('profiles').update({ referral_code: referralCode }).eq('id', user.id);
    if (codeError) {
      console.error('[Affiliate] Could not create referral code:', codeError);
      return NextResponse.json({ error: 'Could not create your affiliate referral code.' }, { status: 500 });
    }
  }

  const payload = {
    user_id: user.id,
    business_name: businessName,
    bio,
    audience_size: audienceSize,
    primary_channels: channels,
    preferred_payout_method: payoutMethod,
    payout_details: payoutDetails,
    verification_status: 'Pending',
    referral_code: referralCode,
    marketing_agreement_accepted: true,
    agreement_version: AFFILIATE_AGREEMENT_VERSION,
    agreement_accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const query = existing
    ? database.from('affiliates').update(payload).eq('user_id', user.id)
    : database.from('affiliates').insert(payload);
  const { error } = await query;
  if (error) {
    console.error('[Affiliate] Could not save application:', error);
    return NextResponse.json({ error: `Could not save your application: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: 'Pending' });
}
