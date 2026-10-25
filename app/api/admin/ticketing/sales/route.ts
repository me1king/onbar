import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  }
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Ticket sales reporting is restricted to platform admins.' }, { status: 403 });
  }

  const period = request.nextUrl.searchParams.get('period') || 'all';
  if (!['all', '7d', '30d'].includes(period)) {
    return NextResponse.json({ error: 'Choose a supported ticket sales reporting period.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });
  }

  const since = period === 'all'
    ? null
    : new Date(Date.now() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await database.rpc('ticketing_admin_sales_report', {
    p_since: since,
    p_until: null
  });
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') {
      return NextResponse.json({
        error: 'Apply supabase/TICKETING_SALES_REPORT_MIGRATION.sql to enable isolated ticket sales reporting.'
      }, { status: 503 });
    }
    console.error('[TicketingSales] Could not load the ticket-only sales report:', error);
    return NextResponse.json({ error: 'Ticket sales could not be loaded.' }, { status: 503 });
  }

  const report = data as { reportVersion?: number; recentOrders?: unknown[] } | null;
  if (report?.reportVersion !== 2 || report.recentOrders?.some(order =>
    typeof order !== 'object' || order === null
    || !('paymentProvider' in order) || !('paymentReference' in order) || !('verifiedAt' in order))) {
    return NextResponse.json({
      error: 'Reapply supabase/TICKETING_SALES_REPORT_MIGRATION.sql to include verified payment references in the Ticketing ledger.'
    }, { status: 503 });
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
