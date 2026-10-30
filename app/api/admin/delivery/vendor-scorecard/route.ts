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
  vendor_type: 'retailer' | 'wholesaler' | 'street_food';
  accepting_orders: boolean;
  target_reply_seconds: number | string;
  target_prep_minutes: number | string;
  target_acceptance_pct: number | string;
  target_ontime_pct: number | string;
  target_rating: number | string;
  target_complaints_per_100: number | string;
  min_decisions: number | string;
  score_7d: number | string | null;
  rank_7d: number | null;
  zone_size_7d: number | string | null;
  grade_7d: string | null;
  score_30d: number | string | null;
  rank_30d: number | null;
  zone_size_30d: number | string | null;
  grade_30d: string | null;
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
  avg_prep_minutes_7d: number | string | null;
  avg_prep_minutes_30d: number | string | null;
  ontime_pct_7d: number | string | null;
  ontime_pct_30d: number | string | null;
  avg_rating_7d: number | string | null;
  avg_rating_30d: number | string | null;
  vendor_complaints_7d: number | string | null;
  vendor_complaints_30d: number | string | null;
  complaints_per_100_7d: number | string | null;
  complaints_per_100_30d: number | string | null;
  compliance_score: number | string | null;
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
    database.from('merchant_vendor_performance').select('*').order('business_name').limit(500),
    loadRecentEvents(database, since)
  ]);
  if (vendorsResult.error || eventsResult.error) {
    const error = vendorsResult.error || eventsResult.error;
    console.error('[DeliveryScorecard] Could not load merchant metrics:', error);
    const migrationMissing = /merchant_vendor_scorecard|merchant_vendor_performance|schema cache|does not exist/i.test(error?.message || '');
    return NextResponse.json({
      error: migrationMissing
        ? 'The vendor performance migrations are missing. Apply supabase/DELIVERY_VENDOR_SCORECARD_MIGRATION.sql and supabase/DELIVERY_VENDOR_PERFORMANCE_MIGRATION.sql.'
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
      vendorType: vendor.vendor_type,
      acceptingOrders: vendor.accepting_orders,
      targets: {
        replySeconds: asNumber(vendor.target_reply_seconds),
        prepMinutes: asNumber(vendor.target_prep_minutes),
        acceptancePercent: asNumber(vendor.target_acceptance_pct),
        onTimePercent: asNumber(vendor.target_ontime_pct),
        rating: asNumber(vendor.target_rating),
        complaintsPer100: asNumber(vendor.target_complaints_per_100),
        minimumDecisions: asNumber(vendor.min_decisions)
      },
      windows: {
        7: {
          decisions: asNumber(vendor.decisions_7d),
          accepted: asNumber(vendor.accepted_7d),
          rejected: asNumber(vendor.rejected_7d),
          averageResponseSeconds: vendor.avg_response_seconds_7d === null
            ? null
            : asNumber(vendor.avg_response_seconds_7d),
          averagePrepMinutes: vendor.avg_prep_minutes_7d === null ? null : asNumber(vendor.avg_prep_minutes_7d),
          onTimePercent: vendor.ontime_pct_7d === null ? null : asNumber(vendor.ontime_pct_7d),
          averageRating: vendor.avg_rating_7d === null ? null : asNumber(vendor.avg_rating_7d),
          vendorComplaints: asNumber(vendor.vendor_complaints_7d),
          complaintsPer100: vendor.complaints_per_100_7d === null ? null : asNumber(vendor.complaints_per_100_7d),
          delivered: asNumber(vendor.delivered_7d),
          exceptions: asNumber(vendor.exceptions_7d),
          score: vendor.score_7d === null ? null : asNumber(vendor.score_7d),
          grade: vendor.grade_7d,
          rank: vendor.rank_7d,
          zoneSize: asNumber(vendor.zone_size_7d)
        },
        30: {
          decisions: asNumber(vendor.decisions_30d),
          accepted: asNumber(vendor.accepted_30d),
          rejected: asNumber(vendor.rejected_30d),
          averageResponseSeconds: vendor.avg_response_seconds_30d === null
            ? null
            : asNumber(vendor.avg_response_seconds_30d),
          averagePrepMinutes: vendor.avg_prep_minutes_30d === null ? null : asNumber(vendor.avg_prep_minutes_30d),
          onTimePercent: vendor.ontime_pct_30d === null ? null : asNumber(vendor.ontime_pct_30d),
          averageRating: vendor.avg_rating_30d === null ? null : asNumber(vendor.avg_rating_30d),
          vendorComplaints: asNumber(vendor.vendor_complaints_30d),
          complaintsPer100: vendor.complaints_per_100_30d === null ? null : asNumber(vendor.complaints_per_100_30d),
          delivered: asNumber(vendor.delivered_30d),
          exceptions: asNumber(vendor.exceptions_30d),
          score: vendor.score_30d === null ? null : asNumber(vendor.score_30d),
          grade: vendor.grade_30d,
          rank: vendor.rank_30d,
          zoneSize: asNumber(vendor.zone_size_30d)
        }
      },
      complianceScore: vendor.compliance_score === null ? null : asNumber(vendor.compliance_score),
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
    responseMetric: 'Seconds from order creation to the merchant accept/reject event; not offer-delivery latency.',
    timeoutMetric: 'Vendor offer timeouts are not stored by the current merchant fulfilment workflow.'
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
    const licenceRequired = /current alcohol licence with an expiry date is required/i.test(error.message);
    return NextResponse.json({
      error: unavailable
        ? 'The vendor performance migrations are missing. Apply supabase/DELIVERY_VENDOR_SCORECARD_MIGRATION.sql and supabase/DELIVERY_VENDOR_PERFORMANCE_MIGRATION.sql.'
        : licenceRequired
          ? 'A current alcohol licence with an expiry date is required before this business can accept orders.'
        : 'Merchant availability could not be changed. Confirm the business is still approved.'
    }, { status: licenceRequired ? 409 : 503 });
  }

  return NextResponse.json({ acceptingOrders: Boolean(data) }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
