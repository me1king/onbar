import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { readTwilioRequest } from '@/lib/twilioMerchantAlertWebhook.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const form = await readTwilioRequest(request);
  if (!form) return new NextResponse('Invalid provider signature.', { status: 403 });

  const channel = new URL(request.url).searchParams.get('channel') === 'voice' ? 'voice' : 'sms';
  const providerId = channel === 'voice' ? form.get('CallSid') : form.get('MessageSid');
  const providerStatus = (channel === 'voice' ? form.get('CallStatus') : form.get('MessageStatus'))?.toLowerCase();
  if (!providerId || !providerStatus) {
    return NextResponse.json({ error: 'Provider status fields are incomplete.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[MerchantAlertStatus] Supabase service role is not configured.');
    return NextResponse.json({ error: 'Alert delivery storage is unavailable.' }, { status: 503 });
  }

  const database = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const failedStatuses = channel === 'voice'
    ? ['busy', 'canceled', 'failed', 'no-answer']
    : ['failed', 'undelivered'];
  const deliveredStatuses = channel === 'voice'
    ? ['answered', 'completed', 'in-progress']
    : ['delivered'];
  const status = failedStatuses.includes(providerStatus)
    ? 'failed'
    : deliveredStatuses.includes(providerStatus)
      ? 'delivered'
      : 'sent';
  const { error } = await database.from('merchant_order_alert_log').update({
    status,
    ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    ...(status === 'failed' ? { error: `Twilio reported ${providerStatus}.` } : {})
  })
    .eq('channel', channel)
    .eq('provider_id', providerId)
    .in('status', ['sending', 'sent', 'delivered']);
  if (error) {
    console.error('[MerchantAlertStatus] Could not update delivery status:', error);
    return NextResponse.json({ error: 'Alert delivery status could not be recorded.' }, { status: 503 });
  }
  return NextResponse.json({ received: true });
}
