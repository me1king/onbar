import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Analytics access requires revenue permission.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server-side analytics database access is not configured.' }, { status: 503 });

  const [orders, members, stock, support, preparing, runners, events] = await Promise.all([
    database.rpc('get_completed_order_summary'),
    database.from('profiles').select('id', { count: 'exact', head: true }),
    database.rpc('get_listed_price_stock_value'),
    database.from('support_tickets').select('id', { count: 'exact', head: true }),
    database.from('orders').select('id', { count: 'exact', head: true }).in('status', ['Pending', 'Preparing']),
    database.from('rider_status').select('id', { count: 'exact', head: true }).neq('status', 'Offline'),
    database.from('analytics_events').select('id', { count: 'exact', head: true })
  ]);

  const problems: string[] = [];
  const noteProblem = (label: string, error: { code?: string; message: string } | null) => {
    if (!error) return;
    const migrationIsMissing = error.code === '42883' || error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205';
    problems.push(`${label}: ${migrationIsMissing
      ? 'run supabase/ADMIN_DASHBOARD_RECOVERY_MIGRATION.sql and its documented prerequisites'
      : error.message}`);
  };
  noteProblem('Completed sales', orders.error);
  noteProblem('Member count', members.error);
  noteProblem('Stock value', stock.error);
  noteProblem('Support tickets', support.error);
  noteProblem('Preparing orders', preparing.error);
  noteProblem('Active riders', runners.error);
  noteProblem('Analytics events', events.error);

  const orderSummary = Array.isArray(orders.data) ? orders.data[0] : null;
  const revenue = orderSummary ? Number(orderSummary.total_revenue) : null;
  const orderCount = orderSummary ? Number(orderSummary.order_count) : null;
  return NextResponse.json({
    stats: {
      totalRevenue: orders.error ? null : revenue,
      activeUsers: members.error ? null : members.count,
      conversionRate: null,
      avgOrderValue: orders.error || orderCount === null ? null : orderCount > 0 ? Math.round((revenue || 0) / orderCount) : 0,
      inventoryValue: stock.error || stock.data === null ? null : Number(stock.data),
      supportTickets: support.error ? null : support.count,
      activeRunners: runners.error ? null : runners.count,
      preparingOrders: preparing.error ? null : preparing.count,
      totalSignals: events.error ? null : events.count
    },
    problems
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
