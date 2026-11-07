import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

type TraceRow = {
  order_item_id: number;
  quantity: number | null;
  batch?: {
    application_id?: string | null;
    application?: {
      id?: string;
      business_name?: string | null;
      phone?: string | null;
    } | null;
  } | null;
};

type MerchantView = {
  id: string;
  name: string;
  phone: string | null;
  items: Array<{ name: string; quantity: number }>;
  events: Array<{ event_type: string; occurred_at: string; actor: string | null }>;
};

function isMissingOptionalSchema(message: string) {
  return /does not exist|schema cache|could not find the table|could not find the .*column/i.test(message);
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Order support-view access is required.' }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const riderIdValue = searchParams.get('riderId');
  let orderId = Number(searchParams.get('orderId'));
  if (riderIdValue) {
    const riderId = Number(riderIdValue);
    if (!Number.isSafeInteger(riderId) || riderId < 1) {
      return NextResponse.json({ error: 'Enter a valid rider.' }, { status: 400 });
    }

    const database = createServerSupabaseClient();
    if (!database) {
      return NextResponse.json({ error: 'Support view is not connected to the rider database.' }, { status: 503 });
    }
    const { data: rider, error: riderError } = await database
      .from('rider_status')
      .select('rider_name,rider_phone,status,verification_status,last_known_lat,last_known_lng,location_updated_at')
      .eq('id', riderId)
      .maybeSingle();
    if (riderError) {
      console.error('[AdminSupportView] Could not load rider:', riderError);
      return NextResponse.json({ error: 'Rider support view could not be loaded.' }, { status: 503 });
    }
    if (!rider) return NextResponse.json({ error: 'Rider was not found.' }, { status: 404 });

    const { data: activeOrder, error: activeOrderError } = await database
      .from('orders')
      .select('id')
      .eq('rider_phone', rider.rider_phone)
      .in('status', ['Dispatched', 'Picked Up', 'Out for Delivery'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeOrderError) {
      console.error('[AdminSupportView] Could not load rider active delivery:', activeOrderError);
      return NextResponse.json({ error: 'Rider delivery status could not be loaded.' }, { status: 503 });
    }
    if (!activeOrder) {
      return NextResponse.json({ order: null, rider }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }
    orderId = Number(activeOrder.id);
  }

  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: 'Enter a valid rider or order number.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Support view is not connected to the order database.' }, { status: 503 });
  }

  const { data: order, error: orderError } = await database
    .from('orders')
    .select('id,status,customer_name,customer_phone,customer_email,total_price,created_at,payment_method,payment_verified_at,rider_name,rider_phone,latitude,longitude,note')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    console.error('[AdminSupportView] Could not load order:', orderError);
    return NextResponse.json({ error: 'Order details could not be loaded.' }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: 'No order was found with that number.' }, { status: 404 });

  const [
    { data: items, error: itemsError },
    { data: detail, error: detailError },
    { data: statusEvents, error: statusEventsError },
    { data: deliveryEvents, error: deliveryEventsError },
    { data: paymentConfirmation, error: paymentError },
    { data: paymentAttempt, error: deliveryPaymentError }
  ] = await Promise.all([
    database.from('order_items')
      .select('id,product_id,quantity,unit_price,size,addons,status,products(name)')
      .eq('order_id', orderId)
      .order('id'),
    database.from('orders')
      .select('delivery_address,delivery_area,delivery_landmark,delivery_instructions,delivery_eta_minutes,delivery_eta_updated_at,rider_handover_verified_at')
      .eq('id', orderId)
      .maybeSingle(),
    database.from('order_status_events')
      .select('from_status,to_status,actor_type,reason,created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(50),
    database.from('delivery_events')
      .select('from_status,to_status,actor_type,metadata,created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(50),
    database.from('payment_confirmations')
      .select('provider,amount_kobo,currency,verified_at')
      .eq('order_id', orderId)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    database.from('rider_delivery_payment_attempts')
      .select('provider,payment_method,status,amount_ksh,error_message,created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);
  if (itemsError) {
    console.error('[AdminSupportView] Could not load order items:', itemsError);
    return NextResponse.json({ error: 'Order items could not be loaded.' }, { status: 503 });
  }

  const diagnostics: string[] = [];
  const optionalQueries = [
    { error: detailError, label: 'Delivery details are unavailable; confirm the delivery-engine migration is installed.' },
    { error: statusEventsError, label: 'Order status history is unavailable; confirm the order-flow migration is installed.' },
    { error: deliveryEventsError, label: 'Rider delivery history is unavailable; confirm the delivery-engine migration is installed.' },
    { error: paymentError, label: 'Online payment verification details are unavailable; confirm the dispatch migration is installed.' },
    { error: deliveryPaymentError, label: 'Doorstep payment details are unavailable; confirm the rider doorstep-payment migration is installed.' }
  ];
  for (const query of optionalQueries) {
    if (!query.error) continue;
    if (!isMissingOptionalSchema(query.error.message)) {
      console.error('[AdminSupportView] An optional order view could not be loaded:', query.error);
    }
    diagnostics.push(query.label);
  }

  const itemRows = items || [];
  const itemIds = itemRows.map(item => Number(item.id)).filter(Number.isSafeInteger);
  let merchantRows: MerchantView[] = [];
  if (itemIds.length) {
    const [{ data: traces, error: traceError }, { data: fulfillment, error: fulfillmentError }] = await Promise.all([
      database.from('merchant_order_item_trace')
        .select('order_item_id,quantity,batch:merchant_product_batches(application_id,application:merchant_applications(id,business_name,phone))')
        .in('order_item_id', itemIds),
      database.from('merchant_fulfillment_events')
        .select('application_id,event_type,occurred_at,actor')
        .eq('order_id', orderId)
        .order('occurred_at', { ascending: true })
    ]);

    if (traceError || fulfillmentError) {
      const error = traceError || fulfillmentError;
      console.error('[AdminSupportView] Merchant fulfillment data could not be loaded:', error);
      diagnostics.push('Merchant assignment details are unavailable; confirm the merchant operations and dispatch migrations are installed.');
    } else {
      const byMerchant = new Map<string, MerchantView>();
      for (const trace of (traces || []) as unknown as TraceRow[]) {
        const application = trace.batch?.application;
        const applicationId = application?.id || trace.batch?.application_id;
        if (!applicationId) continue;
        const merchant: MerchantView = byMerchant.get(applicationId) || {
          id: applicationId,
          name: application?.business_name || 'Merchant',
          phone: application?.phone || null,
          items: [],
          events: (fulfillment || [])
            .filter(event => event.application_id === applicationId)
            .map(event => ({
              event_type: event.event_type,
              occurred_at: event.occurred_at,
              actor: event.actor
            }))
        };
        const item = itemRows.find(row => Number(row.id) === Number(trace.order_item_id));
        const product = Array.isArray(item?.products) ? item.products[0] : item?.products;
        merchant.items.push({
          name: product?.name || 'Order item',
          quantity: Number(trace.quantity) || 0
        });
        byMerchant.set(applicationId, merchant);
      }
      merchantRows = Array.from(byMerchant.values());
    }
  }

  let rider = null;
  if (order.rider_phone) {
    const { data, error } = await database.from('rider_status')
      .select('rider_name,rider_phone,vehicle_type,vehicle_reg,verification_status,status,last_known_lat,last_known_lng,location_updated_at')
      .eq('rider_phone', order.rider_phone)
      .maybeSingle();
    if (error) {
      console.error('[AdminSupportView] Could not load assigned rider:', error);
      diagnostics.push('Assigned rider profile details are unavailable.');
    } else {
      rider = data;
    }
  }

  return NextResponse.json({
    rider,
    order: {
      ...order,
      ...(detailError ? {} : detail),
      items: itemRows.map(item => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products;
        return {
          id: item.id,
          name: product?.name || 'Order item',
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          size: item.size,
          status: item.status
        };
      }),
      payment: {
        verified: Boolean(order.payment_verified_at && !paymentError && paymentConfirmation),
        onlineConfirmation: paymentError ? null : paymentConfirmation,
        doorstepAttempt: deliveryPaymentError ? null : paymentAttempt
      },
      statusEvents: statusEventsError ? [] : statusEvents || [],
      deliveryEvents: deliveryEventsError ? [] : deliveryEvents || [],
      merchants: merchantRows,
      rider
    },
    diagnostics
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
