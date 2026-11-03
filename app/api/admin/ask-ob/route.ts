import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const queryIntents = ['low_stock', 'top_customers', 'revenue', 'orders'] as const;
type QueryIntent = typeof queryIntents[number];
const QUERY_TIMEOUT_MS = 8_000;

function isQueryIntent(value: unknown): value is QueryIntent {
  return typeof value === 'string' && queryIntents.includes(value as QueryIntent);
}

function queryErrorResponse(intent: QueryIntent) {
  const message = intent === 'low_stock'
    ? 'Low-stock inventory could not be loaded. Please retry.'
    : 'Operations data could not be loaded. Please retry.';
  return NextResponse.json({ error: message }, { status: 503 });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session || !['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Admin dashboard access is required.' }, { status: 401 });
  }

  let body: { intent?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Choose a supported operations question.' }, { status: 400 });
  }
  if (!isQueryIntent(body.intent)) {
    return NextResponse.json({ error: 'Choose a supported operations question.' }, { status: 400 });
  }
  const intent = body.intent;

  if (intent === 'revenue' && !hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Revenue permission is required to view this metric.' }, { status: 403 });
  }
  if (intent === 'top_customers' && !hasAdminPermission(session, 'can_view_sensitive_data')) {
    return NextResponse.json({ error: 'Sensitive-data permission is required to view customer rankings.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side operations database access is not configured.' }, { status: 503 });
  }

  try {
    const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
    if (intent === 'low_stock') {
      const { data, count, error } = await database
        .from('products')
        .select('id,name,stock', { count: 'exact' })
        .lte('stock', 5)
        .order('stock', { ascending: true })
        .limit(10)
        .abortSignal(signal);
      if (error) {
        console.error('[AskOB] Could not load low-stock inventory:', error);
        return queryErrorResponse(intent);
      }
      return NextResponse.json({
        intent,
        count: count ?? 0,
        products: (data || []).map(product => ({
          id: Number(product.id),
          name: product.name,
          stock: Number(product.stock)
        })),
        truncated: (count ?? 0) > 10
      }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }

    if (intent === 'orders') {
      const { count, error } = await database
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .abortSignal(signal);
      if (error) {
        console.error('[AskOB] Could not count orders:', error);
        return queryErrorResponse(intent);
      }
      return NextResponse.json(
        { intent, count: count ?? 0 },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
      );
    }

    if (intent === 'top_customers') {
      const { data, error } = await database
        .from('orders')
        .select('customer_name,total_price')
        .eq('status', 'Delivered')
        .order('created_at', { ascending: false })
        .limit(2_000)
        .abortSignal(signal);
      if (error) {
        console.error('[AskOB] Could not load delivered customer orders:', error);
        return queryErrorResponse(intent);
      }
      const spending = new Map<string, number>();
      for (const order of data || []) {
        const name = typeof order.customer_name === 'string' ? order.customer_name.trim() : '';
        const amount = Number(order.total_price);
        if (!name || !Number.isFinite(amount) || amount < 0) continue;
        spending.set(name, (spending.get(name) || 0) + amount);
      }
      const customers = [...spending.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((first, second) => second.total - first.total)
        .slice(0, 3);
      return NextResponse.json(
        { intent, customers, sampleSize: (data || []).length },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
      );
    }

    let total = 0;
    const pageSize = 1_000;
    const maxRows = 10_000;
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await database
        .from('financial_ledger')
        .select('amount')
        .eq('entry_type', 'REVENUE')
        .range(offset, offset + pageSize - 1)
        .abortSignal(signal);
      if (error) {
        console.error('[AskOB] Could not load revenue ledger:', error);
        return queryErrorResponse(intent);
      }
      for (const entry of data || []) {
        const amount = Number(entry.amount);
        if (Number.isFinite(amount)) total += amount;
      }
      if (!data || data.length < pageSize) {
        return NextResponse.json(
          { intent, total, complete: true },
          { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
        );
      }
    }
    return NextResponse.json(
      { intent, total, complete: false },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    console.error(`[AskOB] The ${intent} request timed out or failed:`, error);
    return queryErrorResponse(intent);
  }
}
