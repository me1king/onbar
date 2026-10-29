import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isWebPushConfigured, sendWebPush } from '@/lib/webPush.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in to test delivery alerts.' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const database = createServerSupabaseClient();
  if (!url || !publicKey || !database) {
    return NextResponse.json({ error: 'Push testing is not configured on the server.' }, { status: 503 });
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: 'Web Push is not configured on the server.' }, { status: 503 });
  }
  const auth = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Your sign-in has expired. Sign in again.' }, { status: 401 });
  }

  const { data: subscriptions, error } = await database
    .from('customer_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', authData.user.id);
  if (error) {
    console.error('[WebPushTest] Could not load customer subscriptions:', error);
    return NextResponse.json({ error: 'Push test destination could not be loaded.' }, { status: 503 });
  }
  if (!subscriptions?.length) {
    return NextResponse.json({ error: 'Enable delivery push alerts on this device first.' }, { status: 409 });
  }

  const outcomes = await Promise.allSettled(subscriptions.map(subscription => sendWebPush(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    {
      title: 'Online Bar alerts enabled',
      body: 'This device is ready for private delivery updates.',
      url: '/profile',
      tag: 'onlinebar-push-test'
    }
  )));
  if (!outcomes.some(outcome => outcome.status === 'fulfilled')) {
    console.error('[WebPushTest] Provider rejected all push test deliveries.');
    return NextResponse.json({ error: 'Push provider rejected the test notification.' }, { status: 502 });
  }
  return NextResponse.json({
    sent: true,
    partialFailure: outcomes.some(outcome => outcome.status === 'rejected')
  });
}
