import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

const allowedTransitions: Record<string, string> = {
  Dispatched: 'Picked Up',
  'Picked Up': 'Out for Delivery',
  'Out for Delivery': 'Delivered'
};

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: {
    orderId?: unknown;
    nextStatus?: unknown;
    deliveryPin?: unknown;
    customerIdVerified?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid order ID is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  const nextStatus = typeof body.nextStatus === 'string' ? body.nextStatus : '';
  if (!Number.isSafeInteger(orderId) || orderId <= 0
    || !['Picked Up', 'Out for Delivery', 'Delivered'].includes(nextStatus)) {
    return NextResponse.json({ error: 'A valid order ID and delivery status are required.' }, { status: 400 });
  }
  const deliveryPin = typeof body.deliveryPin === 'string' ? body.deliveryPin.trim() : '';
  if (nextStatus === 'Delivered'
    && (body.customerIdVerified !== true || !/^\d{6}$/.test(deliveryPin))) {
    return NextResponse.json({
      error: 'Check the customer’s ID and enter the six-digit delivery PIN before handover.'
    }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Delivery status updates are not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderDelivery] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can update delivery status.' }, { status: 403 });
  }

  const { data: order, error: orderError } = await database
    .from('orders')
    .select('id, status, rider_phone')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[RiderDelivery] Could not load order:', orderError);
    return NextResponse.json({ error: 'Order status could not be verified.' }, { status: 503 });
  }
  if (!order || order.rider_phone !== session.phone) {
    return NextResponse.json({ error: 'This order is not assigned to your rider account.' }, { status: 404 });
  }
  if (allowedTransitions[order.status] !== nextStatus && order.status !== nextStatus) {
    return NextResponse.json({ error: `This order cannot advance from ${order.status} to ${nextStatus}.` }, { status: 409 });
  }

  if (nextStatus === 'Delivered') {
    const { data: allowed, error: rateLimitError } = await database.rpc('allow_rider_login_attempt', {
      identity_input: `delivery-pin:${orderId}:${session.phone}`
    });
    if (rateLimitError) {
      console.error('[RiderDelivery] Could not check handover PIN rate limit:', rateLimitError);
      return NextResponse.json({ error: 'Delivery PIN verification is temporarily unavailable.' }, { status: 503 });
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Too many PIN attempts. Try again in 15 minutes.' }, { status: 429 });
    }
  }

  const { data: updatedStatus, error: transitionError } = await database.rpc('advance_rider_delivery', {
    p_order_id: orderId,
    p_rider_phone: session.phone,
    p_next_status: nextStatus,
    p_delivery_pin: nextStatus === 'Delivered' ? deliveryPin : null,
    p_customer_id_verified: nextStatus === 'Delivered' && body.customerIdVerified === true
  });
  if (transitionError) {
    console.error('[RiderDelivery] Could not advance delivery:', transitionError);
    const conflict = /cannot advance|not assigned|invalid delivery status|delivery PIN|customer ID/i.test(transitionError.message);
    return NextResponse.json({
      error: conflict
        ? 'Delivery status changed elsewhere or this transition is not allowed. Refresh the mission.'
        : /advance_rider_delivery|schema cache/i.test(transitionError.message)
          ? 'Delivery safety migration is missing. Run supabase/RIDER_DELIVERY_SAFETY_MIGRATION.sql after the delivery and dispatch migrations.'
          : 'Delivery status and commission could not be saved.'
    }, { status: conflict ? 409 : 503 });
  }

  const { data: wallet, error: walletError } = await database
    .from('rider_wallets')
    .select('balance, total_earned')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (walletError) console.error('[RiderDelivery] Status saved but wallet refresh failed:', walletError);

  let notificationWarning: string | undefined;
  const notificationSecret = process.env.INTERNAL_API_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (['Picked Up', 'Out for Delivery', 'Delivered'].includes(updatedStatus)) {
    if (!notificationSecret) {
      notificationWarning = 'Delivery status was saved, but automatic customer messages are not configured on the server.';
    } else {
      try {
        const notificationResponse = await fetch(new URL('/api/admin/notify-customer', request.url), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notificationSecret}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ orderId, status: updatedStatus }),
          cache: 'no-store'
        });
        const notificationResult = await notificationResponse.json() as { error?: string; ok?: boolean };
        if (!notificationResponse.ok || notificationResult.ok === false) {
          notificationWarning = notificationResult.error || 'Delivery status was saved, but a customer notification could not be sent.';
        }
      } catch (notificationError) {
        console.error('[RiderDelivery] Customer notification request failed:', notificationError);
        notificationWarning = 'Delivery status was saved, but a customer notification could not be sent.';
      }
    }
  }

  return NextResponse.json({
    status: updatedStatus,
    wallet: wallet || undefined,
    ...((walletError || notificationWarning) ? {
      warning: [
        walletError ? 'Delivery status is saved, but wallet totals could not be refreshed.' : null,
        notificationWarning
      ].filter(Boolean).join(' ')
    } : {})
  }, { headers: { 'Cache-Control': 'no-store' } });
}
