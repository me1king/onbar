import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Worker } from 'bullmq';

const queueName = 'merchant-order-alerts';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const twilioNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
const publicBaseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://onlinebar.onrender.com').replace(/\/+$/, '');
const voiceSecret = process.env.TWILIO_ALERT_TOKEN_SECRET?.trim();
const internalApiSecret = process.env.INTERNAL_API_SECRET?.trim();

if (!supabaseUrl || !serviceRoleKey || !redisUrl) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and REDIS_URL for the alert worker.');
}

const database = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const redis = new URL(redisUrl);
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: decodeURIComponent(redis.username || ''),
  password: decodeURIComponent(redis.password || ''),
  ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
  ...(redis.pathname.length > 1 ? { db: Number(redis.pathname.slice(1)) } : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

function isOnShift(contact, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  const current = hour * 60 + minute;
  const start = Number(String(contact.shift_start).slice(0, 2)) * 60 + Number(String(contact.shift_start).slice(3, 5));
  const end = Number(String(contact.shift_end).slice(0, 2)) * 60 + Number(String(contact.shift_end).slice(3, 5));
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

async function getOrderResponse(orderId, applicationId) {
  const { data, error } = await database.from('merchant_fulfillment_events')
    .select('event_type')
    .eq('order_id', orderId)
    .eq('application_id', applicationId)
    .in('event_type', ['accepted', 'rejected'])
    .limit(1);
  if (error) throw error;
  return data?.[0]?.event_type || null;
}

async function claimDelivery({ orderId, applicationId, contactId, channel, step, recipientKey }) {
  const row = {
    order_id: orderId,
    application_id: applicationId,
    contact_id: contactId,
    channel,
    step,
    recipient_key: recipientKey,
    status: 'sending',
    sent_at: new Date().toISOString()
  };
  const { data, error } = await database.from('merchant_order_alert_log')
    .upsert(row, {
      onConflict: 'order_id,application_id,channel,step,recipient_key',
      ignoreDuplicates: true
    })
    .select('id,status,sent_at,attempt_count')
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;

  const { data: existing, error: existingError } = await database.from('merchant_order_alert_log')
    .select('id,status,sent_at,attempt_count')
    .eq('order_id', orderId)
    .eq('application_id', applicationId)
    .eq('channel', channel)
    .eq('step', step)
    .eq('recipient_key', recipientKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing || ['sent', 'delivered', 'opened', 'accepted', 'stopped', 'missed', 'no_device'].includes(existing.status)) {
    return null;
  }
  const oldSentAt = existing.sent_at ? new Date(existing.sent_at).getTime() : 0;
  if (existing.status === 'sending' && Date.now() - oldSentAt < 120_000) return null;
  const { error: updateError } = await database.from('merchant_order_alert_log')
    .update({
      status: 'sending',
      error: null,
      sent_at: new Date().toISOString(),
      attempt_count: (existing.attempt_count || 1) + 1
    })
    .eq('id', existing.id);
  if (updateError) throw updateError;
  return existing.id;
}

async function recordAlert(id, patch) {
  const { error } = await database.from('merchant_order_alert_log').update(patch).eq('id', id);
  if (error) throw error;
}

async function loadContactRecipients(applicationId, channel) {
  const { data, error } = await database.from('merchant_alert_contacts')
    .select('id,name,phone,role,channels,shift_start,shift_end,language,active')
    .eq('application_id', applicationId)
    .eq('active', true)
    .contains('channels', [channel]);
  if (error) throw error;
  return (data || []).filter(isOnShift);
}

async function sendSms(contact, job, step) {
  const alertId = await claimDelivery({
    orderId: job.orderId,
    applicationId: job.applicationId,
    contactId: contact.id,
    channel: 'sms',
    step,
    recipientKey: contact.id
  });
  if (!alertId) return;
  if (!accountSid || !authToken || !twilioNumber) {
    const message = 'Twilio SMS is not configured.';
    await recordAlert(alertId, { status: 'failed', error: message });
    throw new Error(message);
  }
  const responseState = await getOrderResponse(job.orderId, job.applicationId);
  if (responseState) {
    await recordAlert(alertId, { status: 'stopped', error: `Merchant ${responseState} before SMS delivery.` });
    return;
  }

  const message = contact.language === 'sw'
    ? `Online Bar: Agizo jipya #${job.orderId} la ${job.merchantName}. Fungua programu sasa kukubali au kukataa.`
    : `Online Bar: New order #${job.orderId} for ${job.merchantName}. Open the app now to accept or decline.`;
  const form = new URLSearchParams({ To: contact.phone, From: twilioNumber, Body: message });
  form.set('StatusCallback', `${publicBaseUrl}/api/webhooks/twilio/merchant-alert/status`);
  const providerResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const providerPayload = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok || typeof providerPayload.sid !== 'string') {
    const message = typeof providerPayload.message === 'string' ? providerPayload.message : `Twilio SMS failed (${providerResponse.status}).`;
    await recordAlert(alertId, { status: 'failed', error: message.slice(0, 1000) });
    throw new Error(message);
  }
  await recordAlert(alertId, { status: 'sent', provider_id: providerPayload.sid, sent_at: new Date().toISOString(), error: null });
}

function makeVoiceToken(job, contact) {
  if (!voiceSecret) throw new Error('TWILIO_ALERT_TOKEN_SECRET is not configured.');
  const payload = Buffer.from(JSON.stringify({
    orderId: job.orderId,
    applicationId: job.applicationId,
    contactId: contact.id,
    expiresAt: Date.now() + 180_000
  })).toString('base64url');
  const signature = createHmac('sha256', voiceSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function callContact(contact, job) {
  const alertId = await claimDelivery({
    orderId: job.orderId,
    applicationId: job.applicationId,
    contactId: contact.id,
    channel: 'voice',
    step: 'voice_60s',
    recipientKey: contact.id
  });
  if (!alertId) return;
  if (!accountSid || !authToken || !twilioNumber) {
    const message = 'Twilio voice is not configured.';
    await recordAlert(alertId, { status: 'failed', error: message });
    throw new Error(message);
  }
  const responseState = await getOrderResponse(job.orderId, job.applicationId);
  if (responseState) {
    await recordAlert(alertId, { status: 'stopped', error: `Merchant ${responseState} before voice call.` });
    return;
  }

  const token = makeVoiceToken(job, contact);
  const voiceUrl = new URL('/api/webhooks/twilio/merchant-alert/voice', publicBaseUrl);
  voiceUrl.searchParams.set('token', token);
  const form = new URLSearchParams({
    To: contact.phone,
    From: twilioNumber,
    Url: voiceUrl.toString(),
    Method: 'POST',
    StatusCallback: `${publicBaseUrl}/api/webhooks/twilio/merchant-alert/status?channel=voice`,
    StatusCallbackMethod: 'POST',
    StatusCallbackEvent: 'initiated ringing answered completed'
  });
  const providerResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const providerPayload = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok || typeof providerPayload.sid !== 'string') {
    const message = typeof providerPayload.message === 'string' ? providerPayload.message : `Twilio voice call failed (${providerResponse.status}).`;
    await recordAlert(alertId, { status: 'failed', error: message.slice(0, 1000) });
    throw new Error(message);
  }
  await recordAlert(alertId, { status: 'sent', provider_id: providerPayload.sid, sent_at: new Date().toISOString(), error: null });
}

async function processChannel(job, channel) {
  const responseState = await getOrderResponse(job.orderId, job.applicationId);
  const step = channel === 'sms' ? 'sms_20s' : 'voice_60s';
  const contacts = await loadContactRecipients(job.applicationId, channel);
  if (responseState) {
    for (const contact of contacts) {
      const alertId = await claimDelivery({
        orderId: job.orderId,
        applicationId: job.applicationId,
        contactId: contact.id,
        channel,
        step,
        recipientKey: contact.id
      });
      if (alertId) {
        await recordAlert(alertId, { status: 'stopped', error: `Merchant ${responseState} before ${channel} step.` });
      }
    }
    return;
  }
  for (const contact of contacts) {
    const state = await getOrderResponse(job.orderId, job.applicationId);
    if (state) {
      const alertId = await claimDelivery({
        orderId: job.orderId,
        applicationId: job.applicationId,
        contactId: contact.id,
        channel,
        step,
        recipientKey: contact.id
      });
      if (alertId) await recordAlert(alertId, { status: 'stopped', error: `Merchant ${state} before ${channel} step.` });
      return;
    }
    if (channel === 'sms') await sendSms(contact, job, 'sms_20s');
    else await callContact(contact, job);
  }
}

async function processTimeout(job) {
  const { data, error } = await database.rpc('expire_merchant_order_alert', {
    p_order_id: job.orderId,
    p_application_id: job.applicationId
  });
  if (error) throw error;
  const state = typeof data?.status === 'string' ? data.status : 'unknown';
  const { error: logError } = await database.from('merchant_order_alert_log').upsert({
    order_id: job.orderId,
    application_id: job.applicationId,
    contact_id: null,
    channel: 'timeout',
    step: 'timeout_90s',
    recipient_key: 'scheduler',
    status: state === 'missed' ? 'missed' : state === 'already_answered' ? 'stopped' : 'failed',
    error: state === 'missed' ? null : `Timeout was not applied: ${state}`,
    sent_at: new Date().toISOString()
  }, {
    onConflict: 'order_id,application_id,channel,step,recipient_key',
    ignoreDuplicates: true
  });
  if (logError) throw logError;
  console.log(`[MerchantOrderAlerts] Order #${job.orderId}, merchant ${job.applicationId}: ${state}`);
  if (state === 'missed' || state === 'already_answered') {
    if (!internalApiSecret) throw new Error('INTERNAL_API_SECRET is required to alert the next allocated merchant.');
    const response = await fetch(`${publicBaseUrl}/api/internal/merchant-alerts/dispatch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${internalApiSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderId: job.orderId })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Could not alert the next allocated merchant (${response.status}): ${body.slice(0, 500)}`);
    }
  }
}

async function processRiderSms(job) {
  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,rider_phone')
    .eq('id', job.orderId)
    .maybeSingle();
  if (orderError) throw orderError;

  const alertId = await database.rpc('claim_rider_order_alert', {
    p_order_id: job.orderId,
    p_rider_phone: job.riderPhone,
    p_channel: 'sms',
    p_step: 'sms_10s',
    p_recipient_key: job.riderPhone
  });
  if (alertId.error) throw alertId.error;
  if (typeof alertId.data !== 'string') return;

  if (!order || order.rider_phone !== job.riderPhone || order.status !== 'Dispatched') {
    const { error } = await database.from('rider_order_alert_log')
      .update({ status: 'stopped', error: 'The rider assignment changed before SMS delivery.' })
      .eq('id', alertId.data);
    if (error) throw error;
    return;
  }
  if (!accountSid || !authToken || !twilioNumber) {
    const message = 'Twilio SMS is not configured for rider alerts.';
    const { error } = await database.from('rider_order_alert_log')
      .update({ status: 'failed', error: message })
      .eq('id', alertId.data);
    if (error) throw error;
    throw new Error(message);
  }

  const form = new URLSearchParams({
    To: job.riderPhone,
    From: twilioNumber,
    Body: `Online Bar: You have been assigned delivery order #${job.orderId}. Open Rider Command: ${publicBaseUrl}/rider/dashboard?orderId=${job.orderId}`
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.sid !== 'string') {
    const message = typeof payload.message === 'string'
      ? payload.message
      : `Twilio rider SMS failed (${response.status}).`;
    const { error } = await database.from('rider_order_alert_log')
      .update({ status: 'failed', error: message.slice(0, 1000) })
      .eq('id', alertId.data);
    if (error) throw error;
    throw new Error(message);
  }

  const { error } = await database.from('rider_order_alert_log')
    .update({
      status: 'sent',
      provider_id: payload.sid,
      sent_at: new Date().toISOString(),
      error: null
    })
    .eq('id', alertId.data);
  if (error) throw error;
}

async function processJob(job) {
  if (job.name === 'sms') return processChannel(job.data, 'sms');
  if (job.name === 'voice') return processChannel(job.data, 'voice');
  if (job.name === 'timeout') return processTimeout(job.data);
  if (job.name === 'rider-sms') return processRiderSms(job.data);
  throw new Error(`Unknown merchant alert job: ${job.name}`);
}

const worker = new Worker(queueName, processJob, {
  connection,
  concurrency: 20,
  limiter: { max: 30, duration: 1000 }
});

async function heartbeat() {
  const { error } = await database.from('merchant_alert_worker_heartbeats').upsert({
    worker_key: 'default',
    last_seen_at: new Date().toISOString()
  });
  if (error) console.error('[MerchantOrderAlerts] Worker heartbeat failed:', error.message);
}

await heartbeat();
const heartbeatTimer = setInterval(() => void heartbeat(), 30_000);
worker.on('completed', job => console.log(`[MerchantOrderAlerts] Completed ${job.name} for order #${job.data.orderId}`));
worker.on('failed', (job, error) => console.error(`[MerchantOrderAlerts] Failed ${job?.name || 'job'}:`, error.message));
worker.on('error', error => console.error('[MerchantOrderAlerts] Worker error:', error.message));
console.log(`[MerchantOrderAlerts] Worker listening on queue "${queueName}".`);

async function shutdown(signal) {
  console.log(`[MerchantOrderAlerts] Shutting down on ${signal}.`);
  clearInterval(heartbeatTimer);
  await worker.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
