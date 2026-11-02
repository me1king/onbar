import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider mission access is not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderMissions] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can view assigned missions.' }, { status: 403 });
  }

  const [ordersResult, walletResult] = await Promise.all([
    database.from('orders')
      .select('id, customer_name, customer_phone, customer_email, status, total_price, payment_method, payment_verified_at, note, created_at, latitude, longitude, delivery_address, delivery_area, delivery_landmark, rider_offer_status, rider_offer_expires_at, rider_pickup_arrived_at, rider_handover_verified_at')
      .eq('rider_phone', session.phone)
      .order('created_at', { ascending: false }),
    database.from('rider_wallets')
      .select('balance, total_earned')
      .eq('rider_phone', session.phone)
      .maybeSingle()
  ]);

  if (ordersResult.error || walletResult.error) {
    console.error('[RiderMissions] Could not load rider missions or wallet:', ordersResult.error || walletResult.error);
    if (/rider_handover_verified_at|schema cache/i.test((ordersResult.error || walletResult.error)?.message || '')) {
      return NextResponse.json({
        error: 'Secure doorstep handover is not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql.'
      }, { status: 503 });
    }
    if (/rider_offer_status|schema cache/i.test((ordersResult.error || walletResult.error)?.message || '')) {
      return NextResponse.json({
        error: 'Rider offer workflow is not installed. Apply supabase/RIDER_TERMINAL_WORKFLOW_MIGRATION.sql.'
      }, { status: 503 });
    }
    return NextResponse.json({ error: 'Rider missions could not be loaded.' }, { status: 503 });
  }

  const orderIds = (ordersResult.data || []).map(order => order.id);
  const itemResult = orderIds.length
    ? await database.from('order_items')
      .select('id, order_id, quantity, product:products(name), trace:merchant_order_item_trace(quantity, batch:merchant_product_batches(application:merchant_applications(id, business_name, phone)))')
      .in('order_id', orderIds)
    : { data: [], error: null };
  if (itemResult.error) {
    console.error('[RiderMissions] Could not load order pickup details:', itemResult.error);
    return NextResponse.json({
      error: /merchant_order_item_trace|merchant_product_batches|merchant_applications|schema cache/i.test(itemResult.error.message)
        ? 'Merchant pickup details are not installed. Apply the merchant operations and dispatch migrations.'
        : 'Order item and pickup details could not be loaded.'
    }, { status: 503 });
  }

  type ItemTrace = {
    id: number;
    order_id: number;
    quantity: number | null;
    product?: { name?: string } | null;
    trace?: Array<{
      quantity: number;
      batch?: { application?: { id?: string; business_name?: string; phone?: string } | null } | null;
    }> | null;
  };
  const itemsByOrder = new Map<number, Array<{
    id: number;
    name: string;
    quantity: number;
  }>>();
  const merchantsByOrder = new Map<number, Map<string, {
    id: string;
    name: string;
    phone: string | null;
    items: Array<{ name: string; quantity: number }>;
  }>>();
  for (const rawItem of (itemResult.data || []) as ItemTrace[]) {
    const quantity = Math.max(1, Number(rawItem.quantity) || 1);
    const item = {
      id: rawItem.id,
      name: rawItem.product?.name || 'Order item',
      quantity
    };
    const orderItems = itemsByOrder.get(rawItem.order_id) || [];
    orderItems.push(item);
    itemsByOrder.set(rawItem.order_id, orderItems);

    for (const trace of rawItem.trace || []) {
      const application = trace.batch?.application;
      if (!application?.id) continue;
      const merchantMap = merchantsByOrder.get(rawItem.order_id) || new Map();
      const merchant = merchantMap.get(application.id) || {
        id: application.id,
        name: application.business_name || 'Merchant pickup',
        phone: application.phone || null,
        items: []
      };
      merchant.items.push({
        name: item.name,
        quantity: Math.max(1, Number(trace.quantity) || 1)
      });
      merchantMap.set(application.id, merchant);
      merchantsByOrder.set(rawItem.order_id, merchantMap);
    }
  }

  return NextResponse.json({
    missions: (ordersResult.data || []).map(order => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
      merchants: Array.from(merchantsByOrder.get(order.id)?.values() || [])
    })),
    wallet: walletResult.data || { balance: 0, total_earned: 0 }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
