import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  createDeliveryTrackingSession,
  verifyDeliveryTrackingSession
} from '@/lib/deliveryTrackingSession.server';

export const dynamic = 'force-dynamic';

type TrackBody = {
  orderId?: unknown;
  phone?: unknown;
  token?: unknown;
};

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return digits;
}

function requestAddress(request: Request) {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 100);
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, 100) : 'unknown';
}

async function loadTrackingOrder(orderId: number) {
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Delivery tracking is not configured on the server.' }, { status: 503 }) };
  }

  const { data: order, error } = await database
    .from('orders')
    .select('id, status, customer_name, customer_phone, total_price, created_at, payment_method, rider_name, rider_phone, delivery_eta_minutes, delivery_eta_updated_at, delivered_at, latitude, longitude')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    console.error('[DeliveryTracking] Could not load order:', error);
    return { response: NextResponse.json({ error: 'Delivery tracking could not be loaded.' }, { status: 503 }) };
  }
  if (!order) return { response: NextResponse.json({ error: 'Order or contact details did not match.' }, { status: 404 }) };

  let riderLocation: { latitude: number; longitude: number; updatedAt: string } | null = null;
  let riderLocationMessage: string | null = null;
  let riderVehicle: { type: string | null; registration: string | null; rating: number | null } | null = null;
  if (order.status === 'Out for Delivery' && order.rider_phone) {
    const { data: rider, error: riderError } = await database
      .from('rider_status')
      .select('last_known_lat, last_known_lng, location_updated_at, vehicle_type, vehicle_reg, rating, verification_status')
      .eq('rider_phone', order.rider_phone)
      .eq('verification_status', 'Verified')
      .maybeSingle();

    if (riderError) {
      console.error('[DeliveryTracking] Could not load current rider position:', riderError);
      riderLocationMessage = 'Live rider location is temporarily unavailable.';
    } else if (rider) {
      const rating = rider.rating === null || rider.rating === undefined ? null : Number(rider.rating);
      riderVehicle = {
        type: rider.vehicle_type,
        registration: rider.vehicle_reg,
        rating: rating !== null && Number.isFinite(rating) ? rating : null
      };
    }

    const latitude = rider?.last_known_lat === null || rider?.last_known_lat === undefined
      ? null
      : Number(rider.last_known_lat);
    const longitude = rider?.last_known_lng === null || rider?.last_known_lng === undefined
      ? null
      : Number(rider.last_known_lng);
    const updatedAt = rider?.location_updated_at ? new Date(rider.location_updated_at) : null;
    const locationIsFresh = updatedAt
      && Number.isFinite(updatedAt.getTime())
      && Date.now() - updatedAt.getTime() <= 2 * 60 * 1000
      && Date.now() >= updatedAt.getTime();
    if (
      locationIsFresh
      && latitude !== null && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && longitude !== null && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ) {
      riderLocation = {
        latitude: Math.round(latitude * 1000) / 1000,
        longitude: Math.round(longitude * 1000) / 1000,
        updatedAt: updatedAt.toISOString()
      };
    }
  }

  return {
    order: {
      id: order.id,
      status: order.status,
      customer_name: order.customer_name,
      total_price: order.total_price,
      created_at: order.created_at,
      payment_method: order.payment_method,
      delivery_eta_minutes: order.delivery_eta_minutes,
      delivery_eta_updated_at: order.delivery_eta_updated_at,
      delivered_at: order.delivered_at,
      rider_name: order.status === 'Dispatched' || order.status === 'Picked Up' || order.status === 'Out for Delivery'
        ? order.rider_name
        : null,
      rider_phone: order.status === 'Dispatched' || order.status === 'Picked Up' || order.status === 'Out for Delivery'
        ? order.rider_phone
        : null,
      rider_vehicle: riderVehicle,
      rider_location: riderLocation,
      rider_location_message: riderLocationMessage,
      delivery_location: order.latitude !== null && order.longitude !== null
        && Number.isFinite(Number(order.latitude)) && Number(order.latitude) >= -90 && Number(order.latitude) <= 90
        && Number.isFinite(Number(order.longitude)) && Number(order.longitude) >= -180 && Number(order.longitude) <= 180
        ? { latitude: Number(order.latitude), longitude: Number(order.longitude) }
        : null
    }
  };
}

export async function POST(request: Request) {
  let body: TrackBody;
  try {
    body = await request.json() as TrackBody;
  } catch {
    return NextResponse.json({ error: 'Enter your order number and checkout phone number.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Delivery tracking is not configured on the server.' }, { status: 503 });

  let orderId: number;
  if (typeof body.token === 'string') {
    const session = verifyDeliveryTrackingSession(body.token);
    if (!session) return NextResponse.json({ error: 'Tracking access expired. Verify your order again.' }, { status: 401 });
    orderId = session.orderId;
  } else {
    orderId = Number(body.orderId);
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || phone.length < 7 || phone.length > 40) {
      return NextResponse.json({ error: 'Enter your order number and checkout phone number.' }, { status: 400 });
    }

    const { data: allowed, error: rateLimitError } = await database.rpc('allow_rider_login_attempt', {
      identity_input: `delivery-tracking:${requestAddress(request)}:${orderId}`
    });
    if (rateLimitError) {
      console.error('[DeliveryTracking] Could not check lookup rate limit:', rateLimitError);
      return NextResponse.json({ error: 'Delivery tracking is temporarily unavailable.' }, { status: 503 });
    }
    if (!allowed) return NextResponse.json({ error: 'Too many lookup attempts. Try again in 15 minutes.' }, { status: 429 });

    const { data: matchingOrder, error: verificationError } = await database
      .from('orders')
      .select('customer_phone')
      .eq('id', orderId)
      .maybeSingle();
    if (verificationError) {
      console.error('[DeliveryTracking] Could not verify order contact:', verificationError);
      return NextResponse.json({ error: 'Order contact details could not be verified.' }, { status: 503 });
    }
    if (!matchingOrder || normalizedPhone(matchingOrder.customer_phone || '') !== normalizedPhone(phone)) {
      return NextResponse.json({ error: 'Order or contact details did not match.' }, { status: 404 });
    }
  }

  const result = await loadTrackingOrder(orderId);
  if (result.response) return result.response;
  if (!result.order) return NextResponse.json({ error: 'Delivery tracking could not be loaded.' }, { status: 503 });

  let token: string;
  try {
    token = typeof body.token === 'string' ? body.token : createDeliveryTrackingSession(orderId);
  } catch (error) {
    console.error('[DeliveryTracking] Could not create tracking session:', error);
    return NextResponse.json({ error: 'Secure delivery tracking is not configured on the server.' }, { status: 503 });
  }

  return NextResponse.json({ order: result.order, token }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
