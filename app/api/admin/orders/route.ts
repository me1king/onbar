import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { isValidTransition, type OrderStatus } from '@/lib/ob-os/state-machine';

export const dynamic = 'force-dynamic';

const orderStatuses: OrderStatus[] = [
  'Created', 'Pending', 'Payment Pending', 'Confirmed', 'Paid', 'Stock Reserved', 'Supplier Confirmed',
  'Processing', 'Packed', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered',
  'Completed', 'Cancelled', 'Payment Failed', 'Refunded', 'Warranty', 'Returned'
];
const serverManagedStatuses = new Set<OrderStatus>([
  'Paid', 'Payment Failed', 'Refunded', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'
]);

async function getAccess(request?: Request, mutation = false) {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  const role = session.role.toLowerCase();
  const allowed = ['owner', 'admin', 'staff'].includes(role)
    || session.permissions.can_manage_orders === true;
  if (!allowed) return { response: NextResponse.json({ error: 'Order management access is required.' }, { status: 403 }) };
  if (mutation && (!request || !isSameOriginRequest(request))) {
    return { response: NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return { response: NextResponse.json({ error: 'Order database access is not configured on the server.' }, { status: 503 }) };
  }
  return {
    session,
    database: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  };
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && orderStatuses.includes(value as OrderStatus);
}

function validOrderId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

async function updateOrderStatus(
  database: SupabaseClient,
  id: number,
  status: OrderStatus,
  adminEmail: string,
  reason = 'Manual Status Update'
) {
  const { data: order, error: readError } = await database
    .from('orders')
    .select('id,status')
    .eq('id', id)
    .maybeSingle();
  if (readError || !order) {
    console.error('[AdminOrders] Could not load order for status update:', readError);
    throw new Error(readError?.message || 'That order could not be found.');
  }
  const currentStatus = order.status as OrderStatus;
  if (!isOrderStatus(currentStatus) || !isValidTransition(currentStatus, status)) {
    throw new Error(`Cannot move order #${id} from ${String(order.status)} to ${status}.`);
  }

  const transition = await database.rpc('transition_order_state', {
    order_id_input: id,
    new_state_input: status,
    reason_input: reason,
    admin_email_input: adminEmail
  });
  if (transition.error) {
    console.error('[AdminOrders] Atomic order status transition failed:', transition.error);
    throw new Error(transition.error.message);
  }
  return { oldStatus: currentStatus };
}

export async function GET(request: Request) {
  const access = await getAccess();
  if ('response' in access) return access.response;
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get('recent') === '1') {
    const includeProducts = searchParams.get('includeProducts') === '1';
    const [orders, products] = await Promise.all([
      access.database.from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .limit(150),
      includeProducts
        ? access.database.from('products').select('id,name,price,cost_price,stock,variant_stock').order('name')
        : Promise.resolve({ data: null, error: null })
    ]);
    const error = orders.error || products.error;
    if (error) {
      console.error('[AdminOrders] Could not load recent order updates:', error);
      return NextResponse.json({ error: 'Recent orders could not be loaded. Check the database connection and schema.' }, { status: 503 });
    }
    return NextResponse.json({
      orders: (orders.data || []).map(order => ({ ...order, status_events: [] })),
      ...(includeProducts ? { products: products.data || [] } : {})
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }
  const [orders, products] = await Promise.all([
    access.database.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(500),
    access.database.from('products').select('id,name,price,cost_price,stock,variant_stock').order('name')
  ]);
  if (orders.error || products.error) {
    const error = orders.error || products.error;
    console.error('[AdminOrders] Could not load order fulfillment data:', error);
    return NextResponse.json({ error: 'Orders or product inventory could not be loaded. Check the database connection and schema.' }, { status: 503 });
  }
  const orderIds = (orders.data || []).map(order => order.id);
  const [history, merchantEvents, dispatchDecisions] = orderIds.length
    ? await Promise.all([
      access.database.from('order_status_events')
        .select('id,order_id,from_status,to_status,actor_type,actor_id,reason,created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(10_000),
      access.database.from('merchant_fulfillment_events')
        .select('id,order_id,event_type,actor,occurred_at,application:merchant_applications(business_name)')
        .in('order_id', orderIds)
        .order('occurred_at', { ascending: true })
        .limit(10_000),
      access.database.from('dispatch_decisions')
        .select('id,order_id,selected_rider_name,decision_type,chosen_by,override_reason,created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })
        .limit(10_000)
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null }
    ] as const;
  const historyWarning = history.error || merchantEvents.error || dispatchDecisions.error;
  if (history.error) console.error('[AdminOrders] Order status history is unavailable:', history.error);
  if (merchantEvents.error) console.error('[AdminOrders] Merchant fulfillment history is unavailable:', merchantEvents.error);
  if (dispatchDecisions.error) console.error('[AdminOrders] Rider dispatch history is unavailable:', dispatchDecisions.error);

  type FlowEvent = {
    id: string;
    order_id: number;
    from_status: string | null;
    to_status: string;
    actor_type: string;
    actor_id: string | null;
    reason: string | null;
    created_at: string;
  };
  const eventsByOrder = new Map<number, FlowEvent[]>();
  const appendEvent = (event: FlowEvent) => {
    const events = eventsByOrder.get(event.order_id) || [];
    events.push(event);
    eventsByOrder.set(event.order_id, events);
  };
  for (const event of history.data || []) {
    appendEvent({ ...event, id: `status-${event.id}` });
  }
  for (const event of merchantEvents.data || []) {
    const merchant = Array.isArray(event.application) ? event.application[0] : event.application;
    appendEvent({
      id: `merchant-${event.id}`,
      order_id: event.order_id,
      from_status: null,
      to_status: `Vendor ${event.event_type.replaceAll('_', ' ')}`,
      actor_type: 'vendor',
      actor_id: merchant?.business_name || event.actor,
      reason: null,
      created_at: event.occurred_at
    });
  }
  for (const decision of dispatchDecisions.data || []) {
    appendEvent({
      id: `dispatch-${decision.id}`,
      order_id: decision.order_id,
      from_status: null,
      to_status: 'Rider assigned',
      actor_type: decision.decision_type === 'admin_override' ? 'admin override' : 'dispatch',
      actor_id: decision.chosen_by,
      reason: [
        decision.selected_rider_name,
        decision.override_reason
      ].filter(Boolean).join(' · ') || null,
      created_at: decision.created_at
    });
  }
  for (const events of eventsByOrder.values()) {
    events.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  }
  return NextResponse.json({
    orders: (orders.data || []).map(order => ({
      ...order,
      status_events: eventsByOrder.get(order.id) || []
    })),
    products: products.data || [],
    flowHistoryWarning: historyWarning
      ? 'Full order-flow history is not available. Apply ORDER_FLOW_VISIBILITY_MIGRATION.sql, MERCHANT_OPERATIONS_MIGRATION.sql, and DISPATCH_MIGRATION.sql; history starts after installation.'
      : null
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  const access = await getAccess(request, true);
  if ('response' in access) return access.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid manual order is required.' }, { status: 400 });
  }
  const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
  const quantity = Number(body.quantity);
  const totalPrice = Number(body.total_price);
  if (!customerName || !customerPhone || !Number.isSafeInteger(quantity) || quantity < 1
    || !Number.isFinite(totalPrice) || totalPrice < 0 || body.status !== 'Created'
    || !['M-Pesa', 'COD', 'Paystack'].includes(String(body.payment_method))
    || (body.product_id !== null && body.product_id !== undefined && !validOrderId(body.product_id))) {
    return NextResponse.json({ error: 'Enter valid customer, product, quantity, price, status and payment details.' }, { status: 400 });
  }
  const { data, error } = await access.database.from('orders').insert({
    customer_name: customerName,
    customer_phone: customerPhone,
    quantity,
    total_price: totalPrice,
    status: 'Created',
    payment_method: body.payment_method,
    note: typeof body.note === 'string' ? body.note.trim() || null : null,
    product_id: body.product_id ?? null,
    captured_by: access.session.email || 'system'
  }).select('id').single();
  if (error) {
    console.error('[AdminOrders] Could not create manual order:', error);
    return NextResponse.json({ error: 'Manual order could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await getAccess(request, true);
  if ('response' in access) return access.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid order update is required.' }, { status: 400 });
  }
  const action = body.action;
  try {
    if (action === 'status' && validOrderId(body.id) && isOrderStatus(body.status)) {
      if (serverManagedStatuses.has(body.status)) {
        return NextResponse.json({
          error: `${body.status} is controlled by payment verification or the protected dispatch/delivery workflow.`
        }, { status: 409 });
      }
      const result = await updateOrderStatus(access.database, body.id, body.status, access.session.email || 'Admin',
        body.status === 'Paid' ? 'Payment Verified' : 'Manual Status Update');
      return NextResponse.json(result);
    }
    if (action === 'bulk_status' && Array.isArray(body.ids) && body.ids.length > 0
      && body.ids.length <= 100 && body.ids.every(validOrderId) && isOrderStatus(body.status)) {
      if (new Set(body.ids).size !== body.ids.length) {
        return NextResponse.json({ error: 'An order may only be selected once.' }, { status: 400 });
      }
      if (serverManagedStatuses.has(body.status)) {
        return NextResponse.json({
          error: `${body.status} is controlled by payment verification or the protected dispatch/delivery workflow.`
        }, { status: 409 });
      }
      const { data, error } = await access.database.rpc('transition_order_states', {
        order_ids_input: body.ids,
        new_state_input: body.status,
        reason_input: 'Bulk admin status update',
        admin_email_input: access.session.email || 'Admin'
      });
      if (error) {
        console.error('[AdminOrders] Atomic bulk transition failed:', error);
        throw new Error(error.message);
      }
      return NextResponse.json(data);
    }
    if (action === 'gift' && validOrderId(body.id) && typeof body.message === 'string') {
      const message = body.message.trim();
      if (message.length > 1000) return NextResponse.json({ error: 'Gift message must be 1,000 characters or fewer.' }, { status: 400 });
      const { error } = await access.database.from('orders').update({ is_gift: true, gift_message: message || null }).eq('id', body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Choose a valid order action and provide its required details.' }, { status: 400 });
  } catch (error) {
    console.error('[AdminOrders] Order update failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Order update failed.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role.toLowerCase()) && session.permissions.can_delete_items !== true) {
    return NextResponse.json({ error: 'Order deletion access is required.' }, { status: 403 });
  }
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return NextResponse.json({ error: 'Order database access is not configured on the server.' }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!validOrderId(id)) return NextResponse.json({ error: 'A valid order ID is required.' }, { status: 400 });
  const database = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await database.from('orders').delete().eq('id', id);
  if (error) {
    console.error('[AdminOrders] Could not delete order:', error);
    return NextResponse.json({ error: 'Order could not be deleted.' }, { status: 503 });
  }
  return NextResponse.json({ success: true });
}
