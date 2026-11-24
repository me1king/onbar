import { NextResponse } from 'next/server';
import {
  CUSTOMER_NOTIFICATION_CHANNELS,
  CUSTOMER_NOTIFICATION_STATUSES,
  isValidCustomerEmailDesign,
  normalizeCustomerNotificationConfig,
  normalizeCustomerContactKey
} from '@/lib/customerMessaging';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { getTransactionalEmailConfig } from '@/lib/jmsurfMail.server';
import { isWebPushConfigured } from '@/lib/webPush.server';

export const dynamic = 'force-dynamic';

async function getAdminDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_communications')) {
    return { response: NextResponse.json({ error: 'Communications permission required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  return { database };
}

export async function GET() {
  const access = await getAdminDatabase();
  if ('response' in access) return access.response;

  const [settingResult, ordersResult, preferencesResult, deliveryResult] = await Promise.all([
    access.database.from('settings').select('value').eq('key', 'customer_messaging').maybeSingle(),
    access.database.from('orders')
      .select('id, customer_name, customer_email, customer_phone')
      .order('id', { ascending: false })
      .limit(1000),
    access.database.from('customer_notification_preferences')
      .select('channel_key, channels'),
    access.database.from('customer_notification_deliveries')
      .select('id,order_id,notification_status,channel,delivery_status,error_message,provider_delivery_status,provider_updated_at,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  if (settingResult.error || ordersResult.error || preferencesResult.error || deliveryResult.error) {
    const failures = [
      { source: 'settings', error: settingResult.error },
      { source: 'orders', error: ordersResult.error },
      { source: 'preferences', error: preferencesResult.error },
      { source: 'deliveries', error: deliveryResult.error }
    ].filter((entry): entry is { source: string; error: NonNullable<typeof settingResult.error> } => Boolean(entry.error));
    console.error('[CustomerMessaging] Could not load automation settings:', failures);
    const migrationFiles = new Set<string>();
    for (const { source, error: failure } of failures) {
      const detail = `${failure.code || ''} ${failure.message || ''}`;
      if (source === 'preferences' || source === 'deliveries') {
        migrationFiles.add('CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql');
      }
      if (/provider_delivery_status|provider_updated_at|provider_message_id/i.test(detail)) {
        migrationFiles.add('JMSURF_EMAIL_WEBHOOK_MIGRATION.sql');
      }
      if (source === 'settings' || source === 'orders') {
        migrationFiles.add('the base OnlineBar database migrations for settings and orders');
      }
    }
    const migrationAdvice = migrationFiles.size
      ? `Check/install: ${[...migrationFiles].join(', ')}.`
      : 'Check the server log for the database error.';
    return NextResponse.json({
      error: `Could not load customer messaging settings. ${migrationAdvice}`,
      migrationFiles: [...migrationFiles]
    }, { status: 503 });
  }

  const deliveryOrderIds = [...new Set((deliveryResult.data || []).map(item => item.order_id))];
  const deliveryOrdersResult = deliveryOrderIds.length
    ? await access.database.from('orders')
      .select('id,customer_name,customer_email,customer_phone')
      .in('id', deliveryOrderIds)
    : { data: [], error: null };
  if (deliveryOrdersResult.error) {
    console.error('[CustomerMessaging] Could not resolve delivery log recipients:', deliveryOrdersResult.error);
    return NextResponse.json({ error: 'Recent notification recipients could not be loaded.' }, { status: 500 });
  }

  const preferences = new Map((preferencesResult.data || []).map(item => [item.channel_key, item.channels]));
  const deliveryCustomers = new Map((deliveryOrdersResult.data || []).map(order => [order.id, {
    name: order.customer_name || 'Customer',
    email: order.customer_email || '',
    phone: order.customer_phone || ''
  }]));
  const seen = new Set<string>();
  const customers = (ordersResult.data || []).flatMap(order => {
    const email = (order.customer_email || '').trim();
    const phone = (order.customer_phone || '').trim();
    const key = normalizeCustomerContactKey(email, phone);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{
      key,
      name: order.customer_name || 'Customer',
      email,
      phone,
      latestOrderId: order.id,
      channels: preferences.get(key) || null
    }];
  });

  return NextResponse.json({
    config: normalizeCustomerNotificationConfig(settingResult.data?.value),
    customers,
    providers: {
      email: getTransactionalEmailConfig().configured,
      whatsapp: Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim()),
      sms: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_PHONE_NUMBER?.trim()),
      push: isWebPushConfigured()
    },
    deliveries: (deliveryResult.data || []).map(delivery => ({
      ...delivery,
      customer: deliveryCustomers.get(delivery.order_id) || null
    }))
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await getAdminDatabase();
  if ('response' in access) return access.response;

  let body: { config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Valid notification settings are required.' }, { status: 400 });
  }

  const config = normalizeCustomerNotificationConfig(body.config);
  if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)
    || CUSTOMER_NOTIFICATION_STATUSES.some(status => {
      const rule = (body.config as Record<string, unknown>)[status];
      if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) return true;
      const value = rule as Record<string, unknown>;
      return typeof value.enabled !== 'boolean'
        || !Array.isArray(value.channels)
        || value.channels.some(channel => !CUSTOMER_NOTIFICATION_CHANNELS.includes(channel as typeof CUSTOMER_NOTIFICATION_CHANNELS[number]))
        || new Set(value.channels).size !== value.channels.length
        || typeof value.subject !== 'string'
        || !value.subject.trim()
        || value.subject.length > 180
        || typeof value.message !== 'string'
        || !value.message.trim()
        || value.message.length > 2000
        || !isValidCustomerEmailDesign(value)
        || (value.smsMessage !== undefined
          && (typeof value.smsMessage !== 'string' || !value.smsMessage.trim() || value.smsMessage.length > 2000));
    })) {
    return NextResponse.json({ error: 'Notification settings are invalid.' }, { status: 400 });
  }

  const { error } = await access.database.from('settings').upsert({
    key: 'customer_messaging',
    value: config,
    is_published: false,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[CustomerMessaging] Could not save automation settings:', error);
    return NextResponse.json({ error: 'Could not save customer messaging settings.' }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await getAdminDatabase();
  if ('response' in access) return access.response;

  let body: { email?: unknown; phone?: unknown; channels?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Valid customer channel settings are required.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 320) : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
  if (!Array.isArray(body.channels)
    || body.channels.some(channel => !CUSTOMER_NOTIFICATION_CHANNELS.includes(channel as typeof CUSTOMER_NOTIFICATION_CHANNELS[number]))
    || new Set(body.channels).size !== body.channels.length) {
    return NextResponse.json({ error: 'Select valid notification channels.' }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid customer email.' }, { status: 400 });
  }
  const key = normalizeCustomerContactKey(email, phone);
  if (!key) return NextResponse.json({ error: 'A customer email or phone number is required.' }, { status: 400 });

  const { error } = await access.database.from('customer_notification_preferences').upsert({
    channel_key: key,
    customer_email: email || null,
    customer_phone: phone || null,
    channels: body.channels,
    updated_at: new Date().toISOString()
  }, { onConflict: 'channel_key' });
  if (error) {
    console.error('[CustomerMessaging] Could not save customer preferences:', error);
    return NextResponse.json({ error: 'Could not save this customer’s channel preferences. Apply the customer messaging migration and try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
