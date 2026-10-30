import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isWebPushConfigured, getWebPushPublicKey } from '@/lib/webPush.server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getVerifiedRider(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const session = verifyRiderSession(token);
  if (!session) {
    return { response: NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 }) };
  }

  const database = getDatabase();
  if (!database) {
    return { response: NextResponse.json({ error: 'Rider alerts are not configured on the server.' }, { status: 503 }) };
  }
  const { data: rider, error } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (error) {
    console.error('[RiderAlerts] Could not verify rider:', error);
    return { response: NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 }) };
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return { response: NextResponse.json({ error: 'Only verified riders can manage mission alerts.' }, { status: 403 }) };
  }
  return { database, phone: session.phone };
}

export async function GET(request: Request) {
  const rider = await getVerifiedRider(request);
  if ('response' in rider) return rider.response;
  return NextResponse.json({
    configured: isWebPushConfigured(),
    publicKey: getWebPushPublicKey()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const rider = await getVerifiedRider(request);
  if ('response' in rider) return rider.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid push subscription is required.' }, { status: 400 });
  }
  if (body.operation !== 'subscribe' || !body.subscription
    || typeof body.subscription !== 'object' || Array.isArray(body.subscription)) {
    return NextResponse.json({ error: 'A valid push subscription is required.' }, { status: 400 });
  }

  const subscription = body.subscription as Record<string, unknown>;
  const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint : '';
  const keys = subscription.keys && typeof subscription.keys === 'object' && !Array.isArray(subscription.keys)
    ? subscription.keys as Record<string, unknown>
    : {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
  const auth = typeof keys.auth === 'string' ? keys.auth : '';
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return NextResponse.json({ error: 'The push device endpoint is invalid.' }, { status: 400 });
  }
  if (endpointUrl.protocol !== 'https:' || endpoint.length > 2048
    || p256dh.length < 20 || p256dh.length > 256 || auth.length < 10 || auth.length > 256) {
    return NextResponse.json({ error: 'The push subscription is invalid.' }, { status: 400 });
  }

  const { error } = await rider.database.from('rider_push_subscriptions').upsert({
    rider_phone: rider.phone,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
    last_seen_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205'
      || /rider_push_subscriptions/i.test(error.message)) {
      return NextResponse.json({
        error: 'Rider alert storage is not installed. Apply supabase/RIDER_ORDER_ALERTS_MIGRATION.sql.'
      }, { status: 503 });
    }
    console.error('[RiderAlerts] Could not register push device:', error);
    return NextResponse.json({ error: 'This device could not be registered for rider mission alerts.' }, { status: 503 });
  }
  return NextResponse.json({ registered: true }, { headers: { 'Cache-Control': 'no-store' } });
}
