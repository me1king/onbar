import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Order status is not configured.' }, { status: 503 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const params = new URL(request.url).searchParams;
  const orderId = Number(params.get('id'));
  const sessionId = params.get('sessionId')?.trim() || '';
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || sessionId.length > 160) {
    return NextResponse.json({ error: 'A valid order is required.' }, { status: 400 });
  }

  let authenticatedUserId: string | null = null;
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const auth = createClient(url, publicKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await auth.auth.getUser(token);
    if (!error && data.user) authenticatedUserId = data.user.id;
  }

  const { data: order, error } = await database
    .from('orders')
    .select('id, customer_name, total_price, status, payment_method, user_id, session_id')
    .eq('id', orderId)
    .maybeSingle();
  if (error) {
    console.error('[OrderStatus] Could not load order:', error);
    return NextResponse.json({ error: 'Order status could not be loaded.' }, { status: 503 });
  }

  const isOwner = order && (
    (authenticatedUserId && order.user_id === authenticatedUserId)
    || (sessionId && order.session_id === sessionId)
  );
  if (!isOwner || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      id: order.id,
      customer_name: order.customer_name,
      total_price: order.total_price,
      status: order.status,
      payment_method: order.payment_method,
      isAccountOrder: Boolean(authenticatedUserId && order.user_id === authenticatedUserId)
    }
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
