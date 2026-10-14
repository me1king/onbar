import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

async function getAuthorizedDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return { response: NextResponse.json({ error: 'Marketplace operations access required.' }, { status: 403 }) };
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
    .from('mm_order_requests')
    .select('id, reference, product_name, variant_label, quantity, unit_price_minor, total_minor, currency, buyer_name, buyer_email, buyer_phone, buyer_note, status, payment_status, created_at, updated_at, merchant:mm_merchants!inner(id, name, slug, contact_name, contact_email, contact_phone), events:mm_order_request_events(actor, actor_email, action, from_status, to_status, note, created_at)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[MarketAdmin] Could not load order requests:', error);
    return NextResponse.json({ error: 'Could not load marketplace order requests. Confirm the Market orders migration is applied.' }, { status: 503 });
  }

  return NextResponse.json({ orders: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before managing orders.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid order update.' }, { status: 400 });
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const status = typeof body.status === 'string' ? body.status : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    || !['paid', 'confirmed', 'preparing', 'ready', 'fulfilled', 'cancelled'].includes(status)
    || note.length < 5 || note.length > 1000) {
    return NextResponse.json({ error: 'Choose a valid order action and add an audit note of 5 to 1000 characters.' }, { status: 400 });
  }

  const { data, error } = await access.database.rpc('mm_admin_update_order_request', {
    p_order_id: orderId,
    p_status: status,
    p_actor_email: access.session.email.trim().toLowerCase(),
    p_note: note
  });
  if (error) {
    console.error('[MarketAdmin] Could not update order request:', error);
    const conflict = error.message.includes('no longer exists')
      || error.message.includes('cannot be moved')
      || error.message.includes('already recorded');
    const invalid = error.message.includes('Choose a valid order action')
      || error.message.includes('Confirm the order')
      || error.message.includes('Record the offline payment')
      || error.message.includes('not enough stock')
      || error.message.includes('release the stock')
      || error.message.includes('stock updates');
    const statusCode = conflict ? 409 : invalid ? 400 : 503;
    return NextResponse.json({
      error: conflict || invalid ? error.message : 'Could not update this order request.'
    }, { status: statusCode });
  }

  return NextResponse.json({ order: data }, { headers: { 'Cache-Control': 'no-store' } });
}
