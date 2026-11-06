import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isValidMerchantOperatingHours } from '@/lib/merchantAvailability';
import { alertAllocatedMerchants } from '@/lib/merchantOrderAlerts.server';

export const dynamic = 'force-dynamic';

type Clients = {
  auth: SupabaseClient;
  database: SupabaseClient;
};

type MerchantContext = {
  userId: string;
  email: string | null;
  actor: string;
  database: SupabaseClient;
};

const fulfillmentEvents = new Set([
  'accepted',
  'rejected',
  'preparing',
  'ready',
  'handed_to_rider',
  'collected',
  'delivered',
  'cancelled',
  'exception'
]);
const incidentCategories = new Set([
  'product_quality', 'food_safety', 'delivery', 'conduct', 'other',
  'age_check_failed', 'suspected_counterfeit'
]);

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

async function getMerchantContext(request: Request, clients: Clients): Promise<MerchantContext | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const { data, error } = await clients.auth.auth.getUser(token);
  const user = data.user;
  const email = user?.email && user.email_confirmed_at
    ? user.email.trim().toLowerCase()
    : null;
  if (error || !user || (!email && !user.phone_confirmed_at)) return null;

  return {
    userId: user.id,
    email,
    actor: email || `account:${user.id}`,
    database: clients.database
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function findApplication(database: SupabaseClient, id: unknown, context: MerchantContext) {
  if (!isUuid(id)) return { application: null, error: null };
  const fields = 'id, status, email, business_type, vendor_type, offered_goods_pricing, alcohol_onboarding';
  const { data: linkedApplication, error: linkedError } = await database
    .from('merchant_applications')
    .select(fields)
    .eq('id', id)
    .eq('account_user_id', context.userId)
    .maybeSingle();
  if (linkedError) return { application: null, error: linkedError };
  if (linkedApplication) return { application: linkedApplication, error: null };
  if (!context.email) return { application: null, error: null };
  const { data, error } = await database
    .from('merchant_applications')
    .select(fields)
    .eq('id', id)
    .eq('email', context.email)
    .maybeSingle();
  return { application: data, error };
}

async function getApplicationWorkspace(database: SupabaseClient, application: Record<string, unknown>) {
  const applicationId = String(application.id);
  const [
    { data: events, error: eventsError },
    { data: batches, error: batchesError },
    { data: fulfillment, error: fulfillmentError },
    { data: incidents, error: incidentsError }
  ] = await Promise.all([
    database.from('merchant_application_events')
      .select('event_type, details, created_at')
      .eq('application_id', applicationId)
      .in('event_type', ['submitted', 'under_review', 'information_requested', 'approved', 'rejected', 'suspended', 'expired', 'availability_updated', 'food_campaign_requested', 'alcohol_campaign_requested', 'alcohol_rules_updated'])
      .order('created_at', { ascending: false })
      .limit(100),
    database.from('merchant_product_batches')
      .select('id, product_id, lot_code, supplier_name, received_at, expiry_at, quantity_received, excise_stamp_confirmed')
      .eq('application_id', applicationId)
      .order('received_at', { ascending: false })
      .limit(500),
    database.from('merchant_fulfillment_events')
      .select('id, order_id, event_type, details, occurred_at')
      .eq('application_id', applicationId)
      .order('occurred_at', { ascending: false })
      .limit(500),
    database.from('merchant_incidents')
      .select('id, incident_code, order_id, batch_id, category, description, status, severity, resolution_note, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(200)
  ]);
  const queryError = eventsError || batchesError || fulfillmentError || incidentsError;
  if (queryError) throw queryError;

  const batchRows = batches || [];
  const batchIds = batchRows.map(batch => batch.id);
  const applicationOffers = Array.isArray(application.offered_goods_pricing)
    ? application.offered_goods_pricing as Array<Record<string, unknown>>
    : [];
  const offeredProductIds = applicationOffers
    .map(offer => Number(offer.product_id))
    .filter(Number.isSafeInteger);
  const productIds = [...new Set([...batchRows.map(batch => batch.product_id), ...offeredProductIds])];
  const [
    { data: products, error: productsError },
    { data: movements, error: movementsError },
    { data: holds, error: holdsError },
    { data: traces, error: tracesError }
  ] = await Promise.all([
    productIds.length
      ? database.from('products').select('id, name, sku, category, price').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? database.from('merchant_inventory_movements')
        .select('id, batch_id, movement_type, quantity_delta, order_item_id, note, created_at')
        .in('batch_id', batchIds).order('created_at', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? database.from('merchant_batch_holds')
        .select('id, batch_id, reason, placed_at, released_at, release_note')
        .in('batch_id', batchIds).order('placed_at', { ascending: false }).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? database.from('merchant_order_item_trace')
        .select('id, order_item_id, batch_id, quantity, created_at')
        .in('batch_id', batchIds).order('created_at', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [], error: null })
  ]);
  const inventoryError = productsError || movementsError || holdsError || tracesError;
  if (inventoryError) throw inventoryError;

  const traceRows = traces || [];
  const itemIds = [...new Set(traceRows.map(trace => trace.order_item_id))];
  const { data: orderItems, error: itemsError } = itemIds.length
    ? await database.from('order_items')
      .select('id, order_id, product_id, quantity, unit_price, size, status')
      .in('id', itemIds)
    : { data: [], error: null };
  if (itemsError) throw itemsError;

  const itemRows = orderItems || [];
  const orderIds = [...new Set([
    ...itemRows.map(item => Number(item.order_id)),
    ...(fulfillment || []).map(event => Number(event.order_id)),
    ...(incidents || [])
      .filter(incident => incident.order_id !== null)
      .map(incident => Number(incident.order_id))
  ].filter(Number.isSafeInteger))];
  const { data: orders, error: ordersError } = orderIds.length
    ? await database.from('orders')
      .select('id, status, customer_name, customer_phone, customer_email, created_at')
      .in('id', orderIds)
    : { data: [], error: null };
  if (ordersError) throw ordersError;

  const productRows = products || [];
  const batchData = batchRows.map(batch => {
    const batchMovements = (movements || []).filter(movement => movement.batch_id === batch.id);
    const batchHolds = (holds || []).filter(hold => hold.batch_id === batch.id);
    const available = batchMovements.reduce((total, movement) => total + Number(movement.quantity_delta || 0), 0);
    return {
      ...batch,
      product: productRows.find(product => product.id === batch.product_id) || null,
      available_quantity: available,
      on_hold: batchHolds.some(hold => hold.released_at === null),
      movements: batchMovements,
      holds: batchHolds
    };
  });

  const orderRows = orders || [];
  const orderData = orderRows.map(order => {
    const items = itemRows
      .filter(item => Number(item.order_id) === Number(order.id))
      .map(item => ({
        ...item,
        product_name: productRows.find(product => product.id === item.product_id)?.name || 'Product',
        listed_price: Number(productRows.find(product => product.id === item.product_id)?.price || 0),
        selling_price: Number(item.unit_price || 0),
        spread: Number(item.unit_price || 0) - Number(productRows.find(product => product.id === item.product_id)?.price || 0),
        merchant_quantity: Math.max(0,
          traceRows
            .filter(trace => Number(trace.order_item_id) === Number(item.id))
            .reduce((total, trace) => total + Number(trace.quantity), 0)
          - (movements || [])
            .filter(movement => Number(movement.order_item_id) === Number(item.id)
              && movement.movement_type === 'returned'
              && movement.note === 'Returned for offline merchant redistribution')
            .reduce((total, movement) => total + Number(movement.quantity_delta), 0)
        )
      }))
      .filter(item => item.merchant_quantity > 0);
    const orderEvents = (fulfillment || []).filter(event => Number(event.order_id) === Number(order.id));
    return {
      id: order.id,
      status: order.status,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      created_at: order.created_at,
      items,
      fulfillment: orderEvents
    };
  }).filter(order => order.items.length > 0 || (fulfillment || []).some(event => Number(event.order_id) === Number(order.id)));

  return {
    application: {
      ...application,
      offered_goods_pricing: applicationOffers.map(offer => {
        const product = productRows.find(row => Number(row.id) === Number(offer.product_id));
        const sellingPrice = Number(offer.price || 0);
        const listedPrice = Number(product?.price || 0);
        return {
          ...offer,
          listed_price: listedPrice,
          selling_price: sellingPrice,
          spread: sellingPrice - listedPrice,
          margin_percent: listedPrice > 0 ? ((sellingPrice - listedPrice) / listedPrice) * 100 : null
        };
      }),
      documents: Array.isArray(application.documents)
        ? (application.documents as Array<Record<string, unknown>>).map(document => ({
          id: document.id,
          type: document.type,
          name: document.name,
          uploadedAt: document.uploadedAt,
          expiresAt: document.expiresAt
        }))
        : []
    },
    events: events || [],
    batches: batchData,
    orders: orderData,
    incidents: incidents || []
  };
}

export async function GET(request: Request) {
  const clients = getClients();
  if (!clients) return NextResponse.json({ error: 'Merchant access is not configured on this server.' }, { status: 503 });
  const context = await getMerchantContext(request, clients);
  if (!context) return NextResponse.json({ error: 'Sign in with a verified OnBar account to access the Partner Workspace.' }, { status: 401 });

  try {
    const fields = 'id, merchant_code, business_name, trading_name, business_type, vendor_type, prep_target_minutes, email, phone, owner_name, owner_role, address, country, county, town, latitude, longitude, operating_areas, operating_hours, accepting_orders, availability_updated_at, cuisine_or_category, preparation_capacity, delivery_radius_km, collection_available, offered_goods, offered_goods_pricing, documents, alcohol_onboarding, status, review_note, submitted_at, reviewed_at, updated_at';
    const { data: linkedApplications, error: linkedError } = await context.database
      .from('merchant_applications')
      .select(fields)
      .eq('account_user_id', context.userId)
      .eq('status', 'approved')
      .order('submitted_at', { ascending: false })
      .limit(25);
    if (linkedError) throw linkedError;
    let applications = linkedApplications || [];
    if (!applications.length && context.email) {
      const { data: legacyApplications, error: legacyError } = await context.database
        .from('merchant_applications')
        .select(fields)
        .eq('email', context.email)
        .eq('status', 'approved')
        .order('submitted_at', { ascending: false })
        .limit(25);
      if (legacyError) throw legacyError;
      applications = legacyApplications || [];
    }
    if (!applications.length) {
      return NextResponse.json({
        applications: [],
        error: 'Merchant terminal access is available only after admin approval.'
      }, {
        status: 403,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' }
      });
    }

    const backgroundRefresh = new URL(request.url).searchParams.get('refresh') === '1';
    if (applications.length && !backgroundRefresh) {
      const { error: auditError } = await context.database.from('merchant_application_events').insert(
        applications.map(application => ({
          application_id: application.id,
          event_type: 'partner_workspace_viewed',
          actor: context.actor,
          details: { view: 'onbar_partner_workspace' }
        }))
      );
      if (auditError) throw auditError;
    }

    const workspaces = await Promise.all(applications.map(application =>
      getApplicationWorkspace(context.database, application as unknown as Record<string, unknown>)
    ));
    return NextResponse.json({ applications: workspaces }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    console.error('[MerchantNetwork] Could not load partner workspace:', error);
    const message = error instanceof Error && /alcohol_onboarding|excise_stamp_confirmed/i.test(error.message)
      ? 'Alcohol retailer workspace is not installed. Run supabase/MERCHANT_LIQUOR_ONBOARDING_MIGRATION.sql after merchant operations.'
      : error instanceof Error && /merchant_|does not exist|schema cache/i.test(error.message)
        ? 'Merchant operations data is unavailable. Confirm supabase/MERCHANT_OPERATIONS_MIGRATION.sql and supabase/DISPATCH_MIGRATION.sql are installed.'
      : 'Your merchant workspace could not be loaded. Please try again.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const clients = getClients();
  if (!clients) return NextResponse.json({ error: 'Merchant access is not configured on this server.' }, { status: 503 });
  const context = await getMerchantContext(request, clients);
  if (!context) return NextResponse.json({ error: 'Sign in with a verified OnBar account to manage your business.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid request body is required.' }, { status: 400 });
  }

  const { application, error: applicationError } = await findApplication(context.database, body.applicationId, context);
  if (applicationError) {
    console.error('[MerchantNetwork] Could not verify partner ownership:', applicationError);
    return NextResponse.json({
      error: /alcohol_onboarding|schema cache/i.test(applicationError.message)
        ? 'Alcohol retailer workspace is not installed. Run supabase/MERCHANT_LIQUOR_ONBOARDING_MIGRATION.sql after merchant operations.'
        : 'Your business access could not be verified.'
    }, { status: 503 });
  }
  if (!application) return NextResponse.json({ error: 'That business is not linked to your verified account.' }, { status: 404 });
  if (application.status !== 'approved') {
    return NextResponse.json({ error: 'Only currently approved partners can make operational updates.' }, { status: 403 });
  }

  if (body.operation === 'update_availability') {
    if (!isValidMerchantOperatingHours(body.operatingHours) || typeof body.acceptingOrders !== 'boolean') {
      return NextResponse.json({ error: 'Set valid opening and closing times for every day and choose whether you are accepting new orders.' }, { status: 400 });
    }
    const { data, error } = await context.database.rpc('update_merchant_availability', {
      p_application_id: application.id,
      p_operating_hours: body.operatingHours,
      p_accepting_orders: body.acceptingOrders,
      p_actor: context.actor
    });
    if (error) {
      console.error('[MerchantNetwork] Could not update partner availability:', error);
      return NextResponse.json({
        error: /approved merchant application/i.test(error.message)
          ? 'Only an approved business can change order availability.'
          : /current alcohol licence with an expiry date is required/i.test(error.message)
            ? 'A current alcohol licence with an expiry date is required before accepting orders.'
          : 'Business hours could not be saved. Confirm the merchant availability migration is installed.'
      }, { status: 503 });
    }
    return NextResponse.json({ application: data });
  }

  if (body.operation === 'request_food_campaign') {
    if (!['kitchen', 'restaurant', 'food_vendor'].includes(String(application.business_type))
      && application.vendor_type !== 'street_food') {
      return NextResponse.json({ error: 'The Black November offer page is only available to food businesses.' }, { status: 403 });
    }

    const campaignName = typeof body.campaignName === 'string' ? body.campaignName.trim() : '';
    const offerDescription = typeof body.offerDescription === 'string' ? body.offerDescription.trim() : '';
    const startDate = body.startDate;
    const endDate = body.endDate;
    const discountPercent = body.discountPercent === null || body.discountPercent === ''
      ? null
      : Number(body.discountPercent);
    const today = new Date().toISOString().slice(0, 10);
    if (campaignName.length < 3 || campaignName.length > 100
      || offerDescription.length < 10 || offerDescription.length > 1000
      || !validDate(startDate) || !validDate(endDate)
      || startDate < today || endDate < startDate
      || (discountPercent !== null && (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 90))) {
      return NextResponse.json({ error: 'Enter a campaign name, clear offer details, valid future dates, and an optional whole-number discount between 1% and 90%.' }, { status: 400 });
    }

    const { error } = await context.database.from('merchant_application_events').insert({
      application_id: application.id,
      event_type: 'food_campaign_requested',
      actor: context.actor,
      details: {
        campaign_name: campaignName,
        offer_description: offerDescription,
        requested_start_date: startDate,
        requested_end_date: endDate,
        requested_discount_percent: discountPercent,
        status: 'pending_review'
      }
    });
    if (error) {
      console.error('[MerchantNetwork] Could not record food campaign request:', error);
      return NextResponse.json({ error: 'The offer request could not be saved. Please try again or contact OnBar support.' }, { status: 503 });
    }
    return NextResponse.json({ requested: true }, { status: 201 });
  }

  if (body.operation === 'request_alcohol_campaign') {
    if (application.business_type !== 'bar' || application.vendor_type !== 'retailer') {
      return NextResponse.json({ error: 'Alcohol promotions are only available to approved alcohol retailers.' }, { status: 403 });
    }

    const campaignName = typeof body.campaignName === 'string' ? body.campaignName.trim() : '';
    const offerDescription = typeof body.offerDescription === 'string' ? body.offerDescription.trim() : '';
    const startDate = body.startDate;
    const endDate = body.endDate;
    const discountPercent = body.discountPercent === null || body.discountPercent === ''
      ? null
      : Number(body.discountPercent);
    const today = new Date().toISOString().slice(0, 10);
    if (campaignName.length < 3 || campaignName.length > 100
      || offerDescription.length < 10 || offerDescription.length > 1000
      || !validDate(startDate) || !validDate(endDate)
      || startDate < today || endDate < startDate
      || (discountPercent !== null && (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 90))) {
      return NextResponse.json({ error: 'Enter a campaign name, clear offer details, valid future dates, and an optional whole-number discount between 1% and 90%.' }, { status: 400 });
    }

    const { error } = await context.database.from('merchant_application_events').insert({
      application_id: application.id,
      event_type: 'alcohol_campaign_requested',
      actor: context.actor,
      details: {
        campaign_name: campaignName,
        offer_description: offerDescription,
        requested_start_date: startDate,
        requested_end_date: endDate,
        requested_discount_percent: discountPercent,
        status: 'pending_review'
      }
    });
    if (error) {
      console.error('[MerchantNetwork] Could not record alcohol campaign request:', error);
      return NextResponse.json({ error: 'The alcohol offer request could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ requested: true }, { status: 201 });
  }

  if (body.operation === 'update_alcohol_rules') {
    if (application.business_type !== 'bar' || application.vendor_type !== 'retailer') {
      return NextResponse.json({ error: 'Compliance rules can only be updated by an alcohol retailer.' }, { status: 403 });
    }
    const minimumAge = Number(body.minimumAge);
    const maximumBottlesPerOrder = Number(body.maximumBottlesPerOrder);
    const schoolBufferMeters = Number(body.schoolBufferMeters);
    if (![18, 21].includes(minimumAge)
      || !Number.isInteger(maximumBottlesPerOrder) || maximumBottlesPerOrder < 1 || maximumBottlesPerOrder > 100
      || !Number.isInteger(schoolBufferMeters) || schoolBufferMeters < 0 || schoolBufferMeters > 5000) {
      return NextResponse.json({ error: 'Choose a minimum age of 18 or 21, up to 100 bottles, and a school buffer from 0 to 5000 metres.' }, { status: 400 });
    }
    const { data: saved, error: updateError } = await context.database.rpc('update_merchant_alcohol_rules', {
      p_application_id: application.id,
      p_actor: context.actor,
      p_minimum_age: minimumAge,
      p_maximum_bottles: maximumBottlesPerOrder,
      p_school_buffer_meters: schoolBufferMeters
    });
    if (updateError || saved !== true) {
      console.error('[MerchantNetwork] Could not save alcohol compliance rules:', updateError || 'RPC did not confirm the update.');
      return NextResponse.json({ error: 'Alcohol compliance settings could not be saved. Confirm the liquor onboarding migration is installed.' }, { status: 503 });
    }
    return NextResponse.json({ saved: true });
  }

  if (body.operation === 'receive_batch') {
    const productId = Number(body.productId);
    const quantity = Number(body.quantity);
    const lotCode = typeof body.lotCode === 'string' ? body.lotCode.trim() : '';
    const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim().slice(0, 160) : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';
    const expiryAt = body.expiryAt === '' || body.expiryAt === null ? null : body.expiryAt;
    if (
      !Number.isSafeInteger(productId) || productId < 1
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000
      || lotCode.length < 1 || lotCode.length > 120
      || (expiryAt !== null && !validDate(expiryAt))
      || (typeof expiryAt === 'string' && expiryAt < new Date().toISOString().slice(0, 10))
    ) {
      return NextResponse.json({ error: 'Enter a valid linked product, lot code, quantity and optional expiry date that is not in the past.' }, { status: 400 });
    }

    const offers = Array.isArray(application.offered_goods_pricing)
      ? application.offered_goods_pricing as Array<{ product_id?: unknown }>
      : [];
    if (!offers.some(offer => Number(offer.product_id) === productId)) {
      return NextResponse.json({ error: 'Choose a product listed in your approved business catalogue.' }, { status: 403 });
    }

    const { data: linkedProduct, error: productError } = await context.database
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();
    if (productError) {
      console.error('[MerchantNetwork] Could not verify merchant product:', productError);
      return NextResponse.json({ error: 'The linked product could not be verified.' }, { status: 503 });
    }
    if (!linkedProduct) return NextResponse.json({ error: 'This catalogue product is no longer available. Contact OnBar to update your approved catalogue.' }, { status: 404 });

    const isAlcoholRetailer = application.business_type === 'bar' && application.vendor_type === 'retailer';
    if (isAlcoholRetailer && body.exciseStampConfirmed !== true) {
      return NextResponse.json({ error: 'Confirm the excise stamp for this specific received batch before recording alcohol stock.' }, { status: 400 });
    }

    const rpcArguments = {
      p_application_id: application.id,
      p_product_id: productId,
      p_lot_code: lotCode,
      p_supplier_name: supplierName || null,
      p_expiry_at: expiryAt,
      p_quantity: quantity,
      p_storage_notes: notes || null,
      p_actor: context.actor
    };
    const { data, error } = isAlcoholRetailer
      ? await context.database.rpc('receive_merchant_product_batch_with_excise', {
        ...rpcArguments,
        p_excise_stamp_confirmed: true
      })
      : await context.database.rpc('receive_merchant_product_batch', rpcArguments);
    if (error) {
      console.error('[MerchantNetwork] Could not receive inventory batch:', error);
      return NextResponse.json({
        error: /duplicate key|merchant_product_batches_application_id_product_id_lot_code_key/i.test(error.message)
          ? 'That lot code is already recorded for this product. Use a unique lot code.'
            : /receive_merchant_product_batch_with_excise|excise_stamp_confirmed|schema cache/i.test(error.message)
              ? 'Excise-stamp stock recording is not installed. Run supabase/MERCHANT_LIQUOR_ONBOARDING_MIGRATION.sql.'
              : 'The inventory batch could not be recorded. Confirm merchant operations are installed.'
      }, { status: 503 });
    }
    return NextResponse.json({ batch: data }, { status: 201 });
  }

  if (body.operation === 'fulfillment') {
    const orderId = Number(body.orderId);
    const eventType = typeof body.eventType === 'string' ? body.eventType : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    if (!Number.isSafeInteger(orderId) || orderId < 1 || !fulfillmentEvents.has(eventType)) {
      return NextResponse.json({ error: 'Choose a valid order and fulfillment update.' }, { status: 400 });
    }

    const { data: batches, error: batchesError } = await context.database
      .from('merchant_product_batches').select('id')
      .eq('application_id', application.id);
    if (batchesError) {
      console.error('[MerchantNetwork] Could not verify fulfillment order:', batchesError);
      return NextResponse.json({ error: 'The order could not be verified.' }, { status: 503 });
    }
    const batchIds = (batches || []).map(batch => batch.id);
    const { data: traces, error: tracesError } = batchIds.length
      ? await context.database.from('merchant_order_item_trace')
        .select('order_item_id, batch_id, quantity').in('batch_id', batchIds)
      : { data: [], error: null };
    if (tracesError) {
      console.error('[MerchantNetwork] Could not verify fulfillment order trace:', tracesError);
      return NextResponse.json({ error: 'The order could not be verified.' }, { status: 503 });
    }
    const { data: returnedMovements, error: returnError } = batchIds.length
      ? await context.database.from('merchant_inventory_movements')
        .select('order_item_id, batch_id, quantity_delta')
        .eq('movement_type', 'returned')
        .eq('note', 'Returned for offline merchant redistribution')
        .in('batch_id', batchIds)
      : { data: [], error: null };
    if (returnError) {
      console.error('[MerchantNetwork] Could not verify returned inventory:', returnError);
      return NextResponse.json({ error: 'The order allocation could not be verified.' }, { status: 503 });
    }
    const activeTraces = (traces || []).filter(trace => {
      const returnedQuantity = (returnedMovements || [])
        .filter(movement => movement.batch_id === trace.batch_id
          && Number(movement.order_item_id) === Number(trace.order_item_id))
        .reduce((total, movement) => total + Number(movement.quantity_delta), 0);
      return Number(trace.quantity) > returnedQuantity;
    });
    const itemIds = [...new Set(activeTraces.map(trace => trace.order_item_id))];
    const { data: linkedItem, error: itemError } = itemIds.length
      ? await context.database.from('order_items')
        .select('id').eq('order_id', orderId).in('id', itemIds).limit(1).maybeSingle()
      : { data: null, error: null };
    if (itemError) {
      console.error('[MerchantNetwork] Could not verify order ownership:', itemError);
      return NextResponse.json({ error: 'The order could not be verified.' }, { status: 503 });
    }
    if (!linkedItem) return NextResponse.json({ error: 'This order is not assigned to your business.' }, { status: 403 });

    if (eventType === 'accepted' || eventType === 'rejected') {
      const { data: recorded, error } = await context.database.rpc('respond_merchant_order_alert', {
        p_order_id: orderId,
        p_application_id: application.id,
        p_actor: context.actor,
        p_response: eventType
      });
      if (error) {
        console.error('[MerchantNetwork] Could not record merchant order response:', error);
        return NextResponse.json({
          error: /transition is not permitted|first fulfilment event|must be assigned|only an approved merchant|accept_merchant_order_alert|respond_merchant_order_alert/i.test(error.message)
            ? 'That order has already been answered or is no longer available.'
            : 'The order response could not be saved.'
        }, { status: 409 });
      }
      if (recorded !== true) {
        return NextResponse.json({ error: 'This order has already been accepted, declined, or reassigned.' }, { status: 409 });
      }
      if (eventType === 'rejected') {
        try {
          const alerts = await alertAllocatedMerchants(context.database, orderId);
          if (alerts.applications > 0 && !alerts.escalationQueued) {
            return NextResponse.json({ error: 'The order was declined, but the next merchant alert could not be scheduled. Contact OnBar support.' }, { status: 503 });
          }
        } catch (alertError) {
          console.error('[MerchantNetwork] Could not alert newly allocated merchants:', alertError);
          return NextResponse.json({ error: 'The order was declined, but the next merchant alert could not be sent.' }, { status: 503 });
        }
      }
      return NextResponse.json({ accepted: eventType === 'accepted' }, { status: 201 });
    }

    const { data, error } = await context.database.from('merchant_fulfillment_events').insert({
      order_id: orderId,
      application_id: application.id,
      event_type: eventType,
      actor: context.actor,
      details: note ? { note } : {}
    }).select('id, order_id, event_type, details, occurred_at').single();
    if (error) {
      console.error('[MerchantNetwork] Could not record fulfillment update:', error);
      return NextResponse.json({
        error: /transition is not permitted|first fulfilment event|must be assigned|only an approved merchant/i.test(error.message)
          ? 'That update is not allowed for the current order stage. Refresh and try the next available step.'
          : 'The fulfillment update could not be saved.'
      }, { status: 409 });
    }
    return NextResponse.json({ event: data }, { status: 201 });
  }

  if (body.operation === 'report_incident') {
    const category = typeof body.category === 'string' ? body.category : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const batchId = body.batchId === '' || body.batchId === null ? null : body.batchId;
    const orderId = body.orderId === '' || body.orderId === null ? null : Number(body.orderId);
    if (
      !incidentCategories.has(category)
      || description.length < 10 || description.length > 5000
      || (batchId !== null && !isUuid(batchId))
      || (orderId !== null && (!Number.isSafeInteger(orderId) || orderId < 1))
      || (batchId === null && orderId === null)
    ) {
      return NextResponse.json({ error: 'Choose a linked order or batch, an incident category and a description of at least 10 characters.' }, { status: 400 });
    }
    const isAlcoholRetailer = application.business_type === 'bar' && application.vendor_type === 'retailer';
    if ((category === 'age_check_failed' || category === 'suspected_counterfeit') && !isAlcoholRetailer) {
      return NextResponse.json({ error: 'Alcohol compliance incident categories are only available to alcohol retailers.' }, { status: 403 });
    }
    if (category === 'suspected_counterfeit') {
      if (!batchId || orderId !== null) {
        return NextResponse.json({ error: 'A suspected counterfeit report must be linked to the affected product batch.' }, { status: 400 });
      }
      const { data: report, error } = await context.database.rpc('report_merchant_counterfeit_incident', {
        p_application_id: application.id,
        p_batch_id: batchId,
        p_description: description,
        p_actor: context.actor
      });
      if (error) {
        console.error('[MerchantNetwork] Could not place the counterfeit batch on hold:', error);
        return NextResponse.json({
          error: /already on hold/i.test(error.message)
            ? 'This batch is already on hold. Review the existing incident with OnBar.'
            : 'The counterfeit report and batch hold could not be saved.'
        }, { status: 409 });
      }
      return NextResponse.json({ incident: report }, { status: 201 });
    }
    const incident = {
      application_id: application.id,
      category,
      description,
      batch_id: batchId,
      order_id: orderId,
      reporter_contact: context.actor,
      created_by: context.actor
    };
    const { data, error } = await context.database.from('merchant_incidents')
      .insert(incident)
      .select('id, incident_code, category, description, status, severity, created_at')
      .single();
    if (error) {
      console.error('[MerchantNetwork] Could not report merchant incident:', error);
      return NextResponse.json({ error: 'The report could not be saved. Confirm the selected batch or order belongs to your business.' }, { status: 409 });
    }
    return NextResponse.json({ incident: data }, { status: 201 });
  }

  return NextResponse.json({ error: 'Choose a supported partner operation.' }, { status: 400 });
}
