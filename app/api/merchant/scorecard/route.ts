import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Clients = {
  auth: SupabaseClient;
  database: SupabaseClient;
};

type PerformanceRow = {
  application_id: string;
  business_name: string;
  town: string;
  vendor_type: 'retailer' | 'wholesaler' | 'street_food';
  accepting_orders: boolean;
  prep_target_minutes: number | null;
  target_reply_seconds: number;
  target_prep_minutes: number;
  target_acceptance_pct: number;
  target_ontime_pct: number;
  target_rating: number;
  target_complaints_per_100: number;
  min_decisions: number;
  weight_reply: number;
  weight_acceptance: number;
  weight_ontime: number;
  weight_rating: number;
  weight_complaints: number;
  decisions_7d: number;
  accepted_7d: number;
  rejected_7d: number;
  avg_response_seconds_7d: number | null;
  delivered_7d: number;
  exceptions_7d: number;
  avg_prep_minutes_7d: number | null;
  ontime_pct_7d: number | null;
  avg_rating_7d: number | null;
  vendor_complaints_7d: number;
  complaints_per_100_7d: number | null;
  compliance_score: number | null;
  score_7d: number | null;
  rank_7d: number | null;
  zone_size_7d: number;
  grade_7d: string | null;
  decisions_30d: number;
  accepted_30d: number;
  rejected_30d: number;
  avg_response_seconds_30d: number | null;
  delivered_30d: number;
  exceptions_30d: number;
  avg_prep_minutes_30d: number | null;
  ontime_pct_30d: number | null;
  avg_rating_30d: number | null;
  vendor_complaints_30d: number;
  complaints_per_100_30d: number | null;
  score_30d: number | null;
  rank_30d: number | null;
  zone_size_30d: number;
  grade_30d: string | null;
};

function getClients(): Clients | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;

  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const clients = getClients();
  if (!clients) {
    return NextResponse.json({ error: 'Merchant performance is not configured on the server.' }, { status: 503 });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in to view your performance.' }, { status: 401 });
  const { data: authData, error: authError } = await clients.auth.auth.getUser(token);
  const email = authData.user?.email?.toLowerCase();
  if (authError || !email || !(authData.user?.email_confirmed_at || authData.user?.confirmed_at)) {
    return NextResponse.json({ error: 'A verified merchant account is required.' }, { status: 401 });
  }

  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!isUuid(applicationId)) {
    return NextResponse.json({ error: 'Choose a valid merchant business.' }, { status: 400 });
  }

  const { data: application, error: applicationError } = await clients.database
    .from('merchant_applications')
    .select('id, status, email')
    .eq('id', applicationId)
    .eq('email', email)
    .maybeSingle();
  if (applicationError) {
    console.error('[MerchantScorecard] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application || application.status !== 'approved') {
    return NextResponse.json({ error: 'An approved business linked to your account is required.' }, { status: 404 });
  }

  const { data, error } = await clients.database
    .from('merchant_vendor_performance')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle();
  if (error) {
    console.error('[MerchantScorecard] Could not load merchant performance:', error);
    return NextResponse.json({
      error: /merchant_vendor_performance|schema cache|does not exist/i.test(error.message)
        ? 'Vendor performance is not installed yet. Apply supabase/DELIVERY_VENDOR_PERFORMANCE_MIGRATION.sql.'
        : 'Your performance records could not be loaded.'
    }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'No vendor performance profile is available for this business.' }, { status: 404 });

  const row = data as PerformanceRow;
  const window = (days: 7 | 30) => {
    const suffix = days === 7 ? '7d' : '30d';
    const decisions = row[`decisions_${suffix}` as const];
    const accepted = row[`accepted_${suffix}` as const];
    const rejected = row[`rejected_${suffix}` as const];
    const total = accepted + rejected;
    return {
      decisions,
      accepted,
      rejected,
      acceptanceRate: total ? Math.round((accepted / total) * 100) : null,
      averageResponseSeconds: row[`avg_response_seconds_${suffix}` as const],
      delivered: row[`delivered_${suffix}` as const],
      exceptions: row[`exceptions_${suffix}` as const],
      averagePrepMinutes: row[`avg_prep_minutes_${suffix}` as const],
      onTimePercent: row[`ontime_pct_${suffix}` as const],
      averageRating: row[`avg_rating_${suffix}` as const],
      vendorComplaints: row[`vendor_complaints_${suffix}` as const],
      complaintsPer100: row[`complaints_per_100_${suffix}` as const],
      score: row[`score_${suffix}` as const] === null ? null : Math.round(row[`score_${suffix}` as const]!),
      rank: row[`rank_${suffix}` as const],
      zoneSize: row[`zone_size_${suffix}` as const],
      grade: row[`grade_${suffix}` as const]
    };
  };

  return NextResponse.json({
    vendor: {
      applicationId: row.application_id,
      name: row.business_name,
      type: row.vendor_type,
      town: row.town,
      acceptingOrders: row.accepting_orders,
      prepTargetMinutes: row.prep_target_minutes ?? row.target_prep_minutes
    },
    targets: {
      replySeconds: row.target_reply_seconds,
      prepMinutes: row.target_prep_minutes,
      minimumDecisions: row.min_decisions,
      weights: {
        response: row.weight_reply,
        acceptance: row.weight_acceptance,
        onTime: row.weight_ontime,
        rating: row.weight_rating,
        vendorFaultComplaints: row.weight_complaints
      },
      acceptancePercent: row.target_acceptance_pct,
      onTimePercent: row.target_ontime_pct,
      rating: row.target_rating,
      complaintsPer100: row.target_complaints_per_100
    },
    complianceScore: row.compliance_score,
    windows: { 7: window(7), 30: window(30) },
    limitations: {
      responseTime: 'Measured from order creation to the recorded merchant accept/reject event; routed-offer latency is not currently recorded.',
      timeouts: 'Timeout counts are not available in the current dispatch event ledger.',
      ratingsAndComplaints: 'Only saved customer ratings and complaints formally attributed to the vendor are included.'
    },
    updatedAt: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
