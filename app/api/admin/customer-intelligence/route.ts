import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

interface OrderItem {
  quantity: number | null;
  unit_cost: number | null;
}

interface OrderRow {
  id: number;
  user_id: string | null;
  customer_phone: string | null;
  total_price: number | null;
  delivery_cost: number | null;
  status: string | null;
  created_at: string;
  referred_by_code: string | null;
  order_items: OrderItem[] | null;
}

interface PeriodMetrics {
  revenue: number;
  orders: number;
  customers: number;
  repeatCustomers: number;
  repeatRate: number | null;
  averageOrderValue: number | null;
  revenuePerCustomer: number | null;
  referralOrders: number;
  referralRevenue: number;
  itemCostCoveragePercent: number | null;
  contributionBeforeFeesAndRefunds: number | null;
}

interface SearchInsight {
  term: string;
  count: number;
}

interface SearchInsights {
  available: boolean;
  windowDays: number;
  consentedSearches: number;
  zeroResultSearches: number;
  topSearches: SearchInsight[];
  zeroResultTerms: SearchInsight[];
  truncated: boolean;
  reason?: string;
}

function customerKey(order: OrderRow): string | null {
  if (order.user_id) return `user:${order.user_id}`;
  const phone = order.customer_phone?.replace(/\D/g, '');
  return phone ? `phone:${phone}` : null;
}

function safeSearchTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const term = value.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (
    term.length < 2
    || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(term)
    || /^[+()\d\s.-]{7,}$/.test(term)
  ) return null;
  return term;
}

async function loadSearchInsights(
  database: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  since: string
): Promise<SearchInsights> {
  const rows: Array<{ event_name: string; payload: Record<string, unknown> | null }> = [];
  const pageSize = 1000;
  const maxRows = 10_000;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await database.from('analytics_events')
      .select('event_name,payload')
      .in('event_name', ['SEARCH_SUBMITTED', 'ZERO_RESULTS'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error('[CustomerIntelligence] Could not load aggregate search insights:', error);
      return {
        available: false,
        windowDays: 30,
        consentedSearches: 0,
        zeroResultSearches: 0,
        topSearches: [],
        zeroResultTerms: [],
        truncated: false,
        reason: 'Consent-based search insights could not be loaded.'
      };
    }

    const batch = data || [];
    rows.push(...batch.map(row => ({
      event_name: row.event_name,
      payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? row.payload as Record<string, unknown>
        : null
    })));
    if (batch.length < pageSize) break;
  }

  const top = new Map<string, { term: string; count: number }>();
  const zero = new Map<string, { term: string; count: number }>();
  let consentedSearches = 0;
  let zeroResultSearches = 0;

  for (const row of rows) {
    const term = safeSearchTerm(row.payload?.query);
    if (!term) continue;
    const key = term.toLocaleLowerCase();
    if (row.event_name === 'SEARCH_SUBMITTED') {
      consentedSearches += 1;
      const current = top.get(key);
      top.set(key, { term: current?.term || term, count: (current?.count || 0) + 1 });
    } else {
      zeroResultSearches += 1;
      const current = zero.get(key);
      zero.set(key, { term: current?.term || term, count: (current?.count || 0) + 1 });
    }
  }

  const sortCounts = (counts: Map<string, SearchInsight>) => [...counts.values()]
    .filter(insight => insight.count >= 3)
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term))
    .slice(0, 10);

  return {
    available: true,
    windowDays: 30,
    consentedSearches,
    zeroResultSearches,
    topSearches: sortCounts(top),
    zeroResultTerms: sortCounts(zero),
    truncated: rows.length === maxRows
  };
}

async function loadOrders(
  database: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  from: string,
  to: string
): Promise<OrderRow[]> {
  const rows: OrderRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await database
      .from('orders')
      .select('id, user_id, customer_phone, total_price, delivery_cost, status, created_at, referred_by_code, order_items(quantity, unit_cost)')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const batch = (data || []) as OrderRow[];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

function summarize(orders: OrderRow[]): PeriodMetrics {
  const completedOrders = orders.filter(order =>
    ['paid', 'delivered'].includes((order.status || '').toLowerCase())
  );
  const customers = new Map<string, number>();
  let revenue = 0;
  let referralOrders = 0;
  let referralRevenue = 0;
  let totalItems = 0;
  let costedItems = 0;
  let allCostsAvailable = completedOrders.length > 0;
  let itemCosts = 0;
  let deliveryCosts = 0;

  for (const order of completedOrders) {
    const orderRevenue = Number(order.total_price) || 0;
    revenue += orderRevenue;
    const key = customerKey(order);
    if (key) customers.set(key, (customers.get(key) || 0) + 1);

    if (order.referred_by_code?.trim()) {
      referralOrders += 1;
      referralRevenue += orderRevenue;
    }

    deliveryCosts += Number(order.delivery_cost) || 0;
    const items = order.order_items || [];
    if (items.length === 0) allCostsAvailable = false;
    for (const item of items) {
      totalItems += 1;
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unit_cost);
      if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitCost) && unitCost > 0) {
        costedItems += 1;
        itemCosts += quantity * unitCost;
      } else {
        allCostsAvailable = false;
      }
    }
  }

  const repeatCustomers = Array.from(customers.values()).filter(count => count > 1).length;
  const customerCount = customers.size;
  return {
    revenue,
    orders: completedOrders.length,
    customers: customerCount,
    repeatCustomers,
    repeatRate: customerCount > 0 ? repeatCustomers / customerCount * 100 : null,
    averageOrderValue: completedOrders.length > 0 ? revenue / completedOrders.length : null,
    revenuePerCustomer: customerCount > 0 ? revenue / customerCount : null,
    referralOrders,
    referralRevenue,
    itemCostCoveragePercent: totalItems > 0 ? costedItems / totalItems * 100 : null,
    contributionBeforeFeesAndRefunds: allCostsAvailable
      ? revenue - itemCosts - deliveryCosts
      : null
  };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Customer intelligence requires revenue permission.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side customer intelligence database access is not configured.' }, { status: 503 });
  }

  const now = new Date();
  const currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const searchStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [currentOrders, previousOrders, searchInsights] = await Promise.all([
      loadOrders(database, currentStart.toISOString(), now.toISOString()),
      loadOrders(database, previousStart.toISOString(), currentStart.toISOString()),
      loadSearchInsights(database, searchStart.toISOString())
    ]);
    const current = summarize(currentOrders);
    const previous = summarize(previousOrders);

    return NextResponse.json({
      windowDays: 90,
      generatedAt: now.toISOString(),
      current,
      previous: {
        revenue: previous.revenue,
        orders: previous.orders,
        customers: previous.customers
      },
      searchInsights,
      referralAttribution: {
        description: 'Orders with a saved referral code; this does not identify paid marketing channels.',
        orders: current.referralOrders,
        revenue: current.referralRevenue
      },
      dataReadiness: {
        cac: 'unavailable',
        cacReason: 'Campaign and channel acquisition spend is not recorded in a reportable spend ledger.',
        predictedLtv: 'unavailable',
        predictedLtvReason: 'No validated prediction model is configured. Revenue per customer is historical and limited to this 90-day window.',
        contribution: current.contributionBeforeFeesAndRefunds === null ? 'incomplete' : 'available',
        contributionNote: 'Contribution excludes payment fees, refunds, discounts, and customer-service costs.'
      }
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[CustomerIntelligence] Could not calculate customer economics:', error);
    return NextResponse.json({
      error: `Customer economics could not be loaded: ${error instanceof Error ? error.message : 'Unexpected database error.'}`
    }, { status: 500 });
  }
}
