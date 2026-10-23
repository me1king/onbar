import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

async function getAuthorizedDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return { response: NextResponse.json({ error: 'Marketplace management access required.' }, { status: 403 }) };
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
    .from('mm_merchants')
    .select('id, name, slug, description, status, contact_name, contact_email, contact_phone, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[MarketAdmin] Could not load merchants:', error);
    return NextResponse.json({ error: 'Could not load marketplace merchants.' }, { status: 503 });
  }

  return NextResponse.json({ merchants: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before managing shops.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid merchant update.' }, { status: 400 });
  }

  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const status = body.status === 'approved' || body.status === 'suspended' ? body.status : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(merchantId) || !status) {
    return NextResponse.json({ error: 'Choose a valid boutique and status.' }, { status: 400 });
  }

  const { data, error } = await access.database.rpc('mm_set_merchant_status', {
    p_merchant_id: merchantId,
    p_status: status,
    p_actor_email: access.session.email.trim().toLowerCase()
  });
  if (error) {
    console.error('[MarketAdmin] Could not update merchant status:', error);
    const notFound = error.message.includes('no longer exists');
    return NextResponse.json({ error: notFound ? 'This boutique no longer exists.' : 'Could not update this boutique.' }, { status: notFound ? 404 : 503 });
  }

  return NextResponse.json({ merchant: data }, { headers: { 'Cache-Control': 'no-store' } });
}
