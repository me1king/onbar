import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const session = verifyRiderSession(token);
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { lat?: unknown; lng?: unknown; battery?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid GPS telemetry is required.' }, { status: 400 });
  }
  const { lat, lng, battery } = body;
  if (
    typeof lat !== 'number'
    || typeof lng !== 'number'
    || !Number.isFinite(lat)
    || !Number.isFinite(lng)
    || lat < -90 || lat > 90
    || lng < -180 || lng > 180
  ) {
    return NextResponse.json({ error: 'Valid GPS coordinates are required.' }, { status: 400 });
  }
  const batteryLevel = typeof battery === 'number' && Number.isFinite(battery)
    ? Math.min(100, Math.max(0, Math.round(battery)))
    : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider location sync is not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: rider, error: lookupError } = await database
    .from('rider_status')
    .select('status, verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (lookupError) {
    console.error('[RiderLocation] Could not verify rider status:', lookupError);
    return NextResponse.json({ error: 'Rider location could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'This rider account is not approved.' }, { status: 403 });
  }
  if (!['Idle', 'Delivering'].includes(rider.status)) {
    return NextResponse.json({ error: 'Go online before sharing pickup location.' }, { status: 409 });
  }

  const timestamp = new Date().toISOString();
  const update: Record<string, string | number> = {
    last_known_lat: lat,
    last_known_lng: lng,
    location_updated_at: timestamp,
    updated_at: timestamp
  };
  if (batteryLevel !== null) {
    update.battery_level = batteryLevel;
    update.battery_updated_at = timestamp;
  }

  const { error: updateError } = await database
    .from('rider_status')
    .update(update)
    .eq('rider_phone', session.phone);
  if (updateError) {
    console.error('[RiderLocation] Could not save rider GPS:', updateError);
    return NextResponse.json({
      error: /battery_updated_at/i.test(updateError.message)
        ? 'Battery telemetry is not installed. Apply supabase/RIDER_BATTERY_TELEMETRY_MIGRATION.sql.'
        : /location_updated_at|last_known_lat|last_known_lng/i.test(updateError.message)
        ? 'Rider GPS fields are missing. Run supabase/DISPATCH_MIGRATION.sql.'
        : 'Rider GPS could not be saved.'
    }, { status: 503 });
  }

  return NextResponse.json({ success: true, timestamp }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
