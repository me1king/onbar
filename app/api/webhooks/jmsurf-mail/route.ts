import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const webhookEvents = new Set([
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.failed'
]);

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;
  const fields = new Map(signatureHeader.split(',').map(part => {
    const separator = part.indexOf('=');
    return separator < 0
      ? ['', '']
      : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  const timestamp = fields.get('t');
  const signature = fields.get('v1');
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp) || !/^[a-f\d]{64}$/i.test(signature)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) >= 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = process.env.JMSURF_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[JMSURFWebhook] JMSURF_WEBHOOK_SECRET is not configured.');
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 64_000) {
    return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 64_000) {
    return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  }
  if (!verifySignature(rawBody, request.headers.get('x-jmsurf-signature'), secret)) {
    return NextResponse.json({ error: 'Webhook signature is invalid or expired.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Webhook payload must be valid JSON.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('type' in body) || typeof body.type !== 'string'
    || !webhookEvents.has(body.type) || !('data' in body) || typeof body.data !== 'object' || body.data === null
    || !('id' in body.data) || typeof body.data.id !== 'string' || !body.data.id.trim()) {
    return NextResponse.json({ error: 'Webhook event type or message ID is invalid.' }, { status: 400 });
  }

  const event = body as {
    type: string;
    data: { id: string; error?: unknown; link?: unknown; email?: unknown; to?: unknown };
    created_at?: unknown;
  };
  const eventType = event.type;
  const eventData = event.data;
  const providerMessageId = eventData.id.trim().slice(0, 200);
  const safeEventData: Record<string, string> = {};
  if (typeof eventData.error === 'string') safeEventData.error = eventData.error.slice(0, 1000);
  if (typeof eventData.link === 'string' && /^https:\/\//i.test(eventData.link)) safeEventData.link = eventData.link.slice(0, 2000);
  const rawRecipient = typeof eventData.email === 'string'
    ? eventData.email
    : Array.isArray(eventData.to) && typeof eventData.to[0] === 'string'
      ? eventData.to[0]
      : typeof eventData.to === 'string' ? eventData.to : '';
  const recipientEmail = rawRecipient.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    safeEventData.email = recipientEmail.slice(0, 254);
  }
  const providerCreatedAt = typeof event.created_at === 'string' && !Number.isNaN(Date.parse(event.created_at))
    ? new Date(event.created_at).toISOString()
    : null;
  const eventId = createHash('sha256')
    .update(`${eventType}\n${providerMessageId}\n${providerCreatedAt || ''}\n${JSON.stringify(safeEventData)}`)
    .digest('hex');

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Webhook database is not configured.' }, { status: 503 });

  const { data: stored, error: storeError } = await database.from('jmsurf_email_webhook_events').upsert({
    event_id: eventId,
    event_type: eventType,
    provider_message_id: providerMessageId,
    event_data: safeEventData,
    provider_created_at: providerCreatedAt
  }, { onConflict: 'event_id', ignoreDuplicates: true }).select('event_id').maybeSingle();
  if (storeError) {
    console.error('[JMSURFWebhook] Could not store provider event:', storeError);
    return NextResponse.json({ error: 'Webhook event could not be recorded.' }, { status: 500 });
  }

  const deliveryUpdate: Record<string, string | null> = {
    provider_delivery_status: eventType,
    provider_updated_at: providerCreatedAt || new Date().toISOString()
  };
  if (eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.failed') {
    deliveryUpdate.delivery_status = 'failed';
    deliveryUpdate.error_message = (safeEventData.error || eventType).slice(0, 500);
  }
  const centerStatus: Record<string, string> = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.failed': 'failed'
  };
  const [{ error: notificationError }, { error: ticketError }, { error: campaignError }, { error: centerError }] = await Promise.all([
    database.from('customer_notification_deliveries')
      .update(deliveryUpdate)
      .eq('channel', 'email')
      .eq('provider_message_id', providerMessageId),
    database.from('ticketing_email_deliveries')
      .update({
        ...(eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.failed'
          ? {
              status: 'pending',
              locked_until: null,
              last_error: (safeEventData.error || eventType).slice(0, 1000)
            }
          : {}),
        provider_delivery_status: eventType,
        provider_updated_at: providerCreatedAt || new Date().toISOString()
      })
      .eq('provider_message_id', providerMessageId),
    database.from('message_campaign_deliveries')
      .update({
        provider_delivery_status: eventType,
        provider_updated_at: providerCreatedAt || new Date().toISOString(),
        ...(eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.failed'
          ? { status: 'failed', error_message: (safeEventData.error || eventType).slice(0, 500) }
          : {})
      })
      .eq('provider_message_id', providerMessageId),
    database.from('email_command_center_messages')
      .update({ status: centerStatus[eventType], updated_at: providerCreatedAt || new Date().toISOString() })
      .eq('provider_message_id', providerMessageId)
  ]);
  if (notificationError || ticketError || campaignError || centerError) {
    console.error('[JMSURFWebhook] Could not update matching delivery:', notificationError || ticketError || campaignError || centerError);
    return NextResponse.json({ error: 'Webhook was stored but a matching delivery record could not be updated.' }, { status: 500 });
  }

  if ((eventType === 'email.bounced' || eventType === 'email.complained') && safeEventData.email) {
    const { error: suppressionError } = await database.from('email_suppressions').upsert({
      email: safeEventData.email,
      reason: eventType === 'email.complained' ? 'complaint' : 'bounce',
      source: 'JMSURF email webhook'
    }, { onConflict: 'email' });
    if (suppressionError) {
      console.error('[JMSURFWebhook] Could not suppress bounced or complained address:', suppressionError);
      return NextResponse.json({ error: 'Webhook was stored but the recipient suppression could not be recorded.' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true, duplicate: !stored }, { status: 200 });
}
