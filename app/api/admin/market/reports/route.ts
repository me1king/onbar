import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

async function getAuthorizedDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return { response: NextResponse.json({ error: 'Marketplace moderation access required.' }, { status: 403 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Marketplace database access is not configured.' }, { status: 503 }) };
  }
  return {
    database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    session
  };
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  const { data, error } = await access.database
    .from('mm_customer_reports')
    .select('id, reference, product_id, merchant_id, reason, details, reporter_email, status, admin_note, reviewed_by_email, reviewed_at, created_at, product:mm_products(name, slug), merchant:mm_merchants(name, slug)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[MarketAdmin] Could not load customer reports:', error);
    return NextResponse.json({ error: 'Could not load marketplace listing reports.' }, { status: 503 });
  }
  return NextResponse.json({ reports: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before reviewing reports.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid report review.' }, { status: 400 });
  }
  const reportId = typeof body.reportId === 'string' ? body.reportId : '';
  const status = ['investigating', 'resolved', 'dismissed'].includes(String(body.status)) ? String(body.status) : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)
    || !status || note.length < 5 || note.length > 1000) {
    return NextResponse.json({ error: 'Choose a valid report outcome and add an admin note of at least five characters.' }, { status: 400 });
  }

  const { data, error } = await access.database.rpc('mm_admin_update_customer_report', {
    p_report_id: reportId,
    p_status: status,
    p_actor_email: access.session.email.trim().toLowerCase(),
    p_admin_note: note
  });
  if (error) {
    console.error('[MarketAdmin] Could not update customer report:', error);
    const missing = error.message.includes('no longer exists');
    return NextResponse.json({ error: missing ? 'This listing report no longer exists.' : 'Could not update this listing report.' }, { status: missing ? 404 : 503 });
  }
  return NextResponse.json({ report: data }, { headers: { 'Cache-Control': 'no-store' } });
}
