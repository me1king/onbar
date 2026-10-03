import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function getAdminDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  const canManageAffiliates = session?.role === 'owner' || session?.permissions?.can_manage_affiliates === true;
  if (!session || !canManageAffiliates) {
    return { response: NextResponse.json({ error: 'Affiliate management access required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }
  return {
    client: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  };
}

export async function GET() {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  const { data: applications, error } = await result.client
    .from('affiliates')
    .select('id, user_id, business_name, bio, audience_size, primary_channels, preferred_payout_method, payout_details, verification_status, commission_rate_override, created_at');
  if (error) {
    console.error('[AdminAffiliates] Could not load applications:', error);
    return NextResponse.json({ error: `Could not load affiliate applications: ${error.message}` }, { status: 500 });
  }

  const { data: performance, error: performanceError } = await result.client
    .from('affiliate_performance_summary')
    .select('affiliate_id, full_name, email, referral_code, affiliate_tier, status, clicks, conversions, total_revenue, available_earnings, pending_earnings, last_conversion_at');
  if (performanceError) {
    console.error('[AdminAffiliates] Could not load affiliate performance:', performanceError);
    return NextResponse.json({ error: `Could not load affiliate performance: ${performanceError.message}` }, { status: 500 });
  }

  const performanceById = new Map((performance || []).map(row => [row.affiliate_id, row]));
  const affiliates = (applications || []).map(application => {
    const stats = performanceById.get(application.user_id);
    return {
      affiliate_id: application.user_id,
      full_name: stats?.full_name || application.business_name,
      email: stats?.email || '',
      referral_code: stats?.referral_code || '',
      affiliate_tier: stats?.affiliate_tier || 'Explorer',
      status: application.verification_status,
      clicks: Number(stats?.clicks || 0),
      conversions: Number(stats?.conversions || 0),
      total_revenue: Number(stats?.total_revenue || 0),
      available_earnings: Number(stats?.available_earnings || 0),
      pending_earnings: Number(stats?.pending_earnings || 0),
      last_conversion_at: stats?.last_conversion_at || null,
      business_name: application.business_name,
      bio: application.bio,
      audience_size: application.audience_size,
      primary_channels: application.primary_channels || [],
      preferred_payout_method: application.preferred_payout_method,
      payout_details: application.payout_details,
      created_at: application.created_at
    };
  });

  return NextResponse.json({ affiliates }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  let body: { affiliateId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid affiliate decision is required.' }, { status: 400 });
  }
  const affiliateId = typeof body.affiliateId === 'string' ? body.affiliateId : '';
  const status = body.status;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(affiliateId) || !['Verified', 'Rejected'].includes(String(status))) {
    return NextResponse.json({ error: 'Select a valid application and approval decision.' }, { status: 400 });
  }

  const { data, error } = await result.client
    .from('affiliates')
    .update({ verification_status: status, updated_at: new Date().toISOString() })
    .eq('user_id', affiliateId)
    .eq('verification_status', 'Pending')
    .select('user_id')
    .maybeSingle();
  if (error) {
    console.error('[AdminAffiliates] Could not update application:', error);
    return NextResponse.json({ error: `Could not update affiliate application: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Pending affiliate application not found.' }, { status: 404 });
  return NextResponse.json({ success: true, status });
}
