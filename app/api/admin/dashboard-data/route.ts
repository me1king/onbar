import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Revenue dashboard permission required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Dashboard data is not configured.' }, { status: 503 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [orders, products, ledger, riders] = await Promise.all([
    database.from('orders')
      .select('id, total_price, status, created_at, order_items(product_id, unit_cost, quantity)')
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
    database.from('products').select('id, stock, name, price, image_url, cost_price, category, warehouse_location'),
    database.from('financial_ledger').select('id, amount, entry_type, created_at').gte('created_at', since),
    database.from('rider_status').select('id, rider_name, status, battery_level').neq('status', 'Offline')
  ]);
  const queryError = orders.error || products.error || ledger.error || riders.error;
  if (queryError) {
    console.error('[AdminDashboard] Could not load dashboard data:', queryError);
    return NextResponse.json({ error: 'Could not load dashboard data.' }, { status: 500 });
  }

  return NextResponse.json({
    orders: orders.data || [],
    products: products.data || [],
    ledger: ledger.data || [],
    riders: riders.data || []
  }, { headers: { 'Cache-Control': 'no-store' } });
}
