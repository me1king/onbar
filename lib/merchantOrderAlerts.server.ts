import 'server-only';

import { createHash } from 'crypto';
import { Queue } from 'bullmq/dist/esm/classes/queue.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWebPushPublicKey, isWebPushConfigured, sendWebPush } from '@/lib/webPush.server';

const QUEUE_NAME = 'merchant-order-alerts';

type PushSubscriptionRow = {
  id: string;
  application_id: string;
  contact_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type OrderAlertJob = {
  orderId: number;
  applicationId: string;
  merchantName: string;
};

let queue: Queue<OrderAlertJob> | null = null;

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
  queue = new Queue<OrderAlertJob>(QUEUE_NAME, { connection });
  return queue;
}

export function getMerchantAlertConfiguration() {
  const redisReady = Boolean(redisConnection());
  const twilioReady = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim()
    && process.env.TWILIO_AUTH_TOKEN?.trim()
    && process.env.TWILIO_PHONE_NUMBER?.trim()
  );
  const voiceSecretReady = Boolean(process.env.TWILIO_ALERT_TOKEN_SECRET?.trim());
  return {
    pushConfigured: isWebPushConfigured(),
    webPushPublicKey: getWebPushPublicKey(),
    smsConfigured: redisReady && twilioReady,
    voiceConfigured: redisReady && twilioReady && voiceSecretReady,
    redisConfigured: redisReady,
    workerRequired: redisReady
  };
}

function endpointKey(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex');
}

async function claimDelivery(
  database: SupabaseClient,
  row: {
    order_id: number | null;
    application_id: string;
    contact_id: string | null;
    channel: 'push' | 'sms' | 'voice' | 'timeout';
    step: 'push' | 'sms_20s' | 'voice_45s' | 'timeout_60s' | 'test';
    recipient_key: string;
    status: string;
  }
) {
  const { data, error } = await database
    .from('merchant_order_alert_log')
    .upsert(row, {
      onConflict: 'order_id,application_id,channel,step,recipient_key',
      ignoreDuplicates: true
    })
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[MerchantOrderAlerts] Could not claim alert delivery:', error);
    return null;
  }
  return data?.id ?? null;
}

async function pushToDevice(
  database: SupabaseClient,
  subscription: PushSubscriptionRow,
  input: {
    orderId: number | null;
    merchantName: string;
    step: 'push' | 'test';
  }
) {
  const alertId = await claimDelivery(database, {
    order_id: input.orderId,
    application_id: subscription.application_id,
    contact_id: subscription.contact_id,
    channel: 'push',
    step: input.step,
    recipient_key: endpointKey(subscription.endpoint),
    status: 'sending'
  });
  if (alertId === null) return false;

  const sentAt = new Date().toISOString();
  try {
    const result = await sendWebPush(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      input.orderId === null
        ? {
          title: 'Online Bar alert test',
          body: `${input.merchantName}: this device is ready for order alerts.`,
          url: '/merchant/network?section=alerts',
          tag: 'merchant-alert-test'
        }
        : {
          title: `New order #${input.orderId}`,
          body: `${input.merchantName}: open Orders to review this order.`,
          url: `/merchant/network?section=orders&applicationId=${encodeURIComponent(subscription.application_id)}&orderId=${input.orderId}`,
          tag: `merchant-order-${input.orderId}`,
          orderId: input.orderId,
          requireInteraction: true,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        },
      input.orderId === null ? 300 : 90
    );
    const { error } = await database.from('merchant_order_alert_log')
      .update({ status: 'sent', provider_id: result.headers?.['x-webpush-id'] || null, sent_at: sentAt, error: null })
      .eq('id', alertId);
    if (error) console.error('[MerchantOrderAlerts] Could not record push result:', error);
    return true;
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number(error.statusCode)
      : null;
    if (statusCode === 404 || statusCode === 410) {
      const { error: deleteError } = await database.from('merchant_push_subscriptions')
        .delete().eq('id', subscription.id);
      if (deleteError) console.error('[MerchantOrderAlerts] Could not remove expired push device:', deleteError);
    }
    const details = error instanceof Error ? error.message.slice(0, 1000) : 'Push delivery failed';
    const { error: logError } = await database.from('merchant_order_alert_log')
      .update({ status: 'failed', error: details, sent_at: sentAt })
      .eq('id', alertId);
    if (logError) console.error('[MerchantOrderAlerts] Could not record push failure:', logError);
    console.error('[MerchantOrderAlerts] Push delivery failed:', statusCode || 'provider error');
    return false;
  }
}

async function scheduleEscalation(input: OrderAlertJob) {
  const targetQueue = getQueue();
  if (!targetQueue) {
    return { queued: false, error: 'Redis is not configured; delayed SMS, voice, and timeout jobs cannot run.' };
  }
  try {
    await targetQueue.add('sms', input, {
      jobId: `sms-${input.orderId}-${input.applicationId}`,
      delay: 20_000,
      attempts: 4,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
    await targetQueue.add('voice', input, {
      jobId: `voice-${input.orderId}-${input.applicationId}`,
      delay: 45_000,
      attempts: 4,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
    await targetQueue.add('timeout', input, {
      jobId: `timeout-${input.orderId}-${input.applicationId}`,
      delay: 60_000,
      attempts: 4,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
    return { queued: true, error: null };
  } catch (error) {
    console.error('[MerchantOrderAlerts] Could not queue delayed alert jobs:', error);
    return { queued: false, error: 'Redis could not schedule the alert ladder.' };
  }
}

export async function alertAllocatedMerchants(database: SupabaseClient, orderId: number) {
  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,payment_method,payment_verified_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  const paymentMethod = String(order?.payment_method || '').toLowerCase();
  const isPaystackOrder = paymentMethod === 'paystack'
    && String(order?.status || '').toLowerCase() === 'paid'
    && Boolean(order?.payment_verified_at);
  const isCodOrder = paymentMethod === 'cod'
    && ['pending', 'placed', 'confirmed'].includes(String(order?.status || '').toLowerCase());
  if (!order || (!isPaystackOrder && !isCodOrder)) {
    return { applications: 0, pushSent: 0, escalationQueued: false };
  }

  const { data: items, error: itemsError } = await database.from('order_items')
    .select('id,product_id')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;
  const itemIds = (items || []).map(item => Number(item.id)).filter(Number.isSafeInteger);
  if (!itemIds.length) return { applications: 0, pushSent: 0, escalationQueued: false };

  const { data: traces, error: tracesError } = await database.from('merchant_order_item_trace')
    .select('order_item_id,batch_id')
    .in('order_item_id', itemIds);
  if (tracesError) throw tracesError;
  const batchIds = [...new Set((traces || []).map(trace => String(trace.batch_id)))];
  if (!batchIds.length) return { applications: 0, pushSent: 0, escalationQueued: false };

  const { data: batches, error: batchesError } = await database.from('merchant_product_batches')
    .select('id,application_id')
    .in('id', batchIds);
  if (batchesError) throw batchesError;
  const applicationIds = [...new Set((batches || []).map(batch => String(batch.application_id)))];
  if (!applicationIds.length) return { applications: 0, pushSent: 0, escalationQueued: false };

  const { data: applications, error: applicationsError } = await database.from('merchant_applications')
    .select('id,business_name,status')
    .in('id', applicationIds);
  if (applicationsError) throw applicationsError;
  const acceptedEvents = await database.from('merchant_fulfillment_events')
    .select('application_id')
    .eq('order_id', orderId)
    .in('event_type', ['accepted', 'rejected']);
  if (acceptedEvents.error) throw acceptedEvents.error;

  let pushSent = 0;
  let alertedApplications = 0;
  let escalationQueued = false;
  for (const application of applications || []) {
    if (application.status !== 'approved'
      || (acceptedEvents.data || []).some(event => event.application_id === application.id)) continue;
    alertedApplications += 1;

    const { data: subscriptions, error: subscriptionsError } = await database.from('merchant_push_subscriptions')
      .select('id,application_id,contact_id,endpoint,p256dh,auth')
      .eq('application_id', application.id);
    if (subscriptionsError) throw subscriptionsError;

    if (!subscriptions?.length) {
      await claimDelivery(database, {
        order_id: orderId,
        application_id: application.id,
        contact_id: null,
        channel: 'push',
        step: 'push',
        recipient_key: 'no-registered-device',
        status: 'no_device'
      });
    } else {
      const outcomes = await Promise.all(subscriptions.map(subscription =>
        pushToDevice(database, subscription as PushSubscriptionRow, {
          orderId,
          merchantName: application.business_name,
          step: 'push'
        })
      ));
      pushSent += outcomes.filter(Boolean).length;
    }

    const escalation = await scheduleEscalation({
      orderId,
      applicationId: application.id,
      merchantName: application.business_name
    });
    escalationQueued ||= escalation.queued;
    if (!escalation.queued) {
      await claimDelivery(database, {
        order_id: orderId,
        application_id: application.id,
        contact_id: null,
        channel: 'timeout',
        step: 'timeout_60s',
        recipient_key: 'scheduler',
        status: 'failed'
      });
      console.error('[MerchantOrderAlerts] Escalation unavailable:', escalation.error);
    }
  }
  return { applications: alertedApplications, pushSent, escalationQueued };
}

export async function sendMerchantAlertTest(
  database: SupabaseClient,
  applicationId: string,
  contactId: string,
  merchantName: string
) {
  const { data: subscriptions, error } = await database.from('merchant_push_subscriptions')
    .select('id,application_id,contact_id,endpoint,p256dh,auth')
    .eq('application_id', applicationId)
    .eq('contact_id', contactId);
  if (error) throw error;
  if (!subscriptions?.length) return { sent: 0, failed: 0, noDevice: true };
  const outcomes = await Promise.all(subscriptions.map(subscription =>
    pushToDevice(database, subscription as PushSubscriptionRow, {
      orderId: null,
      merchantName,
      step: 'test'
    })
  ));
  return {
    sent: outcomes.filter(Boolean).length,
    failed: outcomes.filter(outcome => !outcome).length,
    noDevice: false
  };
}

export function getMerchantAlertQueueName() {
  return QUEUE_NAME;
}
