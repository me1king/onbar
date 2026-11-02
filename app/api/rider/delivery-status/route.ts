import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

const allowedTransitions: Record<string, string> = {
  Dispatched: 'Picked Up',
  'Picked Up': 'Out for Delivery',
  'Out for Delivery': 'Delivered'
};
const handoverBlockingIssues = [
  'Issue reported: No valid ID',
  'Issue reported: Possible underage customer',
  'Issue reported: Customer appears intoxicated',
  'Issue reported: Customer refused handover'
];

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: {
    orderId?: unknown;
    nextStatus?: unknown;
    customerIdVerified?: unknown;
    checkedItemIds?: unknown;
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
  if (nextStatus === 'Delivered' && body.customerIdVerified !== true) {
    return NextResponse.json({
      error: 'Check the customer’s ID and verify their one-time handover code before completion.'
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
    .select('id, status, rider_phone, payment_method, rider_pickup_arrived_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[RiderDelivery] Could not load order:', orderError);
    return NextResponse.json({
      error: /rider_pickup_arrived_at|schema cache/i.test(orderError.message)
        ? 'Rider pickup workflow is not installed. Apply supabase/RIDER_TERMINAL_WORKFLOW_MIGRATION.sql.'
        : 'Order status could not be verified.'
    }, { status: 503 });
  }
  if (!order || order.rider_phone !== session.phone) {
    return NextResponse.json({ error: 'This order is not assigned to your rider account.' }, { status: 404 });
  }
  if (allowedTransitions[order.status] !== nextStatus && order.status !== nextStatus) {
    return NextResponse.json({ error: `This order cannot advance from ${order.status} to ${nextStatus}.` }, { status: 409 });
  }
  if (nextStatus === 'Picked Up' && !order.rider_pickup_arrived_at) {
    return NextResponse.json({ error: 'Record arrival at the merchant before confirming pickup.' }, { status: 409 });
  }
  if (nextStatus === 'Delivered') {
    const { data: handoverIssue, error: issueError } = await database.from('delivery_events')
      .select('id')
      .eq('order_id', orderId)
      .in('to_status', handoverBlockingIssues)
      .limit(1)
      .maybeSingle();
    if (issueError) {
      console.error('[RiderDelivery] Could not verify handover issues:', issueError);
      return NextResponse.json({ error: 'Handover safety issues could not be verified.' }, { status: 503 });
    }
    if (handoverIssue) {
      return NextResponse.json({
        error: 'Handover is blocked because an ID, age, intoxication, or refusal issue was reported. Contact dispatch for review.'
      }, { status: 409 });
    }
  }

  let checkedItemIds: number[] = [];
  if (nextStatus === 'Picked Up') {
    if (!Array.isArray(body.checkedItemIds)
      || body.checkedItemIds.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ error: 'Check every order item before confirming pickup.' }, { status: 400 });
    }
    const { data: orderItems, error: itemsError } = await database.from('order_items')
      .select('id')
      .eq('order_id', orderId);
    if (itemsError) {
      console.error('[RiderDelivery] Could not verify pickup items:', itemsError);
      return NextResponse.json({ error: 'The order items could not be verified.' }, { status: 503 });
    }
    const requiredIds = (orderItems || []).map(item => Number(item.id));
    checkedItemIds = [...new Set(body.checkedItemIds as number[])];
    if (requiredIds.length === 0 || requiredIds.some(id => !checkedItemIds.includes(id))) {
      return NextResponse.json({ error: 'Confirm every item in the order before pickup.' }, { status: 400 });
    }
  }

  const { data: updatedStatus, error: transitionError } = nextStatus === 'Delivered'
    ? await database.rpc('complete_rider_delivery', {
      p_order_id: orderId,
      p_rider_phone: session.phone,
      p_customer_id_verified: body.customerIdVerified === true
    })
    : await database.rpc('advance_rider_delivery', {
      p_order_id: orderId,
      p_rider_phone: session.phone,
      p_next_status: nextStatus,
      p_delivery_pin: null,
      p_customer_id_verified: false
    });
  if (transitionError) {
    console.error('[RiderDelivery] Could not advance delivery:', transitionError);
    const conflict = /cannot advance|not assigned|invalid delivery status|handover|payment|customer ID|safety issue|blocked/i.test(transitionError.message);
    return NextResponse.json({
      error: conflict
        ? 'Delivery status, secure handover, or payment changed. Refresh the mission and confirm everything again.'
        : /complete_rider_delivery/i.test(transitionError.message)
          ? 'Delivery completion is not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql after the rider safety migrations.'
          : /advance_rider_delivery|schema cache/i.test(transitionError.message)
          ? 'Delivery safety migration is missing. Run supabase/RIDER_DELIVERY_SAFETY_MIGRATION.sql after the delivery and dispatch migrations.'
          : 'Delivery status and commission could not be saved.'
    }, { status: conflict ? 409 : 503 });
  }

  const auditEvents = [];
  if (nextStatus === 'Picked Up') {
    auditEvents.push({
      order_id: orderId,
      from_status: order.status,
      to_status: 'Rider pickup items checked',
      actor_type: 'rider',
      actor_id: session.phone,
      metadata: { checked_item_ids: checkedItemIds }
    });
  }
  let auditWarning: string | undefined;
  if (auditEvents.length > 0) {
    const { error: auditError } = await database.from('delivery_events').insert(auditEvents);
    if (auditError) {
      console.error('[RiderDelivery] Status saved but pickup audit could not be recorded:', auditError);
      auditWarning = 'Delivery status was saved, but the pickup audit could not be recorded.';
    }
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
    ...((walletError || notificationWarning || auditWarning) ? {
      warning: [
        walletError ? 'Delivery status is saved, but wallet totals could not be refreshed.' : null,
        notificationWarning,
        auditWarning
      ].filter(Boolean).join(' ')
    } : {})
  }, { headers: { 'Cache-Control': 'no-store' } });
}
