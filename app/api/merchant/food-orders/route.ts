import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isKitchenFoodProduct } from '@/lib/productDepartment';

export const dynamic = 'force-dynamic';

type Clients = {
  auth: SupabaseClient;
  database: SupabaseClient;
};

type MerchantAccount = {
  id: string;
  email: string;
};

function getClients(): Clients | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;

  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

async function authorize(request: Request) {
  const clients = getClients();
  if (!clients) return { error: 'Merchant food orders are not configured on this server.', status: 503 as const };

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Sign in to view your food orders.', status: 401 as const };
  const { data, error } = await clients.auth.auth.getUser(token);
  const user = data.user;
  const email = user?.email && user.email_confirmed_at
    ? user.email.trim().toLowerCase()
    : null;
  if (error || !user || (!email && !user.phone_confirmed_at)) {
    return { error: 'A verified merchant account is required.', status: 401 as const };
  }
  const account: MerchantAccount = { id: user.id, email: email || '' };

  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return { error: 'Choose a valid merchant business.', status: 400 as const };
  }

  const fields = 'id, status, email, business_type, vendor_type, offered_goods_pricing';
  const { data: linkedApplication, error: linkedError } = await clients.database
    .from('merchant_applications')
    .select(fields)
    .eq('id', applicationId)
    .eq('account_user_id', account.id)
    .maybeSingle();
  if (linkedError) {
    console.error('[MerchantFoodOrders] Could not verify merchant account ownership:', linkedError);
    return { error: 'Your merchant access could not be verified.', status: 503 as const };
  }
  let application = linkedApplication;
  if (!application && account.email) {
    const { data: legacyApplication, error: legacyError } = await clients.database
      .from('merchant_applications')
      .select(fields)
      .eq('id', applicationId)
      .eq('email', account.email)
      .maybeSingle();
    if (legacyError) {
      console.error('[MerchantFoodOrders] Could not verify legacy merchant ownership:', legacyError);
      return { error: 'Your merchant access could not be verified.', status: 503 as const };
    }
    application = legacyApplication;
  }
  if (!application || application.status !== 'approved') {
    return { error: 'An approved business linked to your account is required.', status: 404 as const };
  }
  if (!['kitchen', 'restaurant', 'food_vendor'].includes(application.business_type)
    && application.vendor_type !== 'street_food') {
    return { error: 'Food order access is only available to food businesses.', status: 403 as const };
  }

  const productIds = Array.isArray(application.offered_goods_pricing)
    ? [...new Set((application.offered_goods_pricing as Array<{ product_id?: unknown }>)
      .map(offer => Number(offer.product_id))
      .filter(id => Number.isSafeInteger(id) && id > 0))]
    : [];
  return { database: clients.database, application, productIds };
}

export async function GET(request: Request) {
  const access = await authorize(request);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.productIds.length) return NextResponse.json({ orders: [] });

  try {
    const { data: batches, error: batchesError } = await access.database
      .from('merchant_product_batches')
      .select('id')
      .eq('application_id', access.application.id);
    if (batchesError) throw batchesError;
    const batchIds = (batches || []).map(batch => batch.id);
    if (!batchIds.length) return NextResponse.json({ orders: [] });

    const { data: traces, error: tracesError } = await access.database
      .from('merchant_order_item_trace')
      .select('order_item_id, quantity')
      .in('batch_id', batchIds)
      .limit(5000);
    if (tracesError) throw tracesError;
    const assignedItemIds = [...new Set((traces || []).map(trace => Number(trace.order_item_id))
      .filter(id => Number.isSafeInteger(id) && id > 0))];
    if (!assignedItemIds.length) return NextResponse.json({ orders: [] });

    const { data: itemData, error: itemsError } = await access.database
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit_price, size, addons, status, created_at, products(name, category, sub_category, is_bite, is_snack)')
      .in('id', assignedItemIds)
      .in('product_id', access.productIds)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (itemsError) throw itemsError;

    const { data: returnedMovements, error: returnedMovementsError } = assignedItemIds.length
      ? await access.database
        .from('merchant_inventory_movements')
        .select('order_item_id, quantity_delta')
        .eq('movement_type', 'returned')
        .eq('note', 'Returned for offline merchant redistribution')
        .in('order_item_id', assignedItemIds)
      : { data: [], error: null };
    if (returnedMovementsError) throw returnedMovementsError;

    const tracedQuantityByItem = new Map<number, number>();
    for (const trace of traces || []) {
      const itemId = Number(trace.order_item_id);
      tracedQuantityByItem.set(itemId, (tracedQuantityByItem.get(itemId) || 0) + Number(trace.quantity || 0));
    }
    const returnedQuantityByItem = new Map<number, number>();
    for (const movement of returnedMovements || []) {
      const itemId = Number(movement.order_item_id);
      returnedQuantityByItem.set(itemId, (returnedQuantityByItem.get(itemId) || 0) + Number(movement.quantity_delta || 0));
    }

    const foodItems = (itemData || []).filter(item => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      const merchantQuantity = Math.max(
        0,
        (tracedQuantityByItem.get(Number(item.id)) || 0) - (returnedQuantityByItem.get(Number(item.id)) || 0)
      );
      return product && isKitchenFoodProduct(product) && merchantQuantity > 0;
    });
    const orderIds = [...new Set(foodItems.map(item => Number(item.order_id)).filter(Number.isSafeInteger))];
    if (!orderIds.length) return NextResponse.json({ orders: [] });

    const { data: orderData, error: ordersError } = await access.database
      .from('orders')
      .select('id, status, payment_method, payment_verified_at, customer_name, customer_phone, customer_email, created_at')
      .in('id', orderIds)
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;

    const confirmedOrders = (orderData || []).filter(order => {
      const status = String(order.status || '').toLowerCase();
      if (['cancelled', 'canceled', 'refunded'].includes(status)) return false;
      if (String(order.payment_method || '').toUpperCase() === 'COD') return true;
      return status === 'paid' && Boolean(order.payment_verified_at);
    });
    const confirmedOrderIds = confirmedOrders.map(order => Number(order.id));
    const { data: fulfillment, error: fulfillmentError } = confirmedOrderIds.length
      ? await access.database.from('merchant_fulfillment_events')
        .select('id, order_id, event_type, details, occurred_at')
        .eq('application_id', access.application.id)
        .in('order_id', confirmedOrderIds)
        .order('occurred_at', { ascending: false })
        .limit(1000)
      : { data: [], error: null };
    if (fulfillmentError) throw fulfillmentError;

    const orders = confirmedOrders
      .map(order => ({
      id: Number(order.id),
      status: order.status || 'Pending',
      customer_name: order.customer_name || 'Customer',
      customer_phone: order.customer_phone || '',
      customer_email: order.customer_email,
      created_at: order.created_at,
      fulfillment: (fulfillment || []).filter(event => Number(event.order_id) === Number(order.id)),
      items: foodItems
        .filter(item => Number(item.order_id) === Number(order.id))
        .map(item => {
          const product = Array.isArray(item.products) ? item.products[0] : item.products;
          return {
            id: Number(item.id),
            product_name: product?.name || 'Food item',
            quantity: Math.max(
              0,
              (tracedQuantityByItem.get(Number(item.id)) || 0) - (returnedQuantityByItem.get(Number(item.id)) || 0)
            ),
            unit_price: Number(item.unit_price || 0),
            size: item.size,
            addons: item.addons,
            status: item.status || 'Pending'
          };
        })
      }));

    return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('[MerchantFoodOrders] Could not load merchant food orders:', error);
    return NextResponse.json({ error: 'Food orders could not be loaded. Please try again.' }, { status: 503 });
  }
}
