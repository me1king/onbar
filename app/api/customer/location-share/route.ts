import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { approximateArea, LOCATION_AREAS } from '@/lib/locationCatalog';

export const dynamic = 'force-dynamic';

const shares = new Map<string, { startedAt: number; count: number }>();
const rateWindowMs = 10 * 60 * 1000;
const shareLifetimeMs = 2 * 60 * 1000;

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function migrationMissing(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || /customer_live_location_shares/i.test(error.message || '');
}

function validShareId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function allowRequest(request: Request) {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
  const now = Date.now();
  const current = shares.get(address);
  if (current && now - current.startedAt < rateWindowMs && current.count >= 40) return false;
  if (!current || now - current.startedAt >= rateWindowMs) shares.set(address, { startedAt: now, count: 1 });
  else current.count += 1;
  if (shares.size > 2000) {
    for (const [key, entry] of shares) {
      if (now - entry.startedAt >= rateWindowMs) shares.delete(key);
    }
  }
  return true;
}

function unavailable(error?: unknown) {
  if (error) console.error('[CustomerLocationShare] Database request failed:', error);
  return NextResponse.json({
    error: 'Live customer location sharing is not installed. Apply supabase/CUSTOMER_LIVE_LOCATION_SHARING_MIGRATION.sql.'
  }, { status: 503 });
}

export async function POST(request: Request) {
  if (!allowRequest(request)) {
    return NextResponse.json({ error: 'Too many location updates. Wait a moment and try again.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid location-sharing request.' }, { status: 400 });
  }
  const shareId = body.shareId;
  if (!validShareId(shareId)) {
    return NextResponse.json({ error: 'A valid temporary sharing session is required.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Live location sharing is not configured.' }, { status: 503 });

  if (body.action === 'stop') {
    const { error } = await database.from('customer_live_location_shares')
      .delete()
      .eq('share_id', shareId);
    if (error) return migrationMissing(error) ? unavailable() : unavailable(error);
    return NextResponse.json({ sharing: false }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }
  if (body.action !== 'share') {
    return NextResponse.json({ error: 'Choose start or stop for location sharing.' }, { status: 400 });
  }

  const source = body.source;
  const precision = body.precision === undefined ? 'approximate' : body.precision;
  if (precision !== 'approximate' && precision !== 'exact') {
    return NextResponse.json({ error: 'Choose approximate or exact GPS sharing.' }, { status: 400 });
  }
  if (precision === 'exact' && (source !== 'gps' || body.exactLocationConsent !== true)) {
    return NextResponse.json({ error: 'Exact GPS sharing requires your explicit consent and a live GPS reading.' }, { status: 403 });
  }
  let latitude: number;
  let longitude: number;
  let accuracyM: number | null = null;
  let city = '';
  let area = '';
  if (source === 'manual') {
    const selected = LOCATION_AREAS.find(location =>
      location.city === body.city && location.area === body.area
    );
    if (!selected) return NextResponse.json({ error: 'Choose an area from the available list.' }, { status: 400 });
    latitude = Math.round(selected.latitude * 1000) / 1000;
    longitude = Math.round(selected.longitude * 1000) / 1000;
    city = selected.city;
    area = selected.area;
  } else if (source === 'gps') {
    const latitudeValue = Number(body.latitude);
    const longitudeValue = Number(body.longitude);
    if (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90
      || !Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180) {
      return NextResponse.json({ error: 'A valid location is required to share with operations.' }, { status: 400 });
    }
    if (precision === 'exact') {
      const accuracyValue = Number(body.accuracyM);
      if (!Number.isFinite(accuracyValue) || accuracyValue <= 0 || accuracyValue > 10000) {
        return NextResponse.json({ error: 'A valid device GPS accuracy reading is required for exact sharing.' }, { status: 400 });
      }
      latitude = latitudeValue;
      longitude = longitudeValue;
      accuracyM = accuracyValue;
    } else {
      latitude = Math.round(latitudeValue * 1000) / 1000;
      longitude = Math.round(longitudeValue * 1000) / 1000;
      const accuracyValue = Number(body.accuracyM);
      accuracyM = Number.isFinite(accuracyValue) && accuracyValue > 0 && accuracyValue <= 10000
        ? accuracyValue
        : null;
    }
    const nearest = approximateArea(latitude, longitude);
    city = nearest?.city || 'Other';
    area = nearest?.area || 'Other';
  } else {
    return NextResponse.json({ error: 'Choose GPS or a listed area to share your location.' }, { status: 400 });
  }

  const activity = ['browsing', 'checkout', 'ordered'].includes(String(body.activity))
    ? String(body.activity)
    : 'browsing';
  const now = new Date();
  const expiresAt = new Date(now.getTime() + shareLifetimeMs);
  const { error: cleanupError } = await database.from('customer_live_location_shares')
    .delete()
    .lt('expires_at', now.toISOString());
  if (cleanupError) return migrationMissing(cleanupError) ? unavailable() : unavailable(cleanupError);

  const { error } = await database.from('customer_live_location_shares').upsert({
    share_id: shareId,
    latitude,
    longitude,
    precision,
    accuracy_m: accuracyM,
    city,
    area,
    activity,
    last_seen_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  }, { onConflict: 'share_id' });
  if (error) return migrationMissing(error) ? unavailable() : unavailable(error);
  return NextResponse.json({
    sharing: true,
    approximate: precision === 'approximate',
    precision,
    area: { city, area },
    expiresAt: expiresAt.toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
