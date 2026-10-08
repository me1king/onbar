import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

function canManageOrders(session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>) {
  return ['owner', 'admin'].includes(session.role.toLowerCase())
    || session.permissions.can_manage_orders === true;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!canManageOrders(session)) return NextResponse.json({ error: 'Order management access required.' }, { status: 403 });

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });
  }

  const { data, error } = await database
    .from('orders')
    .select('id, status, total_price, created_at, note, order_items(product_id, quantity, size, addons, products(name))')
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[AdminKitchen] Could not load orders:', error);
    return NextResponse.json({ error: `Kitchen orders could not be loaded: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ orders: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
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

  const nextStatus = body.status as 'PREPARING' | 'PACKED';
  const allowedPreviousStatuses = nextStatus === 'PREPARING'
    ? ['pending', 'Pending', 'paid', 'Paid', 'created', 'Created']
    : ['preparing', 'Preparing'];
  const { data, error } = await database
    .from('orders')
    .update({ status: nextStatus })
    .eq('id', id)
    .in('status', allowedPreviousStatuses)
    .select('id, status')
    .maybeSingle();

  if (error) {
    console.error('[AdminKitchen] Could not advance order:', error);
    return NextResponse.json({ error: `Order ${id} could not be updated: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Order not found or it has already moved to another kitchen stage.' }, { status: 409 });
  }
  return NextResponse.json({ order: data });
}
