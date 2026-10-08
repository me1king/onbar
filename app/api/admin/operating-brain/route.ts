import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_REVENUE_ROWS = 100_000;

async function getRevenueTotal(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  let total = 0;

  for (let offset = 0; offset < MAX_REVENUE_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await database
      .from('financial_ledger')
      .select('amount')
      .eq('entry_type', 'REVENUE')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    for (const entry of data || []) {
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount)) throw new Error('Revenue ledger contains an invalid amount.');
      total += amount;
    }
    if (!data || data.length < PAGE_SIZE) return total;
  }

  throw new Error(`Revenue ledger scan exceeded ${MAX_REVENUE_ROWS} rows.`);
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Admin dashboard access required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({
      error: 'Server-side Supabase access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
    }, { status: 503 });
  }

  const [orders, patrons, runners, suppliers, automation, buzz] = await Promise.all([
    database.from('orders').select('id', { count: 'exact', head: true }),
    database.from('profiles').select('id', { count: 'exact', head: true }),
    database.from('rider_status').select('id', { count: 'exact', head: true }).eq('status', 'Online'),
    database.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    database.from('system_autonomous_state').select('is_autonomous'),
    database.from('buzz_posts').select('area_zone').in('status', ['LIVE', 'TRENDING'])
  ]);

  const errors: Record<string, string> = {};
  const recordError = (name: string, error: { message: string } | null) => {
    if (error) errors[name] = error.message;
  };
  recordError('orders', orders.error);
  recordError('patrons', patrons.error);
  recordError('runners', runners.error);
  recordError('suppliers', suppliers.error);
  recordError('automation', automation.error);
  recordError('buzz', buzz.error);

  let revenue: number | null = null;
  if (hasAdminPermission(session, 'can_view_revenue')) {
    try {
      revenue = await getRevenueTotal(database);
    } catch (error) {
      errors.revenue = error instanceof Error ? error.message : 'Could not load the financial ledger.';
    }
  } else {
    errors.revenue = 'Revenue permission is required to view this metric.';
  }

  const postsByArea = new Map<string, number>();
  for (const post of buzz.data || []) {
    const area = post.area_zone?.trim();
    if (area) postsByArea.set(area, (postsByArea.get(area) || 0) + 1);
  }
  const demandHotspot = [...postsByArea.entries()]
    .sort((first, second) => second[1] - first[1])[0]?.[0] || null;
  const autoStates = automation.data || [];
  const automationRate = autoStates.length > 0
    ? Number(((autoStates.filter(state => state.is_autonomous).length / autoStates.length) * 100).toFixed(1))
    : null;

  return NextResponse.json({
    stats: {
      revenue,
      orders: orders.error ? null : orders.count,
      users: patrons.error ? null : patrons.count,
      riders: runners.error ? null : runners.count,
      shops: suppliers.error ? null : suppliers.count,
      automation: automation.error ? null : automationRate,
      demand_hotspot: buzz.error ? null : demandHotspot
    },
    errors
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
