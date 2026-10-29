import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isWebPushConfigured } from '@/lib/webPush.server';

export const dynamic = 'force-dynamic';

type SubscriptionBody = {
  subscription?: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  endpoint?: unknown;
};

async function getAccount(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !serviceKey || !publicKey) {
    return { error: NextResponse.json({ error: 'Push subscription storage is not configured.' }, { status: 503 }) };
  }
  if (!token) return { error: NextResponse.json({ error: 'Sign in to manage delivery notifications.' }, { status: 401 }) };

  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Your sign-in has expired. Sign in again.' }, { status: 401 }) };
  }
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { database, user: data.user };
}

export async function GET(request: Request) {
  const account = await getAccount(request);
  if ('error' in account) return account.error;

  const { data, error } = await account.database
    .from('customer_push_subscriptions')
    .select('id')
    .eq('user_id', account.user.id)
    .limit(1);
  if (error) {
    console.error('[WebPush] Could not load subscription state:', error);
    return NextResponse.json({ error: 'Push preference could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({ enabled: Boolean(data?.length) }, {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function POST(request: Request) {
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: 'Web Push is not configured on the server.' }, { status: 503 });
  }
  const account = await getAccount(request);
  if ('error' in account) return account.error;

  let body: SubscriptionBody;
  try {
    body = await request.json() as SubscriptionBody;
  } catch {
    return NextResponse.json({ error: 'A valid browser push subscription is required.' }, { status: 400 });
  }
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 2048
    || typeof p256dh !== 'string' || p256dh.length > 256
    || typeof auth !== 'string' || auth.length > 256) {
    return NextResponse.json({ error: 'The browser push subscription is invalid.' }, { status: 400 });
  }
  try {
    const parsedEndpoint = new URL(endpoint);
    const host = parsedEndpoint.hostname.toLowerCase();
    const allowedHost = host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.notify.windows.com')
      || host === 'web.push.apple.com'
      || host.endsWith('.push.apple.com');
    if (parsedEndpoint.protocol !== 'https:' || !allowedHost) throw new Error('Unsupported push provider');
  } catch {
    return NextResponse.json({ error: 'The push endpoint must use HTTPS.' }, { status: 400 });
  }

  const { error } = await account.database.from('customer_push_subscriptions').upsert({
    user_id: account.user.id,
    endpoint,
    p256dh,
    auth,
    consented_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });
  if (error) {
    console.error('[WebPush] Could not save a customer subscription:', error);
    return NextResponse.json({ error: 'Push preference could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ enabled: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const account = await getAccount(request);
  if ('error' in account) return account.error;

  let body: SubscriptionBody;
  try {
    body = await request.json() as SubscriptionBody;
  } catch {
    return NextResponse.json({ error: 'The browser push endpoint is required to disable notifications.' }, { status: 400 });
  }
  if (body.endpoint !== undefined && (typeof body.endpoint !== 'string' || body.endpoint.length > 2048)) {
    return NextResponse.json({ error: 'A valid browser push endpoint is required.' }, { status: 400 });
  }
  let query = account.database
    .from('customer_push_subscriptions')
    .delete()
    .eq('user_id', account.user.id);
  if (typeof body.endpoint === 'string') query = query.eq('endpoint', body.endpoint);
  const { error } = await query;
  if (error) {
    console.error('[WebPush] Could not remove a customer subscription:', error);
    return NextResponse.json({ error: 'Push preference could not be disabled.' }, { status: 503 });
  }
  return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
}
