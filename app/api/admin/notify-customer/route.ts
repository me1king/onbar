import { NextResponse } from 'next/server';
import {
  CUSTOMER_NOTIFICATION_CHANNELS,
  normalizeCustomerNotificationConfig,
  normalizeCustomerContactKey,
  type CustomerNotificationRule,
  type CustomerNotificationChannel,
  type CustomerNotificationStatus
} from '@/lib/customerMessaging';
import { getAdminSession, hasAdminPermission, isInternalRequest, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from '@/lib/utils';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { getCustomerOrderEmailDesign, renderCustomerOrderEmail, renderCustomerOrderEmailText } from '@/lib/customerOrderEmail';
import { isWebPushConfigured, sendWebPush } from '@/lib/webPush.server';

type NotificationBody = { orderId?: unknown; status?: unknown; retryChannel?: unknown };

const SUPPORTED_TEMPLATE_VARIABLES = new Set([
  'name',
  'orderId',
  'status',
  'trackingUrl',
  'customer_name',
  'order_id',
  'total',
  'payment_method',
  'payment_receipt',
  'rider_name',
  'rider_phone',
  'eta',
  'tracking_link'
]);

function renderTemplate(
  template: string,
  name: string,
  order: {
    id: number;
    total_price: number | string;
    rider_name: string | null;
    rider_phone: string | null;
    delivery_eta_minutes: number | null;
    payment_method: string | null;
  },
  trackingUrl: string,
  status: CustomerNotificationStatus,
  paymentReceipt = '',
  paymentMethod = order.payment_method || ''
) {
  const amount = Number(order.total_price);
  const variables: Record<string, string> = {
    name,
    orderId: String(order.id),
    status,
    trackingUrl,
    customer_name: name,
    order_id: String(order.id),
    total: Number.isFinite(amount)
      ? `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '',
    payment_method: paymentMethod,
    payment_receipt: paymentReceipt,
    rider_name: order.rider_name || '',
    rider_phone: maskPhone(order.rider_phone || ''),
    eta: order.delivery_eta_minutes == null ? '' : `${order.delivery_eta_minutes} mins`,
    tracking_link: trackingUrl
  };
  return template.replace(/\{([a-zA-Z_]+)\}/g, (match, token: string) => variables[token] ?? match);
}

function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('254')) return digits;
  return digits;
}

function maskPhone(phone: string): string {
  const digits = toInternationalPhone(phone);
  return digits.length >= 4 ? `****${digits.slice(-4)}` : '';
}

async function sendEmail(
  to: string,
  subject: string,
  message: string,
  trackingUrl: string,
  status: CustomerNotificationStatus,
  order: { id: number; total_price: number | string },
  rule: CustomerNotificationRule
) {
  const design = getCustomerOrderEmailDesign(rule);
  const email = {
    ...design,
    message,
    orderId: String(order.id),
    total: `KES ${Number(order.total_price).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    status,
    trackingUrl
  };
  return sendTransactionalEmail({
    to,
    subject,
    html: renderCustomerOrderEmail(email),
    text: renderCustomerOrderEmailText(email)
  });
}

async function sendWhatsApp(phone: string, message: string) {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  if (!token || !phoneId) throw new Error('WhatsApp is not configured (WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are required).');
  const recipient = toInternationalPhone(phone);
  if (!/^\d{8,15}$/.test(recipient)) throw new Error('Customer phone number is not valid for WhatsApp.');

  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: { body: message }
    })
  });
  if (!response.ok) {
    console.error('[CustomerNotification] WhatsApp provider rejected a notification:', response.status);
    throw new Error('WhatsApp provider rejected the notification.');
  }
}

async function sendSms(phone: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    throw new Error('SMS is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are required).');
  }
  const recipient = toInternationalPhone(phone);
  if (!/^\d{8,15}$/.test(recipient)) throw new Error('Customer phone number is not valid for SMS.');

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: `+${recipient}`, From: from, Body: message })
  });
  if (!response.ok) {
    console.error('[CustomerNotification] SMS provider rejected a notification:', response.status);
    throw new Error('SMS provider rejected the notification.');
  }
  const result = await response.json() as { sid?: string };
  return result.sid;
}

async function claimDelivery(
  database: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  orderId: number,
  status: CustomerNotificationStatus,
  channel: CustomerNotificationChannel
) {
  const identity = { order_id: orderId, notification_status: status, channel };
  const { data: inserted, error: insertError } = await database
    .from('customer_notification_deliveries')
    .upsert({ ...identity, delivery_status: 'sending', error_message: null, updated_at: new Date().toISOString() }, {
      onConflict: 'order_id,notification_status,channel',
      ignoreDuplicates: true
    })
    .select('id')
    .maybeSingle();
  if (insertError) throw insertError;
  if (inserted) return { claimed: true, id: inserted.id };

  const { data: existing, error: lookupError } = await database
    .from('customer_notification_deliveries')
    .select('id, delivery_status, updated_at')
    .match(identity)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('Could not claim the customer notification delivery.');
  if (existing.delivery_status === 'sent') return { claimed: false, id: existing.id };

  const staleSending = existing.delivery_status === 'sending'
    && Date.now() - new Date(existing.updated_at).getTime() > 10 * 60 * 1000;
  if (existing.delivery_status !== 'failed' && !staleSending) return { claimed: false, id: existing.id };

  const { data: reclaimed, error: reclaimError } = await database
    .from('customer_notification_deliveries')
    .update({ delivery_status: 'sending', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('delivery_status', existing.delivery_status)
    .eq('updated_at', existing.updated_at)
    .select('id')
    .maybeSingle();
  if (reclaimError) throw reclaimError;
  return { claimed: Boolean(reclaimed), id: existing.id };
}

export async function POST(request: Request) {
  const internal = isInternalRequest(request);
  const session = internal ? null : await getAdminSession();

  if (!internal && !session) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  }
  if (!internal && !hasAdminPermission(session, 'can_manage_communications')) {
    return NextResponse.json({ error: 'Communications permission required.' }, { status: 403 });
  }
  if (!internal && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  let body: NotificationBody;
  try {
    body = await request.json() as NotificationBody;
  } catch {
    return NextResponse.json({ error: 'A valid order notification is required.' }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  const status = body.status;
  if (!Number.isSafeInteger(orderId) || orderId < 1
    || !['Pending', 'Payment Failed', 'Paid', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'].includes(String(status))) {
    return NextResponse.json({ error: 'A valid order and notification status are required.' }, { status: 400 });
  }
  if (internal && !['Pending', 'Payment Failed', 'Paid', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'].includes(String(status))) {
    return NextResponse.json({ error: 'This delivery status cannot be sent as an internal notification.' }, { status: 403 });
  }
  const retryChannel = body.retryChannel;
  if (retryChannel !== undefined && !CUSTOMER_NOTIFICATION_CHANNELS.includes(retryChannel as CustomerNotificationChannel)) {
    return NextResponse.json({ error: 'Choose a valid notification channel to retry.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Order verification is not configured.' }, { status: 503 });

  const { data: order, error: orderError } = await database
    .from('orders')
    .select('id, user_id, customer_email, customer_name, customer_phone, status, total_price, payment_method, checkout_request_id, rider_name, rider_phone, delivery_eta_minutes, notification_sms_opt_in, notification_whatsapp_opt_in')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[CustomerNotification] Could not verify order:', orderError);
    return NextResponse.json({ error: 'Could not verify the order.' }, { status: 500 });
  }
  if (!order || order.status !== status) {
    return NextResponse.json({ error: 'The order does not currently have that status.' }, { status: 409 });
  }

  let paymentReceipt = typeof order.checkout_request_id === 'string' ? order.checkout_request_id : '';
  let paymentMethod = order.payment_method || '';
  if (status === 'Delivered') {
    const { data: payment, error: paymentError } = await database.from('rider_delivery_payment_attempts')
      .select('payment_method,receipt_number,provider_reference')
      .eq('order_id', orderId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) {
      console.error('[CustomerNotification] Could not load the completed-order receipt:', paymentError);
      return NextResponse.json({
        error: /rider_delivery_payment_attempts|schema cache/i.test(paymentError.message)
          ? 'Doorstep payment records are not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql.'
          : 'The completed-order receipt could not be loaded.'
      }, { status: 503 });
    }
    paymentReceipt = payment?.receipt_number || payment?.provider_reference || paymentReceipt;
    paymentMethod = payment?.payment_method || paymentMethod;
  }

  const email = (order.customer_email || '').trim();
  const phone = (order.customer_phone || '').trim();
  if (!email && !phone) return NextResponse.json({ error: 'The order has no customer email or phone number.' }, { status: 409 });

  const channelKey = normalizeCustomerContactKey(email, phone);
  if (!channelKey) return NextResponse.json({ error: 'A valid customer email or phone is required.' }, { status: 409 });
  const [settingResult, preferenceResult] = await Promise.all([
    database.from('settings').select('value').eq('key', 'customer_messaging').maybeSingle(),
    database.from('customer_notification_preferences').select('channels').eq('channel_key', channelKey).maybeSingle()
  ]);
  if (settingResult.error || preferenceResult.error) {
    const error = settingResult.error || preferenceResult.error;
    console.error('[CustomerNotification] Could not load delivery preferences:', error);
    return NextResponse.json({ error: 'Could not load customer messaging settings.' }, { status: 500 });
  }

  const config = normalizeCustomerNotificationConfig(settingResult.data?.value);
  const rule = config[status as CustomerNotificationStatus];
  if (!rule.enabled) return NextResponse.json({ ok: true, sent: [], skipped: ['Notifications are disabled for this order status.'] });
  const unsupportedVariables = [...`${rule.subject}\n${rule.message}\n${rule.smsMessage}`.matchAll(/\{([a-zA-Z_]+)\}/g)]
    .map(match => match[1])
    .filter(token => !SUPPORTED_TEMPLATE_VARIABLES.has(token));
  if (unsupportedVariables.length) {
    return NextResponse.json({
      error: `Unsupported template variable(s): ${[...new Set(unsupportedVariables)].map(token => `{${token}}`).join(', ')}.`
    }, { status: 422 });
  }

  const allowedChannels = rule.channels.filter(channel => {
    if (channel === 'push') return true;
    if (preferenceResult.data?.channels) return preferenceResult.data.channels.includes(channel);
    if (channel === 'sms') return order.notification_sms_opt_in === true;
    if (channel === 'whatsapp') return order.notification_whatsapp_opt_in === true;
    return true;
  });
  if (retryChannel && !allowedChannels.includes(retryChannel as CustomerNotificationChannel)) {
    return NextResponse.json({ error: 'This channel is no longer enabled for the customer. Update preferences before retrying.' }, { status: 409 });
  }
  const channels = retryChannel
    ? [retryChannel as CustomerNotificationChannel]
    : allowedChannels;
  const trackingUrl = `${getPublicBaseUrl()}/track?id=${encodeURIComponent(String(orderId))}`;
  const name = order.customer_name || 'there';
  const subject = renderTemplate(rule.subject, name, order, trackingUrl, status as CustomerNotificationStatus, paymentReceipt, paymentMethod);
  const message = renderTemplate(rule.message, name, order, trackingUrl, status as CustomerNotificationStatus, paymentReceipt, paymentMethod);
  const smsTemplate = rule.smsMessage || rule.message;
  const smsMessage = renderTemplate(smsTemplate, name, order, trackingUrl, status as CustomerNotificationStatus, paymentReceipt, paymentMethod);
  const results: { channel: CustomerNotificationChannel; status: string; error?: string }[] = [];

  for (const channel of channels) {
    if (channel === 'push' && (!order.user_id || !isWebPushConfigured())) {
      results.push({
        channel,
        status: 'skipped',
        error: !order.user_id
          ? 'This order is not linked to a signed-in customer account.'
          : 'Web Push is not configured on the server.'
      });
      continue;
    }
    if ((channel === 'email' && !email) || (channel !== 'email' && !phone)) {
      if (channel === 'push') {
        results.push({ channel, status: 'skipped', error: 'No customer push destination is available.' });
        continue;
      }
      results.push({ channel, status: 'skipped', error: channel === 'email' ? 'No customer email is available.' : 'No customer phone is available.' });
      continue;
    }
    try {
      let pushSubscriptions: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
      if (channel === 'push') {
        const { data, error } = await database
          .from('customer_push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', order.user_id);
        if (error) throw error;
        pushSubscriptions = data || [];
        if (!pushSubscriptions.length) {
          results.push({ channel, status: 'skipped', error: 'The customer has not enabled push alerts on a device.' });
          continue;
        }
      }

      const claim = await claimDelivery(database, orderId, status as CustomerNotificationStatus, channel);
      if (!claim.claimed) {
        results.push({ channel, status: 'already_sent_or_in_progress' });
        continue;
      }
      try {
        let providerMessageId: string | undefined;
        if (channel === 'email') {
          const sent = await sendEmail(email, subject, message, trackingUrl, status as CustomerNotificationStatus, order, rule);
          providerMessageId = sent.messageId;
        }
        if (channel === 'whatsapp') await sendWhatsApp(phone, message);
        if (channel === 'sms') providerMessageId = await sendSms(phone, smsMessage);
        let pushFailures = 0;
        if (channel === 'push') {
          const pushMessage: Record<CustomerNotificationStatus, string> = {
            Pending: 'We received your order. Payment may still be pending.',
            'Payment Failed': 'Payment was not confirmed. Check your account to retry.',
            Paid: 'Payment confirmed. We are preparing your order.',
            Dispatched: 'A rider has been assigned to your order.',
            'Picked Up': 'Your order has been picked up.',
            'Out for Delivery': 'Your order is on its way.',
            Delivered: 'Your order has been delivered.'
          };
          const outcomes = await Promise.allSettled(pushSubscriptions.map(subscription => sendWebPush(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            {
              title: 'Order update',
              body: pushMessage[status as CustomerNotificationStatus],
              url: `/track?id=${encodeURIComponent(String(orderId))}`,
              tag: `order-${orderId}`
            }
          )));
          const expiredEndpoints = pushSubscriptions
            .filter((_, index) => {
              const outcome = outcomes[index];
              return outcome.status === 'rejected'
                && typeof outcome.reason === 'object'
                && outcome.reason !== null
                && 'statusCode' in outcome.reason
                && [404, 410].includes(Number(outcome.reason.statusCode));
            })
            .map(subscription => subscription.endpoint);
          if (expiredEndpoints.length) {
            const { error: cleanupError } = await database
              .from('customer_push_subscriptions')
              .delete()
              .in('endpoint', expiredEndpoints);
            if (cleanupError) console.error('[CustomerNotification] Could not remove expired push endpoints:', cleanupError);
          }
          pushFailures = outcomes.filter(outcome => outcome.status === 'rejected').length;
          if (pushFailures === outcomes.length) throw new Error('Push provider rejected delivery to every subscribed device.');
        }
        const { error } = await database.from('customer_notification_deliveries')
          .update({
            delivery_status: 'sent',
            error_message: pushFailures
              ? `Push was accepted by some devices but failed for ${pushFailures} device(s).`
              : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', claim.id);
        if (error) throw error;
        if (providerMessageId) {
          const { error: providerIdError } = await database.from('customer_notification_deliveries')
            .update({ provider_message_id: providerMessageId })
            .eq('id', claim.id);
          if (providerIdError) {
            console.error('[CustomerNotification] Email was sent, but the provider message ID could not be saved:', providerIdError);
          }
        }
        results.push({ channel, status: 'sent' });
      } catch (sendError) {
        const detail = sendError instanceof Error ? sendError.message : 'Provider delivery failed.';
        const { error: logError } = await database.from('customer_notification_deliveries')
          .update({ delivery_status: 'failed', error_message: detail.slice(0, 500), updated_at: new Date().toISOString() })
          .eq('id', claim.id);
        if (logError) console.error('[CustomerNotification] Could not record delivery failure:', logError);
        results.push({ channel, status: 'failed', error: detail });
      }
    } catch (deliveryError) {
      console.error(`[CustomerNotification] Could not process ${channel} delivery:`, deliveryError);
      results.push({ channel, status: 'failed', error: 'Could not process this delivery.' });
    }
  }

  const failed = results.some(result => result.status === 'failed');
  return NextResponse.json({ ok: !failed, results }, { status: failed ? 502 : 200 });
}
