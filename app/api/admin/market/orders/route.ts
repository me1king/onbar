import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

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
    database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  };
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  const { data, error } = await access.database
    .from('mm_order_requests')
    .select('id, reference, product_name, variant_label, quantity, unit_price_minor, total_minor, currency, buyer_name, buyer_email, buyer_phone, buyer_note, status, payment_status, created_at, updated_at, merchant:mm_merchants!inner(id, name, slug, contact_name, contact_email, contact_phone)')
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
