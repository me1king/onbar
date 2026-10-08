import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isKitchenFoodProduct } from '@/lib/productDepartment';

export const dynamic = 'force-dynamic';

function canManageOrders(session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>) {
  return ['owner', 'admin'].includes(session.role.toLowerCase())
    || session.permissions.can_manage_orders === true;
}

type KitchenProduct = {
  name: string | null;
  category: string | null;
  sub_category: string | null;
  is_bite: boolean | null;
  is_snack: boolean | null;
};

type KitchenOrderItem = {
  id: number;
  product_id: number | null;
  quantity: number | null;
  size: string | null;
  addons: unknown;
  status: string | null;
  products: KitchenProduct | KitchenProduct[] | null;
};

type KitchenOrder = {
  order_items: KitchenOrderItem[] | null;
  [key: string]: unknown;
};

function isFoodProduct(product: KitchenProduct | KitchenProduct[] | null) {
  const resolvedProduct = Array.isArray(product) ? product[0] : product;
  return resolvedProduct ? isKitchenFoodProduct(resolvedProduct) : false;
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!canManageOrders(session)) return NextResponse.json({ error: 'Order management access required.' }, { status: 403 });

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });
  }

  const department = new URL(request.url).searchParams.get('department');
  if (department && department !== 'food') {
    return NextResponse.json({ error: 'Unsupported kitchen department.' }, { status: 400 });
  }

  const { data, error } = await database
    .from('orders')
    .select('id, status, total_price, created_at, note, order_items(id, product_id, quantity, size, addons, status, products(name, category, sub_category, is_bite, is_snack))')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[AdminKitchen] Could not load orders:', error);
    return NextResponse.json({ error: `Kitchen orders could not be loaded: ${error.message}` }, { status: 500 });
  }

  const orders = data || [];
  if (department === 'food') {
    const foodOrders = (orders as unknown as KitchenOrder[])
      .map(order => ({
        ...order,
        order_items: (order.order_items || []).filter(item => isFoodProduct(item.products))
      }))
      .filter(order => order.order_items.length > 0);
    return NextResponse.json({ orders: foodOrders }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!canManageOrders(session)) return NextResponse.json({ error: 'Order management access required.' }, { status: 403 });

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });
  }

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid order ID and kitchen status are required.' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1 || !['PREPARING', 'PACKED'].includes(String(body.status))) {
    return NextResponse.json({ error: 'A valid order ID and kitchen status are required.' }, { status: 400 });
  }

  const { data: kitchenOrder, error: classificationError } = await database
    .from('orders')
    .select('order_items(id, status, products(category, sub_category, is_bite, is_snack))')
    .eq('id', id)
    .maybeSingle();
  if (classificationError) {
    console.error('[AdminKitchen] Could not classify order:', classificationError);
    return NextResponse.json({ error: `Order ${id} could not be checked for kitchen items.` }, { status: 500 });
  }
  const orderItems = kitchenOrder?.order_items as Array<{
    id: number;
    status: string | null;
    products: KitchenProduct | KitchenProduct[] | null;
  }> | null;
  const foodItems = orderItems?.filter(item => isFoodProduct(item.products)) || [];
  if (!foodItems.length) {
    return NextResponse.json({ error: 'This order has no food items and cannot be advanced in the kitchen.' }, { status: 409 });
  }

  const nextStatus = body.status as 'PREPARING' | 'PACKED';
  const allowedPreviousStatuses = nextStatus === 'PREPARING'
    ? ['pending', 'Pending', 'paid', 'Paid', 'created', 'Created']
    : ['preparing', 'Preparing'];
  if (foodItems.some(item => !item.status || !allowedPreviousStatuses.includes(item.status))) {
    return NextResponse.json({ error: 'Food items have already moved to another kitchen stage.' }, { status: 409 });
  }

  const { data, error } = await database
    .from('order_items')
    .update({ status: nextStatus })
    .eq('order_id', id)
    .in('id', foodItems.map(item => item.id))
    .in('status', allowedPreviousStatuses)
    .select('id');

  if (error) {
    console.error('[AdminKitchen] Could not advance food items:', error);
    return NextResponse.json({ error: `Food items for order ${id} could not be updated: ${error.message}` }, { status: 500 });
  }
  if (data?.length) {
    const actorEmail = session.email || (session.role === 'owner' ? 'Owner (PIN)' : 'Admin');
    let actorId: string | null = null;
    if (actorEmail !== 'Owner (PIN)' && actorEmail !== 'Admin') {
      const { data: staff } = await database.from('staff').select('id').eq('email', actorEmail).maybeSingle();
      actorId = staff?.id || null;
    }
    const changedItemIds = new Set(data.map(item => item.id));
    const { error: auditError } = await database.from('audit_logs').insert({
      staff_email: actorEmail,
      actor_id: actorId,
      actor_type: 'staff',
      actor_label: actorEmail,
      actor_role: session.role,
      action: 'KITCHEN_ITEMS_STATUS_CHANGED',
      outcome: 'SUCCESS',
      details: { department: 'food', updated_item_count: data.length },
      resource_type: 'order',
      resource_id: String(id),
      old_value: foodItems
        .filter(item => changedItemIds.has(item.id))
        .map(item => ({ item_id: item.id, status: item.status })),
      new_value: data.map(item => ({ item_id: item.id, status: nextStatus })),
      correlation_id: crypto.randomUUID(),
      request_id: request.headers.get('x-request-id')?.slice(0, 200) || crypto.randomUUID(),
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 100) || 'unknown',
      device_info: request.headers.get('user-agent')?.slice(0, 512) || 'Unknown'
    });
    if (auditError) {
      console.error('[AdminKitchen] Kitchen status changed, but audit logging failed:', auditError);
      return NextResponse.json({
        error: 'Kitchen status changed, but the audit trail could not be recorded. Refresh the ticket and contact an administrator before retrying.',
        order: { id, status: nextStatus, updated_food_items: data.length }
      }, { status: 503 });
    }
  }
  if (!data || data.length !== foodItems.length) {
    return NextResponse.json({ error: 'Some food items were not updated because they already moved to another kitchen stage. Refresh the kitchen tickets.' }, { status: 409 });
  }
  return NextResponse.json({ order: { id, status: nextStatus, updated_food_items: data.length } });
}
