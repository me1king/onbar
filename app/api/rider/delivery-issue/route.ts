import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

const issueLabels: Record<string, string> = {
  no_valid_id: 'No valid ID',
  underage_customer: 'Possible underage customer',
  intoxicated_customer: 'Customer appears intoxicated',
  customer_unavailable: 'Customer unavailable',
  customer_refused: 'Customer refused handover',
  item_unavailable: 'Item missing or unavailable',
  address_unreachable: 'Address unreachable',
  order_problem: 'Order missing or damaged',
  other: 'Other delivery issue'
};

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { orderId?: unknown; issue?: unknown; details?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid delivery issue is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  const issue = typeof body.issue === 'string' ? body.issue : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !issueLabels[issue] || details.length > 500) {
    return NextResponse.json({ error: 'Choose a valid issue and keep details under 500 characters.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ error: 'Delivery issue reporting is not configured.' }, { status: 503 });
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderIssue] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can report delivery issues.' }, { status: 403 });
  }

  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,rider_phone')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[RiderIssue] Could not verify delivery:', orderError);
    return NextResponse.json({ error: 'Delivery assignment could not be verified.' }, { status: 503 });
  }
  if (!order || order.rider_phone !== session.phone) {
    return NextResponse.json({ error: 'This order is not assigned to your rider account.' }, { status: 404 });
  }
  if (!['Dispatched', 'Picked Up', 'Out for Delivery'].includes(order.status || '')) {
    return NextResponse.json({ error: 'Issues can only be reported on an active delivery.' }, { status: 409 });
  }

  const { error: eventError } = await database.from('delivery_events').insert({
    order_id: orderId,
    from_status: order.status,
    to_status: `Issue reported: ${issueLabels[issue]}`,
    actor_type: 'rider',
    actor_id: session.phone,
    metadata: { issue, label: issueLabels[issue], details: details || null }
  });
  if (eventError) {
    console.error('[RiderIssue] Could not save delivery issue:', eventError);
    return NextResponse.json({
      error: /delivery_events|schema cache/i.test(eventError.message)
        ? 'Delivery issue audit is not installed. Apply supabase/DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql.'
        : 'The delivery issue could not be recorded.'
    }, { status: 503 });
  }
  return NextResponse.json({ recorded: true }, { headers: { 'Cache-Control': 'no-store' } });
}
