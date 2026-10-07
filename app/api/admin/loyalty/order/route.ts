import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';
import { processOrderLoyalty } from '@/lib/serverLoyalty';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (session.role !== 'owner' && session.permissions?.can_manage_orders !== true)) {
    return NextResponse.json({ error: 'Order management access required.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ error: 'Loyalty services are not configured.' }, { status: 503 });

  let body: { orderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid order is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'A valid order is required.' }, { status: 400 });
  }

  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: order, error: orderError } = await database
      .from('orders')
      .select('id, user_id, status, total_price, delivery_cost, loyalty_points_redeemed, referred_by_code')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.status !== 'Delivered') {
      return NextResponse.json({ error: 'Loyalty points can only be processed for delivered orders.' }, { status: 409 });
    }
    if (!order.user_id) return NextResponse.json({ ok: true, earnedPoints: 0, message: 'Guest orders do not earn member points.' });

    const result = await processOrderLoyalty(database, order);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[AdminLoyalty] Could not process delivered order points:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not process order points.' }, { status: 500 });
  }
}
