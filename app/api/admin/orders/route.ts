import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { isValidTransition, type OrderStatus } from '@/lib/ob-os/state-machine';

export const dynamic = 'force-dynamic';

const orderStatuses: OrderStatus[] = [
  'Created', 'Payment Pending', 'Paid', 'Stock Reserved', 'Supplier Confirmed',
  'Processing', 'Packed', 'Dispatched', 'Out for Delivery', 'Delivered',
  'Completed', 'Cancelled', 'Payment Failed', 'Refunded', 'Warranty', 'Returned'
];

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
    .select('id,status,order_items(*)')
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
    console.error('[AdminOrders] State transition RPC failed; applying validated status update:', transition.error);
    const { error } = await database.from('orders').update({ status }).eq('id', id);
    if (error) {
      console.error('[AdminOrders] Could not update order status:', error);
      throw new Error(error.message);
    }
  }

  if (status === 'Delivered' && currentStatus !== 'Delivered') {
    for (const item of order.order_items || []) {
      const { data: product, error: productReadError } = await database
        .from('products')
        .select('stock,variant_stock')
        .eq('id', item.product_id)
        .maybeSingle();
      if (productReadError) {
        console.error('[AdminOrders] Could not read product stock after delivery:', productReadError);
        throw new Error(`Order #${id} was delivered, but product stock could not be updated.`);
      }
      if (!product) continue;

      const quantity = Number(item.quantity || 1);
      const nextStock = Math.max(0, Number(product.stock || 0) - quantity);
      const variantStock = product.variant_stock && typeof product.variant_stock === 'object'
        ? { ...product.variant_stock as Record<string, number> }
        : {};
      if (item.size && variantStock[item.size] !== undefined) {
        variantStock[item.size] = Math.max(0, Number(variantStock[item.size] || 0) - quantity);
      }
      const updates = item.size && variantStock[item.size] !== undefined
        ? { stock: nextStock, variant_stock: variantStock }
        : { stock: nextStock };
      const { error: stockError } = await database.from('products').update(updates).eq('id', item.product_id);
      if (stockError) {
        console.error('[AdminOrders] Could not decrement product stock after delivery:', stockError);
        throw new Error(`Order #${id} was delivered, but product stock could not be updated.`);
      }
    }
  }
  return { oldStatus: currentStatus };
}

export async function GET() {
  const access = await getAccess();
  if ('response' in access) return access.response;
  const [orders, products] = await Promise.all([
    access.database.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }),
    access.database.from('products').select('id,name,price,cost_price,stock,variant_stock').order('name')
  ]);
  if (orders.error || products.error) {
    const error = orders.error || products.error;
    console.error('[AdminOrders] Could not load order fulfillment data:', error);
    return NextResponse.json({ error: 'Orders or product inventory could not be loaded. Check the database connection and schema.' }, { status: 503 });
  }
  return NextResponse.json({ orders: orders.data || [], products: products.data || [] }, {
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
    || !Number.isFinite(totalPrice) || totalPrice < 0 || !isOrderStatus(body.status)
    || !['M-Pesa', 'COD', 'Paystack'].includes(String(body.payment_method))
    || (body.product_id !== null && body.product_id !== undefined && !validOrderId(body.product_id))) {
    return NextResponse.json({ error: 'Enter valid customer, product, quantity, price, status and payment details.' }, { status: 400 });
  }
  const { data, error } = await access.database.from('orders').insert({
    customer_name: customerName,
    customer_phone: customerPhone,
    quantity,
    total_price: totalPrice,
    status: body.status,
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
      const result = await updateOrderStatus(access.database, body.id, body.status, access.session.email || 'Admin',
        body.status === 'Paid' ? 'Payment Verified' : 'Manual Status Update');
      return NextResponse.json(result);
    }
    if (action === 'bulk_status' && Array.isArray(body.ids) && body.ids.length > 0
      && body.ids.length <= 100 && body.ids.every(validOrderId) && isOrderStatus(body.status)) {
      const { data: orders, error: readError } = await access.database.from('orders')
        .select('id,status').in('id', body.ids);
      if (readError || !orders || orders.length !== body.ids.length) throw new Error('One or more selected orders could not be found.');
      const invalid = orders.find(order => !isOrderStatus(order.status) || !isValidTransition(order.status as OrderStatus, body.status as OrderStatus));
      if (invalid) throw new Error(`Cannot move order #${invalid.id} from ${invalid.status} to ${String(body.status)}.`);
      const { error } = await access.database.from('orders').update({ status: body.status }).in('id', body.ids);
      if (error) throw new Error(error.message);
      return NextResponse.json({ updated: body.ids.length });
    }
    if (action === 'gift' && validOrderId(body.id) && typeof body.message === 'string') {
      const message = body.message.trim();
      if (message.length > 1000) return NextResponse.json({ error: 'Gift message must be 1,000 characters or fewer.' }, { status: 400 });
      const { error } = await access.database.from('orders').update({ is_gift: true, gift_message: message || null }).eq('id', body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }
    if (action === 'rider' && validOrderId(body.id)
      && typeof body.name === 'string' && body.name.trim()
      && typeof body.phone === 'string' && body.phone.trim()) {
      const { data: order, error: readError } = await access.database.from('orders').select('status').eq('id', body.id).maybeSingle();
      if (readError || !order) throw new Error(readError?.message || 'That order could not be found.');
      if (!isOrderStatus(order.status) || !isValidTransition(order.status, 'Dispatched')) {
        throw new Error(`Cannot dispatch an order from ${String(order.status)}.`);
      }
      const { error } = await access.database.from('orders').update({
        rider_name: body.name.trim(),
        rider_phone: body.phone.trim(),
        status: 'Dispatched'
      }).eq('id', body.id);
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
