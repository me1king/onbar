import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function validCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

async function authorizedSession() {
  const session = await getAdminSession();
  return session && hasAdminPermission(session, 'can_manage_orders') ? session : null;
}

export async function GET() {
  const session = await authorizedSession();
  if (!session) return NextResponse.json({ error: 'Dispatch management access is required.' }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Dispatch settings are not configured on the server.' }, { status: 503 });

  const [zonesResult, policyResult] = await Promise.all([
    database.from('delivery_zones')
      .select('id,name,center_latitude,center_longitude,radius_km,is_active,updated_at')
      .order('name', { ascending: true }),
    database.from('rider_dispatch_policy')
      .select('max_distance_km,updated_at,updated_by')
      .eq('singleton', true)
      .maybeSingle()
  ]);
  if (zonesResult.error || policyResult.error || !policyResult.data) {
    const error = zonesResult.error || policyResult.error;
    console.error('[AdminDeliveryZones] Could not load delivery settings:', error);
    return NextResponse.json({
      error: error && /delivery_zones|rider_dispatch_policy|schema cache/i.test(error.message)
        ? 'Delivery-zone safety is not installed. Apply supabase/RIDER_DISPATCH_SAFETY_MIGRATION.sql.'
        : 'Delivery-zone settings could not be loaded.'
    }, { status: 503 });
  }
  return NextResponse.json({
    zones: (zonesResult.data || []).map(zone => ({ ...zone, id: String(zone.id) })),
    maxDistanceKm: Number(policyResult.data.max_distance_km),
    updatedAt: policyResult.data.updated_at
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const session = await authorizedSession();
  if (!session) return NextResponse.json({ error: 'Dispatch management access is required.' }, { status: 403 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Dispatch settings are not configured on the server.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid delivery-zone update.' }, { status: 400 });
  }

  if (body.action === 'set-distance-cap') {
    const maxDistanceKm = Number(body.maxDistanceKm);
    if (!Number.isFinite(maxDistanceKm) || maxDistanceKm < 1 || maxDistanceKm > 100) {
      return NextResponse.json({ error: 'Dispatch distance cap must be between 1 and 100 km.' }, { status: 400 });
    }
    const { data, error } = await database.from('rider_dispatch_policy')
      .update({ max_distance_km: maxDistanceKm, updated_at: new Date().toISOString(), updated_by: session.email || session.role })
      .eq('singleton', true)
      .select('max_distance_km,updated_at')
      .single();
    if (error) {
      console.error('[AdminDeliveryZones] Could not save dispatch distance cap:', error);
      return NextResponse.json({ error: 'The dispatch distance cap could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ maxDistanceKm: Number(data.max_distance_km), updatedAt: data.updated_at });
  }

  if (body.action !== 'save-zone') {
    return NextResponse.json({ error: 'Choose a supported delivery-zone action.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const latitude = Number(body.centerLatitude);
  const longitude = Number(body.centerLongitude);
  const radiusKm = Number(body.radiusKm);
  const isActive = body.isActive !== false;
  if (name.length < 2 || name.length > 80
    || !validCoordinate(latitude, -90, 90)
    || !validCoordinate(longitude, -180, 180)
    || !Number.isFinite(radiusKm) || radiusKm < 0.1 || radiusKm > 100) {
    return NextResponse.json({
      error: 'Enter a zone name, valid centre coordinates, and a radius from 0.1 to 100 km.'
    }, { status: 400 });
  }

  const values = {
    name,
    center_latitude: latitude,
    center_longitude: longitude,
    radius_km: radiusKm,
    is_active: isActive,
    updated_at: new Date().toISOString()
  };
  const isUpdate = typeof body.id === 'string'
    && /^[1-9]\d{0,17}$/.test(body.id)
    && Number.isSafeInteger(Number(body.id));
  const result = isUpdate
    ? await database.from('delivery_zones').update(values).eq('id', Number(body.id)).select('id,name,center_latitude,center_longitude,radius_km,is_active,updated_at').single()
    : await database.from('delivery_zones').insert(values).select('id,name,center_latitude,center_longitude,radius_km,is_active,updated_at').single();
  if (result.error) {
    console.error('[AdminDeliveryZones] Could not save delivery zone:', result.error);
    return NextResponse.json({
      error: /duplicate key/i.test(result.error.message)
        ? 'A delivery zone already uses that name.'
        : 'The delivery zone could not be saved.'
    }, { status: 503 });
  }
  return NextResponse.json({ zone: result.data });
}
