import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  getAdminSession,
  hasAdminPermission,
  isSameOriginRequest
} from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

type ScorecardRow = {
  application_id: string;
  business_name: string;
  town: string | null;
  accepting_orders: boolean;
  decisions_7d: number | string | null;
  accepted_7d: number | string | null;
  rejected_7d: number | string | null;
  avg_response_seconds_7d: number | string | null;
  decisions_30d: number | string | null;
  accepted_30d: number | string | null;
  rejected_30d: number | string | null;
  avg_response_seconds_30d: number | string | null;
  delivered_7d: number | string | null;
  delivered_30d: number | string | null;
  exceptions_7d: number | string | null;
  exceptions_30d: number | string | null;
};

type ScorecardEvent = {
  id: number;
  application_id: string;
  order_id: number;
  event_type: 'accepted' | 'rejected';
  occurred_at: string;
  response_seconds: number | string;
  details: Record<string, unknown> | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadRecentEvents(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>, since: string) {
  const pageSize = 1000;
  const events: ScorecardEvent[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await database.from('merchant_vendor_scorecard_events')
      .select('id, application_id, order_id, event_type, occurred_at, response_seconds, details')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) return { events: null, error };
    const page = (data || []) as ScorecardEvent[];
    events.push(...page);
    if (page.length < pageSize) return { events, error: null };
  }
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Delivery operations access is required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Delivery scorecards are not configured on the server.' }, { status: 503 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [vendorsResult, eventsResult] = await Promise.all([
    database.from('merchant_vendor_scorecard').select('*').order('business_name').limit(500),
    loadRecentEvents(database, since)
  ]);
  if (vendorsResult.error || eventsResult.error) {
    const error = vendorsResult.error || eventsResult.error;
    console.error('[DeliveryScorecard] Could not load merchant metrics:', error);
    const migrationMissing = /merchant_vendor_scorecard|schema cache|does not exist/i.test(error?.message || '');
    return NextResponse.json({
      error: migrationMissing
        ? 'The delivery scorecard migration is missing. Apply supabase/DELIVERY_VENDOR_SCORECARD_MIGRATION.sql.'
        : 'Merchant delivery metrics could not be loaded.'
    }, { status: 503 });
  }

  const vendors = (vendorsResult.data || []) as ScorecardRow[];
  const events = eventsResult.events || [];
  const trendByVendor = new Map<string, Map<string, { totalSeconds: number; count: number }>>();
  const declinesByVendor = new Map<string, Map<string, number>>();
  const recentByVendor = new Map<string, Array<{
    orderId: number;
    eventType: 'accepted' | 'rejected';
    occurredAt: string;
    responseSeconds: number;
    note: string | null;
  }>>();

  for (const event of events) {
    const day = event.occurred_at.slice(0, 10);
    const seconds = asNumber(event.response_seconds);
    const daily = trendByVendor.get(event.application_id) || new Map();
    const dailyMetric = daily.get(day) || { totalSeconds: 0, count: 0 };
    dailyMetric.totalSeconds += seconds;
    dailyMetric.count += 1;
    daily.set(day, dailyMetric);
    trendByVendor.set(event.application_id, daily);

    const note = typeof event.details?.note === 'string' ? event.details.note.trim().slice(0, 120) : '';
    if (event.event_type === 'rejected') {
      const reason = note || 'Reason not recorded';
      const reasons = declinesByVendor.get(event.application_id) || new Map();
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
      declinesByVendor.set(event.application_id, reasons);
    }

    const recent = recentByVendor.get(event.application_id) || [];
    if (recent.length < 20) {
      recent.push({
        orderId: Number(event.order_id),
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        responseSeconds: seconds,
        note: note || null
      });
      recentByVendor.set(event.application_id, recent);
    }
  }

  return NextResponse.json({
    vendors: vendors.map(vendor => ({
      applicationId: vendor.application_id,
      name: vendor.business_name,
      town: vendor.town,
      acceptingOrders: vendor.accepting_orders,
      windows: {
        7: {
          decisions: asNumber(vendor.decisions_7d),
          accepted: asNumber(vendor.accepted_7d),
          rejected: asNumber(vendor.rejected_7d),
          averageResponseSeconds: vendor.avg_response_seconds_7d === null
            ? null
            : asNumber(vendor.avg_response_seconds_7d),
          delivered: asNumber(vendor.delivered_7d),
          exceptions: asNumber(vendor.exceptions_7d)
        },
        30: {
          decisions: asNumber(vendor.decisions_30d),
          accepted: asNumber(vendor.accepted_30d),
          rejected: asNumber(vendor.rejected_30d),
          averageResponseSeconds: vendor.avg_response_seconds_30d === null
            ? null
            : asNumber(vendor.avg_response_seconds_30d),
          delivered: asNumber(vendor.delivered_30d),
          exceptions: asNumber(vendor.exceptions_30d)
        }
      },
      dailyResponse: [...(trendByVendor.get(vendor.application_id) || new Map())]
        .map(([date, metric]) => ({
          date,
          averageResponseSeconds: Math.round(metric.totalSeconds / metric.count),
          decisions: metric.count
        }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      declineReasons: [...(declinesByVendor.get(vendor.application_id) || new Map())]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 6),
      recentDecisions: recentByVendor.get(vendor.application_id) || []
    })),
    updatedAt: new Date().toISOString(),
    responseMetric: 'Seconds from order creation to the merchant accept/reject event; not offer-delivery latency.'
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Requests must come from this site.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Delivery operations access is required.' }, { status: 403 });
  }

  let body: { applicationId?: unknown; acceptingOrders?: unknown; reason?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid merchant availability request is required.' }, { status: 400 });
  }

  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)
    || typeof body.acceptingOrders !== 'boolean'
    || reason.length < 8 || reason.length > 500) {
    return NextResponse.json({
      error: 'Choose a valid merchant, availability state and an audit reason of 8 to 500 characters.'
    }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Merchant availability controls are not configured on the server.' }, { status: 503 });
  }
  const { data, error } = await database.rpc('set_merchant_order_availability_admin', {
    p_application_id: applicationId,
    p_accepting_orders: body.acceptingOrders,
    p_actor: session.email || session.role,
    p_reason: reason
  });
  if (error) {
    console.error('[DeliveryScorecard] Could not update merchant availability:', error);
    const unavailable = /set_merchant_order_availability_admin|schema cache|does not exist/i.test(error.message);
    return NextResponse.json({
      error: unavailable
        ? 'The delivery scorecard migration is missing. Apply supabase/DELIVERY_VENDOR_SCORECARD_MIGRATION.sql.'
        : 'Merchant availability could not be changed. Confirm the business is still approved.'
    }, { status: 503 });
  }

  return NextResponse.json({ acceptingOrders: Boolean(data) }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
