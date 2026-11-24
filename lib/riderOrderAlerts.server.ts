import 'server-only';

import { createHash } from 'node:crypto';
import { Queue } from 'bullmq/dist/esm/classes/queue.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWebPush } from '@/lib/webPush.server';

const QUEUE_NAME = 'merchant-order-alerts';

type RiderSmsJob = { orderId: number; riderPhone: string };
type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let queue: Queue<RiderSmsJob> | null = null;

function redisConnection() {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['redis:', 'rediss:'].includes(url.protocol)) return null;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false
    };
  } catch {
    return null;
  }
}

function getQueue() {
  if (queue) return queue;
  const connection = redisConnection();
  if (!connection) return null;
  queue = new Queue<RiderSmsJob>(QUEUE_NAME, { connection });
  return queue;
}

async function claimAlert(
  database: SupabaseClient,
  input: {
    orderId: number;
    riderPhone: string;
    channel: 'push' | 'sms';
    step: 'assignment' | 'sms_10s';
    recipientKey: string;
  }
) {
  const { data, error } = await database.rpc('claim_rider_order_alert', {
    p_order_id: input.orderId,
    p_rider_phone: input.riderPhone,
    p_channel: input.channel,
    p_step: input.step,
    p_recipient_key: input.recipientKey
  });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

async function updateAlert(database: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await database.from('rider_order_alert_log').update(values).eq('id', id);
  if (error) throw error;
}

async function pushToDevice(
  database: SupabaseClient,
  orderId: number,
  riderPhone: string,
  subscription: PushSubscriptionRow
) {
  const recipientKey = createHash('sha256').update(subscription.endpoint).digest('hex');
  const alertId = await claimAlert(database, {
    orderId,
    riderPhone,
    channel: 'push',
    step: 'assignment',
    recipientKey
  });
  if (!alertId) return false;

  try {
    const result = await sendWebPush(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      {
        title: `New mission #${orderId}`,
        body: 'You have been assigned a delivery. Open Rider Command to review it.',
        url: `/rider/dashboard?orderId=${orderId}`,
        tag: `rider-order-${orderId}`,
        orderId,
        requireInteraction: true,
        expiresAt: new Date(Date.now() + 25_000).toISOString()
      },
      25
    );
    await updateAlert(database, alertId, {
      status: 'sent',
      provider_id: result.headers?.['x-webpush-id'] || null,
      sent_at: new Date().toISOString(),
      error: null
    });
    return true;
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number(error.statusCode)
      : null;
    if (statusCode === 404 || statusCode === 410) {
      const { error: deleteError } = await database.from('rider_push_subscriptions')
        .delete().eq('id', subscription.id);
      if (deleteError) console.error('[RiderOrderAlerts] Could not remove expired push device:', deleteError);
    }
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Push delivery failed.';
    await updateAlert(database, alertId, { status: 'failed', error: message });
    console.error('[RiderOrderAlerts] Push delivery failed:', statusCode || 'provider error');
    return false;
  }
}

export async function alertAssignedRider(
  database: SupabaseClient,
  orderId: number,
  riderPhone: string
) {
  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,rider_phone')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order || order.rider_phone !== riderPhone || order.status !== 'Dispatched') {
    return { pushSent: 0, smsQueued: false, warning: 'The rider assignment changed before its alert could be sent.' };
  }

  const { data: subscriptions, error: subscriptionsError } = await database
    .from('rider_push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('rider_phone', riderPhone);
  if (subscriptionsError) throw subscriptionsError;

  let pushSent = 0;
  if (!subscriptions?.length) {
    const alertId = await claimAlert(database, {
      orderId,
      riderPhone,
      channel: 'push',
      step: 'assignment',
      recipientKey: 'no-registered-device'
    });
    if (alertId) await updateAlert(database, alertId, { status: 'no_device' });
  } else {
    const results = await Promise.all(subscriptions.map(subscription =>
      pushToDevice(database, orderId, riderPhone, subscription as PushSubscriptionRow)
    ));
    pushSent = results.filter(Boolean).length;
  }

  const targetQueue = getQueue();
  if (!targetQueue) {
    return {
      pushSent,
      smsQueued: false,
      warning: 'Rider push was attempted, but SMS fallback is unavailable because Redis is not configured.'
    };
  }
  try {
    await targetQueue.add('rider-sms', {
      orderId,
      riderPhone
    }, {
      jobId: `rider-sms-${orderId}-${riderPhone}`,
      delay: 10_000,
      attempts: 4,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
    return { pushSent, smsQueued: true, warning: null };
  } catch (error) {
    console.error('[RiderOrderAlerts] Could not queue SMS fallback:', error);
    return { pushSent, smsQueued: false, warning: 'Rider push was attempted, but SMS fallback could not be queued.' };
  }
}
