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
  return { database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }), session };
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  const { data, error } = await access.database
    .from('mm_price_offers')
    .select('id, product_id, variant_id, merchant_id, buyer_name, buyer_email, buyer_phone, listed_price_minor, latest_amount_minor, accepted_amount_minor, status, expires_at, created_at, product:mm_products!inner(name, slug), merchant:mm_merchants!inner(name, slug, contact_name, contact_email, contact_phone), variant:mm_product_variants!inner(size, color), messages:mm_price_offer_messages(actor, action, amount_minor, message, created_at)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[MarketAdmin] Could not load price offers:', error);
    return NextResponse.json({ error: 'Could not load marketplace offers.' }, { status: 503 });
  }
  return NextResponse.json({ offers: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid offer response.' }, { status: 400 });
  }

  const offerId = body.offerId;
  const action = body.action;
  const amountMinor = body.amountMinor;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (typeof offerId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(offerId)
    || !['accept', 'counter', 'decline'].includes(String(action))
    || message.length > 500
    || (action === 'counter' && (!Number.isSafeInteger(amountMinor) || Number(amountMinor) < 100))) {
    return NextResponse.json({ error: 'Check the offer response and counteroffer amount.' }, { status: 400 });
  }
  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before responding.' }, { status: 403 });
  }

  const { data, error } = await access.database.rpc('mm_respond_to_price_offer', {
    p_offer_id: offerId,
    p_actor: 'admin',
    p_actor_user_id: null,
    p_access_token_hash: null,
    p_action: action,
    p_amount_minor: action === 'counter' ? amountMinor : null,
    p_message: message || null,
    p_actor_email: access.session.email.trim().toLowerCase()
  });
  if (error) {
    const conflict = error.message.includes('already closed') || error.message.includes('expired') || error.message.includes('no longer available');
    const invalid = error.message.includes('counteroffer must');
    if (!conflict && !invalid) console.error('[MarketAdmin] Could not respond to price offer:', error);
    const status = conflict ? 409 : invalid ? 400 : 503;
    return NextResponse.json({ error: conflict || invalid ? error.message : 'Could not update this offer.' }, { status });
  }
  return NextResponse.json({ offer: data }, { headers: { 'Cache-Control': 'no-store' } });
}
