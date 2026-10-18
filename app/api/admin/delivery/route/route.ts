import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { routingEngine } from '@/lib/engines/routingEngine';

export const dynamic = 'force-dynamic';

function coordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidPoint(
  point: { latitude: number | null; longitude: number | null }
): point is { latitude: number; longitude: number } {
  return point.latitude !== null && point.longitude !== null
    && point.latitude >= -90 && point.latitude <= 90
    && point.longitude >= -180 && point.longitude <= 180;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Route requests must come from this site.' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (!['owner', 'admin'].includes(session.role)
    && session.permissions?.can_manage_orders !== true)) {
    return NextResponse.json({ error: 'Delivery operations access is required.' }, { status: 403 });
  }
  if (!routingEngine.hasOsrmProvider()) {
    return NextResponse.json({ error: 'OSRM routing is not configured. Set the server-only OSRM_BASE_URL and redeploy.' }, { status: 503 });
  }

  let body: { orderId?: unknown };
  try {
    body = await request.json() as { orderId?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid route request is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'A valid order ID is required.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Delivery data access is not configured on the server.' }, { status: 503 });
  }

  const { data: order, error: orderError } = await database
    .from('orders')
    .select('id,status,rider_phone,latitude,longitude')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[AdminDeliveryRoute] Could not load order:', orderError);
    return NextResponse.json({ error: 'The delivery order could not be loaded.' }, { status: 503 });
  }
  if (!order || !['Dispatched', 'Picked Up', 'Out for Delivery'].includes(order.status || '') || !order.rider_phone) {
    return NextResponse.json({ error: 'Choose an active delivery with an assigned rider.' }, { status: 409 });
  }

  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('rider_name,status,verification_status,last_known_lat,last_known_lng,location_updated_at')
    .eq('rider_phone', order.rider_phone)
    .maybeSingle();
  if (riderError) {
    console.error('[AdminDeliveryRoute] Could not load rider location:', riderError);
    return NextResponse.json({ error: 'The assigned rider location could not be loaded.' }, { status: 503 });
  }

  const originLatitude = coordinate(rider?.last_known_lat);
  const originLongitude = coordinate(rider?.last_known_lng);
  const destinationLatitude = coordinate(order.latitude);
  const destinationLongitude = coordinate(order.longitude);
  const origin = { latitude: originLatitude, longitude: originLongitude };
  const destination = { latitude: destinationLatitude, longitude: destinationLongitude };
  const locationTime = rider?.location_updated_at ? new Date(rider.location_updated_at).getTime() : 0;
  if (rider?.verification_status !== 'Verified'
    || !['Idle', 'Delivering'].includes(rider?.status || '')
    || !isValidPoint(origin)
    || locationTime <= 0
    || Date.now() < locationTime
    || Date.now() - locationTime > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'The assigned rider has no verified GPS location updated within the last five minutes.' }, { status: 409 });
  }
  if (!isValidPoint(destination)) {
    return NextResponse.json({ error: 'This delivery has no valid customer destination coordinates.' }, { status: 409 });
  }

  try {
    const route = await routingEngine.computeFastestRoute(
      origin,
      destination
    );
    return NextResponse.json({
      orderId,
      riderName: rider.rider_name,
      provider: route.provider,
      distanceKm: Number(route.distanceKm.toFixed(2)),
      durationMinutes: Math.ceil(route.durationMinutes),
      encodedPolyline: route.encodedPolyline,
      calculatedAt: route.calculatedAt
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[AdminDeliveryRoute] OSRM route calculation failed:', error);
    return NextResponse.json({ error: 'OSRM could not calculate a road route for this delivery. Check the route service and map coverage.' }, { status: 503 });
  }
}
