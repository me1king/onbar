import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getMerchantAlertConfiguration, sendMerchantAlertTest } from '@/lib/merchantOrderAlerts.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Clients = { auth: SupabaseClient; database: SupabaseClient };
const allowedChannels = ['push', 'sms', 'voice'] as const;
type AlertChannel = typeof allowedChannels[number];

function getClients(): Clients | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

async function getContext(request: Request, applicationId: unknown) {
  const clients = getClients();
  if (!clients) return { response: NextResponse.json({ error: 'Merchant access is not configured on this server.' }, { status: 503 }) };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: 'Sign in to manage order alerts.' }, { status: 401 }) };
  const { data: authData, error: authError } = await clients.auth.auth.getUser(token);
  const user = authData.user;
  if (authError || !user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
    return { response: NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 }) };
  }
  if (typeof applicationId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return { response: NextResponse.json({ error: 'Choose a valid business.' }, { status: 400 }) };
  }
  const { data: application, error } = await clients.database.from('merchant_applications')
    .select('id,business_name,status,email')
    .eq('id', applicationId)
    .eq('email', user.email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error('[MerchantAlerts] Could not verify business ownership:', error);
    return { response: NextResponse.json({ error: 'Business access could not be verified.' }, { status: 503 }) };
  }
  if (!application) return { response: NextResponse.json({ error: 'That business is not linked to your verified account.' }, { status: 404 }) };
  if (application.status !== 'approved') {
    return { response: NextResponse.json({ error: 'Only approved businesses can configure order alerts.' }, { status: 403 }) };
  }
  return { database: clients.database, application };
}

function validateContact(value: Record<string, unknown>) {
  const id = typeof value.id === 'string' ? value.id : null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const phone = typeof value.phone === 'string' ? value.phone.trim() : '';
  const role = typeof value.role === 'string' ? value.role.trim() : '';
  const channels = Array.isArray(value.channels) ? [...new Set(value.channels)] : [];
  const shiftStart = typeof value.shift_start === 'string' ? value.shift_start : '';
  const shiftEnd = typeof value.shift_end === 'string' ? value.shift_end : '';
  const language = value.language;
  if (!name || name.length > 120 || phone.length < 5 || phone.length > 40
    || role.length > 120
    || channels.length < 1 || channels.some(channel => !allowedChannels.includes(channel as AlertChannel))
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftStart)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftEnd)
    || !['en', 'sw'].includes(String(language))
    || (id !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    return null;
  }
  return {
    id,
    name,
    phone,
    role: role || null,
    channels: channels as AlertChannel[],
    shift_start: shiftStart,
    shift_end: shiftEnd,
    language: language as 'en' | 'sw',
    active: value.active === undefined ? true : value.active === true
  };
}

function isMissingAlertsMigration(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || /merchant_alert_contacts|merchant_push_subscriptions|merchant_order_alert_log|merchant_alert_worker_heartbeats/i.test(error.message || '');
}

function missingMigrationResponse() {
  return NextResponse.json({
    error: 'Merchant order-alert storage is not installed. Apply supabase/MERCHANT_ORDER_ALERTS_MIGRATION.sql after the merchant and dispatch migrations.'
  }, { status: 503 });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const context = await getContext(request, query.get('applicationId'));
  if ('response' in context) return context.response;

  const [
    { data: contacts, error: contactsError },
    { data: devices, error: devicesError },
    { data: alerts, error: alertsError },
    { data: heartbeat, error: heartbeatError }
  ] = await Promise.all([
    context.database.from('merchant_alert_contacts')
      .select('id,name,phone,role,channels,shift_start,shift_end,language,active')
      .eq('application_id', context.application.id)
      .order('created_at'),
    context.database.from('merchant_push_subscriptions')
      .select('id,contact_id,user_agent,last_seen_at')
      .eq('application_id', context.application.id)
      .order('last_seen_at', { ascending: false }),
    context.database.from('merchant_order_alert_log')
      .select('id,order_id,contact_id,channel,step,status,error,sent_at,delivered_at,accepted_at,created_at')
      .eq('application_id', context.application.id)
      .order('created_at', { ascending: false })
      .limit(100),
    context.database.from('merchant_alert_worker_heartbeats')
      .select('last_seen_at')
      .eq('worker_key', 'default')
      .maybeSingle()
  ]);
  const queryError = contactsError || devicesError || alertsError || heartbeatError;
  if (queryError) {
    if (isMissingAlertsMigration(queryError)) return missingMigrationResponse();
    console.error('[MerchantAlerts] Could not load alert settings:', queryError);
    return NextResponse.json({ error: 'Order-alert settings could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({
    contacts: contacts || [],
    devices: devices || [],
    alerts: alerts || [],
    configuration: {
      ...getMerchantAlertConfiguration(),
      workerLastSeenAt: heartbeat?.last_seen_at || null,
      workerHealthy: Boolean(heartbeat?.last_seen_at
        && Date.now() - new Date(heartbeat.last_seen_at).getTime() < 90_000)
    }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid alert setting is required.' }, { status: 400 });
  }
  const context = await getContext(request, body.applicationId);
  if ('response' in context) return context.response;

  if (body.operation === 'contact') {
    const contact = validateContact(body.contact && typeof body.contact === 'object' && !Array.isArray(body.contact)
      ? body.contact as Record<string, unknown>
      : {});
    if (!contact || contact.id) return NextResponse.json({ error: 'Enter a valid new alert contact.' }, { status: 400 });
    const { data, error } = await context.database.from('merchant_alert_contacts').insert({
      application_id: context.application.id,
      name: contact.name,
      phone: contact.phone,
      role: contact.role,
      channels: contact.channels,
      shift_start: contact.shift_start,
      shift_end: contact.shift_end,
      language: contact.language,
      active: contact.active
    }).select('id,name,phone,role,channels,shift_start,shift_end,language,active').single();
    if (error) {
      if (isMissingAlertsMigration(error)) return missingMigrationResponse();
      if (error.code === '23505') return NextResponse.json({ error: 'That phone number is already on this business alert list.' }, { status: 409 });
      console.error('[MerchantAlerts] Could not add alert contact:', error);
      return NextResponse.json({ error: 'Alert contact could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ contact: data }, { status: 201 });
  }

  if (body.operation === 'subscribe') {
    const contactId = body.contactId;
    const subscription = body.subscription;
    if (typeof contactId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contactId)
      || !subscription || typeof subscription !== 'object' || Array.isArray(subscription)) {
      return NextResponse.json({ error: 'Choose a contact and provide a valid device subscription.' }, { status: 400 });
    }
    const data = subscription as Record<string, unknown>;
    const keys = data.keys && typeof data.keys === 'object' ? data.keys as Record<string, unknown> : {};
    const endpoint = data.endpoint;
    const p256dh = keys.p256dh;
    const auth = keys.auth;
    if (typeof endpoint !== 'string' || endpoint.length > 2048
      || typeof p256dh !== 'string' || p256dh.length > 256
      || typeof auth !== 'string' || auth.length > 256) {
      return NextResponse.json({ error: 'The browser device subscription is invalid.' }, { status: 400 });
    }
    try {
      const parsed = new URL(endpoint);
      const host = parsed.hostname.toLowerCase();
      const allowed = host === 'fcm.googleapis.com'
        || host === 'updates.push.services.mozilla.com'
        || host.endsWith('.notify.windows.com')
        || host === 'web.push.apple.com'
        || host.endsWith('.push.apple.com');
      if (parsed.protocol !== 'https:' || !allowed) throw new Error('Unsupported push provider');
    } catch {
      return NextResponse.json({ error: 'The push device endpoint must use HTTPS.' }, { status: 400 });
    }
    const { data: contact, error: contactError } = await context.database.from('merchant_alert_contacts')
      .select('id,channels')
      .eq('id', contactId)
      .eq('application_id', context.application.id)
      .maybeSingle();
    if (contactError) {
      console.error('[MerchantAlerts] Could not verify device contact:', contactError);
      return NextResponse.json({ error: 'The alert contact could not be verified.' }, { status: 503 });
    }
    if (!contact || !contact.channels.includes('push')) {
      return NextResponse.json({ error: 'Enable app alerts for this contact before registering a device.' }, { status: 409 });
    }
    const { error } = await context.database.from('merchant_push_subscriptions').upsert({
      application_id: context.application.id,
      contact_id: contact.id,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (error) {
      if (isMissingAlertsMigration(error)) return missingMigrationResponse();
      console.error('[MerchantAlerts] Could not register device:', error);
      return NextResponse.json({ error: 'This device could not be registered for order alerts.' }, { status: 503 });
    }
    return NextResponse.json({ registered: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.operation === 'heartbeat') {
    const endpoint = body.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 2048) {
      return NextResponse.json({ error: 'A valid registered device endpoint is required.' }, { status: 400 });
    }
    const { data, error } = await context.database.from('merchant_push_subscriptions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('application_id', context.application.id)
      .eq('endpoint', endpoint)
      .select('id')
      .maybeSingle();
    if (error) {
      if (isMissingAlertsMigration(error)) return missingMigrationResponse();
      console.error('[MerchantAlerts] Could not update device heartbeat:', error);
      return NextResponse.json({ error: 'This device heartbeat could not be recorded.' }, { status: 503 });
    }
    return NextResponse.json(
      { registered: Boolean(data), heartbeat: data ? new Date().toISOString() : null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (body.operation === 'test') {
    const contactId = typeof body.contactId === 'string' ? body.contactId : '';
    const { data: contact, error } = await context.database.from('merchant_alert_contacts')
      .select('id,channels')
      .eq('id', contactId)
      .eq('application_id', context.application.id)
      .maybeSingle();
    if (error) {
      if (isMissingAlertsMigration(error)) return missingMigrationResponse();
      console.error('[MerchantAlerts] Could not verify test recipient:', error);
      return NextResponse.json({ error: 'The test-alert recipient could not be verified.' }, { status: 503 });
    }
    if (!contact || !contact.channels.includes('push')) {
      return NextResponse.json({ error: 'Enable app alerts for a contact to send a push test.' }, { status: 409 });
    }
    try {
      const result = await sendMerchantAlertTest(
        context.database,
        context.application.id,
        contact.id,
        context.application.business_name
      );
      if (result.noDevice) return NextResponse.json({ error: 'Register this person’s device for app alerts first.' }, { status: 409 });
      if (!result.sent) return NextResponse.json({ error: 'The push provider rejected the test alert.' }, { status: 502 });
      return NextResponse.json({ sent: result.sent, failed: result.failed });
    } catch (testError) {
      if (testError instanceof Error && /Web Push is not configured/.test(testError.message)) {
        return NextResponse.json({ error: testError.message }, { status: 503 });
      }
      console.error('[MerchantAlerts] Test push failed:', testError);
      return NextResponse.json({ error: 'The test alert could not be sent.' }, { status: 503 });
    }
  }

  return NextResponse.json({ error: 'Unsupported alert operation.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid alert contact update is required.' }, { status: 400 });
  }
  const context = await getContext(request, body.applicationId);
  if ('response' in context) return context.response;
  const contact = validateContact(body.contact && typeof body.contact === 'object' && !Array.isArray(body.contact)
    ? body.contact as Record<string, unknown>
    : {});
  if (!contact?.id) return NextResponse.json({ error: 'Select a valid alert contact.' }, { status: 400 });
  const { data, error } = await context.database.from('merchant_alert_contacts').update({
    name: contact.name,
    phone: contact.phone,
    role: contact.role,
    channels: contact.channels,
    shift_start: contact.shift_start,
    shift_end: contact.shift_end,
    language: contact.language,
    active: contact.active,
    updated_at: new Date().toISOString()
  }).eq('id', contact.id).eq('application_id', context.application.id)
    .select('id,name,phone,role,channels,shift_start,shift_end,language,active').maybeSingle();
  if (error) {
    if (isMissingAlertsMigration(error)) return missingMigrationResponse();
    if (error.code === '23505') return NextResponse.json({ error: 'That phone number is already on this business alert list.' }, { status: 409 });
    console.error('[MerchantAlerts] Could not update alert contact:', error);
    return NextResponse.json({ error: 'Alert contact could not be updated.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Alert contact not found.' }, { status: 404 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid alert contact or device is required.' }, { status: 400 });
  }
  const context = await getContext(request, body.applicationId);
  if ('response' in context) return context.response;

  if (typeof body.contactId === 'string') {
    const { data, error } = await context.database.from('merchant_alert_contacts').delete()
      .eq('id', body.contactId).eq('application_id', context.application.id).select('id').maybeSingle();
    if (error) {
      if (isMissingAlertsMigration(error)) return missingMigrationResponse();
      console.error('[MerchantAlerts] Could not delete alert contact:', error);
      return NextResponse.json({ error: 'Alert contact could not be removed.' }, { status: 503 });
    }
    if (!data) return NextResponse.json({ error: 'Alert contact not found.' }, { status: 404 });
    return NextResponse.json({ removed: true });
  }

  if (typeof body.endpoint === 'string' && body.endpoint.length <= 2048) {
    const { error } = await context.database.from('merchant_push_subscriptions').delete()
      .eq('application_id', context.application.id).eq('endpoint', body.endpoint);
    if (error) {
      if (isMissingAlertsMigration(error)) return missingMigrationResponse();
      console.error('[MerchantAlerts] Could not remove push device:', error);
      return NextResponse.json({ error: 'Push device could not be removed.' }, { status: 503 });
    }
    return NextResponse.json({ removed: true });
  }
  return NextResponse.json({ error: 'Choose a valid alert contact or device to remove.' }, { status: 400 });
}
