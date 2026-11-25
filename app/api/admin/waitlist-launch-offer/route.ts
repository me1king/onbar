import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { DEFAULT_WAITLIST_LAUNCH_OFFER, parseWaitlistLaunchOffer } from '@/lib/waitlistLaunchOffer';

export const dynamic = 'force-dynamic';
const SETTING_KEY = 'waitlist_launch_offer';

async function authorize() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Website settings management access is required.' }, { status: 403 });
  }
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  return database;
}

export async function GET() {
  const database = await authorize();
  if (database instanceof NextResponse) return database;

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();
  if (error) {
    console.error('[WaitlistLaunchOffer] Could not load admin settings:', error);
    return NextResponse.json({ error: 'Launch offer settings could not be loaded.' }, { status: 503 });
  }

  const offer = data ? parseWaitlistLaunchOffer(data.value) : DEFAULT_WAITLIST_LAUNCH_OFFER;
  if (!offer) {
    console.error('[WaitlistLaunchOffer] Stored admin settings are invalid.');
    return NextResponse.json({ error: 'Stored launch offer settings are invalid.' }, { status: 503 });
  }
  return NextResponse.json({ offer }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const database = await authorize();
  if (database instanceof NextResponse) return database;

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid launch offer setting is required.' }, { status: 400 });
  }
  const offer = parseWaitlistLaunchOffer(value);
  if (!offer) {
    return NextResponse.json({ error: 'Choose a valid launch time and whether the offer should be enabled.' }, { status: 400 });
  }
  if (offer.enabled && Date.parse(offer.launchAt) <= Date.now()) {
    return NextResponse.json({ error: 'Set a future launch time before enabling this announcement.' }, { status: 400 });
  }

  const { error } = await database.from('settings').upsert({
    key: SETTING_KEY,
    value: offer,
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[WaitlistLaunchOffer] Could not save launch settings:', error);
    return NextResponse.json({ error: 'Launch offer settings could not be saved.' }, { status: 503 });
  }

  return NextResponse.json({ offer }, { headers: { 'Cache-Control': 'private, no-store' } });
}
