import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const complaintCategories = ['product_quality', 'food_safety', 'missing_item', 'wrong_item', 'delivery', 'other'] as const;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Order reports are temporarily unavailable.' }, { status: 503 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Sign in to report an order issue.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Report details must be a JSON object.' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Report details must be valid JSON.' }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  const orderItemId = body.orderItemId === null || body.orderItemId === undefined || body.orderItemId === ''
    ? null
    : Number(body.orderItemId);
  const category = body.category;
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!Number.isSafeInteger(orderId) || orderId < 1
    || (orderItemId !== null && (!Number.isSafeInteger(orderItemId) || orderItemId < 1))) {
    return NextResponse.json({ error: 'Choose a valid order and item.' }, { status: 400 });
  }
  if (typeof category !== 'string' || !complaintCategories.includes(category as typeof complaintCategories[number])) {
    return NextResponse.json({ error: 'Choose a valid issue type.' }, { status: 400 });
  }
  if (description.length < 10 || description.length > 5000) {
    return NextResponse.json({ error: 'Describe the issue in 10 to 5,000 characters.' }, { status: 400 });
  }

  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });

  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: order, error: orderError } = await database
    .from('orders')
    .select('id,status')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (orderError) {
    console.error('[OrderComplaints] Could not verify order ownership:', orderError);
    return NextResponse.json({ error: 'Order ownership could not be verified.' }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: 'That order is not available in your account.' }, { status: 404 });
  if (!['Delivered', 'Completed'].includes(order.status)) {
    return NextResponse.json({ error: 'You can report an issue after the order is delivered.' }, { status: 409 });
  }

  if (orderItemId !== null) {
    const { data: item, error: itemError } = await database
      .from('order_items')
      .select('id')
      .eq('id', orderItemId)
      .eq('order_id', orderId)
      .maybeSingle();
    if (itemError) {
      console.error('[OrderComplaints] Could not verify order item:', itemError);
      return NextResponse.json({ error: 'Order items could not be verified.' }, { status: 503 });
    }
    if (!item) return NextResponse.json({ error: 'That item does not belong to this order.' }, { status: 400 });
  }

  const { data: complaint, error: insertError } = await database
    .from('customer_order_complaints')
    .insert({
      order_id: orderId,
      order_item_id: orderItemId,
      customer_user_id: user.id,
      category,
      description
    })
    .select('id,created_at')
    .single();
  if (insertError || !complaint) {
    console.error('[OrderComplaints] Could not save customer report:', insertError);
    return NextResponse.json({ error: 'Your issue report could not be saved. Please try again.' }, { status: 503 });
  }

  return NextResponse.json({ complaint }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
