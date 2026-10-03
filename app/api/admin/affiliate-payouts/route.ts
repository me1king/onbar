import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

async function getAdminDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  const allowed = session?.role === 'owner'
    || session?.permissions?.can_manage_affiliates === true
    || session?.permissions?.can_execute_payouts === true;
  if (!session || !allowed) {
    return { response: NextResponse.json({ error: 'Affiliate payout management access required.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }
  return { client: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }), session };
}

export async function GET() {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  const { data: payouts, error } = await result.client
    .from('affiliate_payouts')
    .select('id, profile_id, amount, status, payment_method, payment_details, mpesa_receipt, created_at, processed_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[AdminAffiliatePayouts] Could not load payout requests:', error);
    return NextResponse.json({ error: `Could not load payout requests: ${error.message}` }, { status: 500 });
  }

  const profileIds = [...new Set((payouts || []).map(payout => payout.profile_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles, error: profileError } = profileIds.length
    ? await result.client.from('profiles').select('id, full_name, email, phone_number').in('id', profileIds)
    : { data: [], error: null };
  if (profileError) {
    console.error('[AdminAffiliatePayouts] Could not load payout customers:', profileError);
    return NextResponse.json({ error: `Could not load payout customer details: ${profileError.message}` }, { status: 500 });
  }
  const profilesById = new Map((profiles || []).map(profile => [profile.id, profile]));
  return NextResponse.json({
    payouts: (payouts || []).map(payout => ({ ...payout, profiles: profilesById.get(payout.profile_id) || null }))
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const result = await getAdminDatabase();
  if ('response' in result) return result.response;

  let body: { id?: unknown; status?: unknown; receipt?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid payout update is required.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : String(body.id ?? '');
  const status = body.status;
  const receipt = typeof body.receipt === 'string' ? body.receipt.trim() : '';
  if (!id || id.length > 80 || !['Approved', 'Paid', 'Rejected'].includes(String(status)) || (status === 'Paid' && (!receipt || receipt.length > 100))) {
    return NextResponse.json({ error: 'Provide a valid payout ID, status, and transaction receipt when marking a payout as paid.' }, { status: 400 });
  }

  const { data: payout, error: payoutError } = await result.client
    .from('affiliate_payouts')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (payoutError) {
    console.error('[AdminAffiliatePayouts] Could not read payout request:', payoutError);
    return NextResponse.json({ error: `Could not read payout request: ${payoutError.message}` }, { status: 500 });
  }
  if (!payout) return NextResponse.json({ error: 'Payout request not found.' }, { status: 404 });
  if (!['Pending', 'Approved'].includes(payout.status) || (status === 'Approved' && payout.status !== 'Pending')) {
    return NextResponse.json({ error: `A payout in ${payout.status} status cannot be changed to ${String(status)}.` }, { status: 409 });
  }

  const update = {
    status: String(status),
    mpesa_receipt: status === 'Paid' ? receipt : null,
    processed_at: status === 'Paid' ? new Date().toISOString() : null
  };
  const { error } = await result.client.from('affiliate_payouts').update(update).eq('id', id);
  if (error) {
    console.error('[AdminAffiliatePayouts] Could not update payout:', error);
    return NextResponse.json({ error: `Could not update payout request: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, status, updatedBy: result.session.email });
}
