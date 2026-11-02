import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { orderId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid pickup order is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'A valid pickup order is required.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ error: 'Rider pickup tracking is not configured.' }, { status: 503 });
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderPickup] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can update pickup progress.' }, { status: 403 });
  }

  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,rider_phone,rider_pickup_arrived_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[RiderPickup] Could not load order:', orderError);
    return NextResponse.json({
      error: /rider_pickup_arrived_at|schema cache/i.test(orderError.message)
        ? 'Rider pickup progress is not installed. Apply supabase/RIDER_TERMINAL_WORKFLOW_MIGRATION.sql.'
        : 'Pickup details could not be loaded.'
    }, { status: 503 });
  }
  if (!order || order.rider_phone !== session.phone) {
    return NextResponse.json({ error: 'This order is not assigned to your rider account.' }, { status: 404 });
  }
  if (order.status !== 'Dispatched') {
    return NextResponse.json({ error: 'Pickup arrival can only be recorded before the order is collected.' }, { status: 409 });
  }
  if (order.rider_pickup_arrived_at) {
    return NextResponse.json({ arrivedAt: order.rider_pickup_arrived_at, alreadyRecorded: true });
  }

  const arrivedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await database.from('orders')
    .update({ rider_pickup_arrived_at: arrivedAt, updated_at: arrivedAt })
    .eq('id', orderId)
    .eq('rider_phone', session.phone)
    .eq('status', 'Dispatched')
    .is('rider_pickup_arrived_at', null)
    .select('rider_pickup_arrived_at')
    .maybeSingle();
  if (updateError) {
    console.error('[RiderPickup] Could not save pickup arrival:', updateError);
    return NextResponse.json({ error: 'Pickup arrival could not be saved.' }, { status: 503 });
  }
  if (!updated) return NextResponse.json({ error: 'Pickup status changed. Refresh the mission.' }, { status: 409 });

  const { error: eventError } = await database.from('delivery_events').insert({
    order_id: orderId,
    from_status: 'Dispatched',
    to_status: 'Rider arrived at merchant',
    actor_type: 'rider',
    actor_id: session.phone,
    metadata: { arrived_at: updated.rider_pickup_arrived_at }
  });
  if (eventError) {
    console.error('[RiderPickup] Arrival was saved but the delivery audit could not be written:', eventError);
    return NextResponse.json({
      arrivedAt: updated.rider_pickup_arrived_at,
      warning: 'Arrival was saved, but its audit event could not be recorded.'
    }, { status: 503 });
  }

  return NextResponse.json({ arrivedAt: updated.rider_pickup_arrived_at }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
