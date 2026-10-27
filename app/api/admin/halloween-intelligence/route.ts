import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const eventNames = [
  'HALLOWEEN_SEARCH',
  'HALLOWEEN_ZERO_RESULTS',
  'HALLOWEEN_FILTER',
  'HALLOWEEN_PRODUCT_VIEW',
  'HALLOWEEN_ADD_TO_CART',
  'HALLOWEEN_TRYON_OPEN',
  'HALLOWEEN_FIT_QUIZ_OPEN',
  'HALLOWEEN_PHOTO_PREVIEW_OPEN'
] as const;
const maximumRows = 20_000;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeText(value: unknown, maximumLength: number) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().replace(/\s+/g, ' ').slice(0, maximumLength)
    : '';
}

function isSensitiveSearch(value: string) {
  return value.includes('@') || /^[+0-9() .-]{7,}$/.test(value);
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Demand intelligence access requires revenue permission.' }, { status: 403 });
  }

  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(7, Math.floor(requestedDays))) : 30;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Halloween demand database access is not configured.' }, { status: 503 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, count, error } = await database
    .from('analytics_events')
    .select('event_name,payload,created_at', { count: 'exact' })
    .in('event_name', [...eventNames])
    .eq('payload->>analytics_consent', 'true')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(maximumRows);

  if (error) {
    console.error('[HalloweenIntelligence] Could not load consented shop events:', error);
    return NextResponse.json({ error: 'Halloween demand data could not be loaded.' }, { status: 503 });
  }

  const eventTotals: Record<string, number> = Object.fromEntries(eventNames.map(name => [name, 0]));
  const searches = new Map<string, { query: string; searches: number; zeroResults: number }>();
  const products = new Map<string, { productId: string; name: string; category: string; views: number; addToCart: number; tryOns: number }>();
  const filters = new Map<string, { type: string; value: string; count: number }>();
  const daily = new Map<string, { date: string; searches: number; zeroResults: number; addToCart: number }>();
  for (const event of data || []) {
    const eventName = event.event_name;
    eventTotals[eventName] = (eventTotals[eventName] || 0) + 1;
    const payload = record(event.payload);
    const day = typeof event.created_at === 'string' ? event.created_at.slice(0, 10) : '';
    const dayTotals = daily.get(day) || { date: day, searches: 0, zeroResults: 0, addToCart: 0 };
    if (eventName === 'HALLOWEEN_SEARCH') {
      dayTotals.searches += 1;
      const term = safeText(payload.query, 80);
      if (term && !isSensitiveSearch(term)) {
        const key = term.toLocaleLowerCase();
        const aggregate = searches.get(key) || { query: term, searches: 0, zeroResults: 0 };
        aggregate.searches += 1;
        searches.set(key, aggregate);
      }
    } else if (eventName === 'HALLOWEEN_ZERO_RESULTS') {
      dayTotals.zeroResults += 1;
      const term = safeText(payload.query, 80);
      if (term && !isSensitiveSearch(term)) {
        const key = term.toLocaleLowerCase();
        const aggregate = searches.get(key) || { query: term, searches: 0, zeroResults: 0 };
        aggregate.zeroResults += 1;
        searches.set(key, aggregate);
      }
    } else if (eventName === 'HALLOWEEN_ADD_TO_CART') {
      dayTotals.addToCart += 1;
    } else if (eventName === 'HALLOWEEN_FILTER') {
      const type = safeText(payload.filter_type, 40);
      const value = safeText(payload.value, 80);
      if (type && value) {
        const key = `${type.toLocaleLowerCase()}|${value.toLocaleLowerCase()}`;
        const aggregate = filters.get(key) || { type, value, count: 0 };
        aggregate.count += 1;
        filters.set(key, aggregate);
      }
    }
    if (day) daily.set(day, dayTotals);

    if (['HALLOWEEN_PRODUCT_VIEW', 'HALLOWEEN_ADD_TO_CART', 'HALLOWEEN_TRYON_OPEN'].includes(eventName)) {
      const productId = safeText(payload.product_id, 40);
      const name = safeText(payload.product_name, 120);
      if (productId && name) {
        const product = products.get(productId) || {
          productId,
          name,
          category: safeText(payload.category, 80),
          views: 0,
          addToCart: 0,
          tryOns: 0
        };
        if (eventName === 'HALLOWEEN_PRODUCT_VIEW') product.views += 1;
        if (eventName === 'HALLOWEEN_ADD_TO_CART') product.addToCart += 1;
        if (eventName === 'HALLOWEEN_TRYON_OPEN') product.tryOns += 1;
        products.set(productId, product);
      }
    }
  }

  const totalEvents = count ?? (data || []).length;
  return NextResponse.json({
    days,
    totalEvents,
    scannedEvents: (data || []).length,
    truncated: totalEvents > maximumRows,
    eventTotals,
    topSearches: [...searches.values()]
      .sort((left, right) => right.zeroResults - left.zeroResults || right.searches - left.searches)
      .slice(0, 10),
    products: [...products.values()].sort((left, right) =>
      right.addToCart - left.addToCart || right.tryOns - left.tryOns || right.views - left.views
    ).slice(0, 20),
    topFilters: [...filters.values()].sort((left, right) => right.count - left.count).slice(0, 10),
    dailyTrend: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
