import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  CUSTOMER_NOTIFICATION_STATUSES,
  normalizeCustomerContactKey,
  normalizeCustomerNotificationConfig,
  type CustomerNotificationChannel
} from '@/lib/customerMessaging';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const editableChannels = ['email', 'whatsapp', 'sms'] as const;
type EditableChannel = typeof editableChannels[number];

async function getAccount(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !serviceKey || !publicKey) {
    return { error: NextResponse.json({ error: 'Notification preferences are not configured.' }, { status: 503 }) };
  }
  if (!token) return { error: NextResponse.json({ error: 'Sign in to manage notification preferences.' }, { status: 401 }) };
  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'Your sign-in has expired. Sign in again.' }, { status: 401 }) };
  }
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { database, user: data.user };
}

async function getContactInfo(database: SupabaseClient, user: { id: string; email?: string | null }) {
  const { data: profile, error } = await database
    .from('profiles')
    .select('phone_number')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[CustomerNotificationPreferences] Could not load the customer phone:', error);
    throw new Error('Your contact details could not be loaded.');
  }
  const key = normalizeCustomerContactKey(user.email || '', profile?.phone_number || '');
  if (!key) throw new Error('Add an email address or phone number to your profile first.');
  return { key, phone: profile?.phone_number || null };
}

export async function GET(request: Request) {
  const account = await getAccount(request);
  if ('error' in account) return account.error;
  try {
    const { key } = await getContactInfo(account.database, account.user);
    const [{ data: saved, error: preferenceError }, { data: setting, error: settingError }] = await Promise.all([
      account.database.from('customer_notification_preferences').select('channels').eq('channel_key', key).maybeSingle(),
      account.database.from('settings').select('value').eq('key', 'customer_messaging').maybeSingle()
    ]);
    if (preferenceError || settingError) {
      console.error('[CustomerNotificationPreferences] Could not load saved preferences:', preferenceError || settingError);
      return NextResponse.json({ error: 'Notification preferences could not be loaded.' }, { status: 503 });
    }

    const config = normalizeCustomerNotificationConfig(setting?.value);
    const defaultChannels = [...new Set(CUSTOMER_NOTIFICATION_STATUSES
      .filter(status => config[status].enabled)
      .flatMap(status => config[status].channels)
      .filter(channel => channel !== 'sms' && channel !== 'whatsapp'))];
    return NextResponse.json({
      saved: Boolean(saved),
      channels: saved?.channels || defaultChannels,
      defaults: defaultChannels
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Notification preferences could not be loaded.'
    }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const account = await getAccount(request);
  if ('error' in account) return account.error;
  let body: { channels?: unknown };
  try {
    body = await request.json() as { channels?: unknown };
  } catch {
    return NextResponse.json({ error: 'Valid notification preferences are required.' }, { status: 400 });
  }
  if (!Array.isArray(body.channels)
    || body.channels.some(channel => !editableChannels.includes(channel as EditableChannel))
    || new Set(body.channels).size !== body.channels.length) {
    return NextResponse.json({ error: 'Choose valid email, SMS, or WhatsApp channels.' }, { status: 400 });
  }

  try {
    const { key, phone } = await getContactInfo(account.database, account.user);
    const { data: current, error: currentError } = await account.database
      .from('customer_notification_preferences')
      .select('channels')
      .eq('channel_key', key)
      .maybeSingle();
    if (currentError) {
      console.error('[CustomerNotificationPreferences] Could not load existing channel choices:', currentError);
      return NextResponse.json({ error: 'Existing notification preferences could not be checked.' }, { status: 503 });
    }
    const channels = [...new Set([
      ...(body.channels as EditableChannel[]),
      ...(current?.channels || []).filter((channel: string): channel is CustomerNotificationChannel => channel === 'push')
    ])];
    const { error } = await account.database.from('customer_notification_preferences').upsert({
      channel_key: key,
      customer_email: account.user.email || null,
      customer_phone: phone,
      channels,
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_key' });
    if (error) {
      console.error('[CustomerNotificationPreferences] Could not save channel choices:', error);
      return NextResponse.json({ error: 'Notification preferences could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ saved: true, channels }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Notification preferences could not be saved.'
    }, { status: 400 });
  }
}
