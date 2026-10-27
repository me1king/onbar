import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  DEFAULT_TICKET_EMAIL_SETTINGS,
  normalizeTicketEmailSettings
} from '@/lib/ticketing/emailSettings';

export const dynamic = 'force-dynamic';

async function canManageTicketEmail() {
  const session = await getAdminSession();
  return Boolean(session && ['owner', 'admin'].includes(session.role.toLowerCase()));
}

export async function GET() {
  if (!await canManageTicketEmail()) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  }
  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'ticketing_email_settings')
    .maybeSingle();
  if (error) {
    console.error('[TicketingEmailSettings] Could not load email settings:', error);
    return NextResponse.json({ error: 'Ticket email settings could not be loaded.' }, { status: 503 });
  }
  const settings = data ? normalizeTicketEmailSettings(data.value) : DEFAULT_TICKET_EMAIL_SETTINGS;
  if (!settings) {
    console.error('[TicketingEmailSettings] Stored ticket email settings are invalid.');
    return NextResponse.json({ error: 'Stored ticket email settings are invalid. Reset them before continuing.' }, { status: 503 });
  }
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  if (!await canManageTicketEmail()) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }
  let body: { settings?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid ticket email settings are required.' }, { status: 400 });
  }
  const settings = normalizeTicketEmailSettings(body.settings);
  if (!settings) {
    return NextResponse.json({ error: 'Email template content or section settings are invalid.' }, { status: 400 });
  }
  if (!settings.brandTitle || !settings.subjectTemplate || !settings.headingTemplate) {
    return NextResponse.json({ error: 'Brand title, email subject, and heading cannot be blank.' }, { status: 400 });
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  }
  const { error } = await database.from('settings').upsert({
    key: 'ticketing_email_settings',
    value: settings,
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[TicketingEmailSettings] Could not save email settings:', error);
    return NextResponse.json({ error: 'Ticket email settings could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
