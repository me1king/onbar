import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AFFILIATE_AGREEMENT_VERSION } from '@/lib/affiliateAgreement';

export const dynamic = 'force-dynamic';

async function getCustomer(request: Request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Customer authentication is not configured.');
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Your sign-in session is invalid. Please sign in again.');
  if (!data.user.email || !data.user.email_confirmed_at) {
    throw new Error('Verify the invited email address on your account before joining the affiliate program.');
  }
  return data.user;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ error: 'Affiliate invitation service is not configured.' }, { status: 503 });

  let user;
  try {
    user = await getCustomer(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Your sign-in session is invalid.' }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: 'Sign in with the invited email address to continue.' }, { status: 401 });

  let body: {
    token?: unknown;
    businessName?: unknown;
    bio?: unknown;
    audienceSize?: unknown;
    channels?: unknown;
    payoutMethod?: unknown;
    payoutDetails?: unknown;
    acceptedTerms?: unknown;
    acknowledgedAgreement?: unknown;
    agreementVersion?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Valid invitation acceptance details are required.' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
  const audienceSize = Number(body.audienceSize);
  const channels = Array.isArray(body.channels) ? body.channels : [];
  const payoutDetails = typeof body.payoutDetails === 'string' ? body.payoutDetails.trim() : '';
  const allowedChannels = new Set(['Instagram', 'TikTok', 'WhatsApp', 'Website']);

  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)
    || businessName.length < 2 || businessName.length > 120
    || bio.length < 10 || bio.length > 2000
    || !Number.isSafeInteger(audienceSize) || audienceSize < 0 || audienceSize > 100_000_000
    || channels.length < 1 || channels.some(channel => typeof channel !== 'string' || !allowedChannels.has(channel))
    || !['M-Pesa', 'Bank'].includes(String(body.payoutMethod))
    || payoutDetails.length < 3 || payoutDetails.length > 200
    || body.acceptedTerms !== true
    || body.acknowledgedAgreement !== true
    || body.agreementVersion !== AFFILIATE_AGREEMENT_VERSION) {
    return NextResponse.json({ error: 'Complete all required invitation and agreement details.' }, { status: 400 });
  }

  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await database.rpc('accept_affiliate_invitation', {
    p_token_hash: tokenHash,
    p_user_id: user.id,
    p_business_name: businessName,
    p_bio: bio,
    p_audience_size: audienceSize,
    p_primary_channels: channels,
    p_payout_method: body.payoutMethod,
    p_payout_details: payoutDetails,
    p_agreement_version: AFFILIATE_AGREEMENT_VERSION
  });

  if (error) {
    const detail = error.message || '';
    if (/invalid for the signed-in account|email|verified email/i.test(detail)) {
      return NextResponse.json({ error: 'Sign in using the verified email address this invitation was sent to.' }, { status: 403 });
    }
    if (/expired|revoked|already been accepted/i.test(detail)) {
      return NextResponse.json({ error: detail }, { status: 409 });
    }
    if (/already has an active affiliate record/i.test(detail)) {
      return NextResponse.json({ error: 'This account already has an active affiliate record.' }, { status: 409 });
    }
    if (/profile/i.test(detail)) return NextResponse.json({ error: 'Create a customer profile before accepting this invitation.' }, { status: 409 });
    console.error('[AffiliateInvitation] Could not accept invitation:', error);
    return NextResponse.json({ error: 'Could not accept this invitation. Confirm the affiliate invitations migration is applied.' }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, referralCode: data });
}
