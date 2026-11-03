import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

type SourceStats = { source: string; visitors: number; orders: number; revenue: number };

function sourceLabel(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLowerCase() : '';
  if (!raw) return 'Direct / unknown';
  if (raw.includes('instagram') || raw === 'ig') return 'Instagram';
  if (raw.includes('facebook') || raw === 'fb') return 'Facebook';
  if (raw.includes('whatsapp') || raw === 'wa') return 'WhatsApp';
  if (raw.includes('tiktok')) return 'TikTok';
  if (raw.includes('google')) return 'Google';
  if (raw.includes('ref')) return 'Referral';
  if (raw.includes('utm_source:')) return raw.split('utm_source:')[1] || 'Campaign';
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

export async function GET() {
  const session = await getAdminSession();
  if (!session || (!hasAdminPermission(session, 'can_view_revenue') && !hasAdminPermission(session, 'can_manage_marketing'))) {
    return NextResponse.json({ error: 'Leads access requires marketing or revenue permission.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Leads database access is not configured.' }, { status: 503 });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [ordersResult, eventsResult] = await Promise.all([
    database.from('orders')
      .select('id, customer_name, customer_email, total_price, status, created_at, attribution_id, referred_by_code')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000),
    database.from('analytics_events')
      .select('event_name, payload, anonymous_id, created_at')
      .gte('created_at', since)
      .in('event_name', ['PAGE_VIEW', 'ORDER_CREATED', 'PURCHASE_COMPLETED'])
      .limit(10000)
  ]);
  if (ordersResult.error || eventsResult.error) {
    console.error('[Leads] Could not load acquisition data:', ordersResult.error || eventsResult.error);
    return NextResponse.json({ error: 'Lead attribution data could not be loaded.' }, { status: 503 });
  }

  const stats = new Map<string, SourceStats>();
  const ensure = (source: string) => {
    const existing = stats.get(source);
    if (existing) return existing;
    const created = { source, visitors: 0, orders: 0, revenue: 0 };
    stats.set(source, created);
    return created;
  };
  const events = eventsResult.data || [];
  const visitorIds = new Map<string, Set<string>>();
  for (const event of events) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
    const source = sourceLabel(payload.utm_source || payload.source || payload.referrer);
    ensure(source);
    if (event.event_name === 'PAGE_VIEW') {
      const identity = event.anonymous_id || `${source}:${event.created_at}`;
      const identities = visitorIds.get(source) || new Set<string>();
      identities.add(identity);
      visitorIds.set(source, identities);
    }
  }
  for (const [source, identities] of visitorIds) ensure(source).visitors = identities.size;

  const recentOrders = (ordersResult.data || []).map(order => {
    const source = sourceLabel(order.attribution_id || order.referred_by_code);
    const row = ensure(source);
    row.orders += 1;
    row.revenue += Number(order.total_price || 0);
    return { ...order, source };
  });
  const totals = [...stats.values()].reduce((summary, row) => ({
    visitors: summary.visitors + row.visitors,
    orders: summary.orders + row.orders,
    revenue: summary.revenue + row.revenue
  }), { visitors: 0, orders: 0, revenue: 0 });

  return NextResponse.json({
    periodDays: 90,
    totals,
    sources: [...stats.values()].sort((a, b) => b.orders - a.orders || b.visitors - a.visitors),
    recentOrders: recentOrders.slice(0, 100)
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
