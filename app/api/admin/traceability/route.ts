import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

type AdminAccess = {
  database: SupabaseClient;
  actor: string;
  canViewSensitiveData: boolean;
} | { response: NextResponse };

async function getAccess(requireSettings = false): Promise<AdminAccess> {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  const isPrivileged = ['owner', 'admin'].includes(session.role);
  const permitted = isPrivileged || (requireSettings
    ? session.permissions.can_manage_settings === true
    : session.permissions.can_manage_orders === true);
  if (!permitted) return { response: NextResponse.json({ error: 'Traceability access is required.' }, { status: 403 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return { response: NextResponse.json({ error: 'Traceability database access is not configured.' }, { status: 503 }) };
  return {
    database: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    actor: session.email || (session.role === 'owner' ? 'Owner' : 'Admin'),
    canViewSensitiveData: session.role === 'owner' || session.permissions.can_view_sensitive_data === true
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function recordTraceAccess(access: Extract<AdminAccess, { database: SupabaseClient }>, type: 'order' | 'batch', value: string) {
  const { error } = await access.database.from('merchant_trace_access_events').insert({
    actor: access.actor,
    query_type: type,
    query_value: value.slice(0, 160)
  });
  if (error) {
    console.error('[Traceability] Could not record trace access:', error);
    throw new Error('Trace access could not be audited.');
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('catalog') === '1') {
    const access = await getAccess(true);
    if ('response' in access) return access.response;
    const [{ data: merchants, error: merchantsError }, { data: products, error: productsError }] = await Promise.all([
      access.database.from('merchant_applications')
        .select('id, merchant_code, business_name, business_type, town, county')
        .eq('status', 'approved').order('business_name').limit(500),
      access.database.from('products')
        .select('id, name, sku').eq('status', 'Live').order('name').limit(1000)
    ]);
    if (merchantsError || productsError) {
      console.error('[Traceability] Could not load inventory setup choices:', merchantsError || productsError);
      return NextResponse.json({ error: 'Merchant and product lists could not be loaded.' }, { status: 500 });
    }
    if (params.get('includeStock') !== '1') {
      return NextResponse.json({ merchants: merchants || [], products: products || [] }, {
        headers: { 'Cache-Control': 'private, no-store, max-age=0' }
      });
    }

    const stockRows: Array<{
      application_id: string;
      business_name: string;
      merchant_code: string | null;
      product_id: number;
      available_quantity: number;
      updated_at: string | null;
    }> = [];
    let stockError: { message: string; code?: string } | null = null;
    for (let offset = 0; ; offset += 1000) {
      const result = await access.database.from('merchant_product_stock_summary')
        .select('application_id, business_name, merchant_code, product_id, available_quantity, updated_at')
        .order('updated_at', { ascending: false })
        .range(offset, offset + 999);
      if (result.error) {
        stockError = result.error;
        break;
      }
      stockRows.push(...(result.data || []));
      if ((result.data || []).length < 1000) break;
    }
    const { data: movementRows, error: movementError } = await access.database
      .from('merchant_inventory_movements')
      .select('batch_id, movement_type, quantity_delta, actor, note, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (stockError || movementError) {
      const error = stockError || movementError;
      console.error('[Traceability] Could not load live merchant stock:', error);
      return NextResponse.json({
        merchants: merchants || [],
        products: products || [],
        stockCatalog: [],
        stockActivity: [],
        stockError: /merchant_product_stock_summary|schema cache|does not exist/i.test(error?.message || '')
          ? 'Live stock catalog is not installed. Run supabase/MERCHANT_STOCK_COUNTS_MIGRATION.sql after MERCHANT_OPERATIONS_MIGRATION.sql.'
          : 'Live merchant stock could not be loaded.'
      }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    }

    const movementBatchIds = [...new Set((movementRows || []).map(movement => movement.batch_id))];
    const { data: movementBatches, error: movementBatchesError } = movementBatchIds.length
      ? await access.database.from('merchant_product_batches')
        .select('id, application_id, product_id')
        .in('id', movementBatchIds)
      : { data: [], error: null };
    if (movementBatchesError) {
      console.error('[Traceability] Could not link live stock activity to catalog items:', movementBatchesError);
      return NextResponse.json({ error: 'Live stock activity could not be loaded.' }, { status: 503 });
    }

    const productRows = products || [];
    const merchantRows = merchants || [];
    const productById = new Map(productRows.map(product => [Number(product.id), product]));
    const merchantById = new Map(merchantRows.map(merchant => [merchant.id, merchant]));
    const stockByProduct = new Map<number, typeof stockRows>();
    for (const row of stockRows) {
      const rows = stockByProduct.get(Number(row.product_id)) || [];
      rows.push(row);
      stockByProduct.set(Number(row.product_id), rows);
    }
    const stockCatalog = productRows.map(product => {
      const vendors = (stockByProduct.get(Number(product.id)) || [])
        .map(row => ({
          applicationId: row.application_id,
          name: row.business_name,
          merchantCode: row.merchant_code,
          available: Math.max(0, Number(row.available_quantity || 0)),
          updatedAt: row.updated_at
        }))
        .sort((left, right) => right.available - left.available || left.name.localeCompare(right.name));
      return {
        productId: Number(product.id),
        name: product.name,
        sku: product.sku,
        available: vendors.reduce((total, vendor) => total + vendor.available, 0),
        vendorCount: vendors.filter(vendor => vendor.available > 0).length,
        vendors,
        updatedAt: vendors.reduce<string | null>((latest, vendor) =>
          vendor.updatedAt && (!latest || vendor.updatedAt > latest) ? vendor.updatedAt : latest, null)
      };
    });

    const batchById = new Map((movementBatches || []).map(batch => [batch.id, batch]));
    const activityByKey = new Map<string, {
      productId: number;
      productName: string;
      merchantName: string;
      movementType: string;
      quantityDelta: number;
      actor: string;
      note: string | null;
      createdAt: string;
    }>();
    for (const movement of movementRows || []) {
      const batch = batchById.get(movement.batch_id);
      if (!batch) continue;
      const product = productById.get(Number(batch.product_id));
      const merchant = merchantById.get(batch.application_id);
      if (!product || !merchant) continue;
      const key = [
        movement.created_at,
        batch.application_id,
        batch.product_id,
        movement.actor,
        movement.note || ''
      ].join(':');
      const previous = activityByKey.get(key);
      if (previous) {
        previous.quantityDelta += Number(movement.quantity_delta || 0);
      } else {
        activityByKey.set(key, {
          productId: Number(batch.product_id),
          productName: product.name,
          merchantName: merchant.business_name,
          movementType: movement.movement_type,
          quantityDelta: Number(movement.quantity_delta || 0),
          actor: movement.actor,
          note: movement.note,
          createdAt: movement.created_at
        });
      }
    }

    return NextResponse.json({
      merchants: merchantRows,
      products: productRows,
      stockCatalog,
      stockActivity: [...activityByKey.values()]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20)
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  }
  const access = await getAccess();
  if ('response' in access) return access.response;
  const orderIdValue = params.get('orderId');
  const batchValue = params.get('batch');
  if ((!orderIdValue && !batchValue) || (orderIdValue && batchValue)) {
    return NextResponse.json({ error: 'Provide one order ID or batch / lot code to trace.' }, { status: 400 });
  }

  if (orderIdValue) {
    const orderId = Number(orderIdValue);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return NextResponse.json({ error: 'Enter a valid order ID.' }, { status: 400 });
    }
    const { data: order, error: orderError } = await access.database
      .from('orders')
      .select('id, customer_name, customer_phone, customer_email, total_price, status, created_at, rider_name, rider_phone')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) {
      console.error('[Traceability] Could not load order:', orderError);
      return NextResponse.json({ error: 'Order trace could not be loaded.' }, { status: 500 });
    }
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    const { data: itemData, error: itemsError } = await access.database
      .from('order_items')
      .select('id, product_id, quantity, unit_price, size, status')
      .eq('order_id', orderId)
      .order('id', { ascending: true });
    if (itemsError) {
      console.error('[Traceability] Could not load order items:', itemsError);
      return NextResponse.json({ error: 'Order items could not be loaded.' }, { status: 500 });
    }
    const items = (itemData || []) as Array<{
      id: number; product_id: number | null; quantity: number; unit_price: number;
      size: string | null; status: string | null;
    }>;
    const itemIds = items.map(item => item.id);
    const productIds = [...new Set(items.map(item => item.product_id).filter((id): id is number => id !== null))];
    const [{ data: productData, error: productsError }, { data: traceData, error: traceError }, { data: fulfillmentData, error: fulfillmentError }, { data: incidentData, error: incidentsError }, { data: complaintData, error: complaintsError }] = await Promise.all([
      productIds.length
        ? access.database.from('products').select('id, name, sku').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      itemIds.length
        ? access.database.from('merchant_order_item_trace').select('id, order_item_id, batch_id, quantity, created_by, created_at').in('order_item_id', itemIds)
        : Promise.resolve({ data: [], error: null }),
      access.database.from('merchant_fulfillment_events').select('id, application_id, event_type, actor, details, occurred_at').eq('order_id', orderId).order('occurred_at'),
      access.database.from('merchant_incidents').select('id, incident_code, application_id, batch_id, category, description, status, severity, resolution_note, created_at').eq('order_id', orderId).order('created_at', { ascending: false }),
      access.database.from('customer_order_complaints').select('id, order_item_id, category, description, created_at').eq('order_id', orderId).order('created_at', { ascending: false })
    ]);
    if (productsError || traceError || fulfillmentError || incidentsError || complaintsError) {
      console.error('[Traceability] Could not assemble order trace:', productsError || traceError || fulfillmentError || incidentsError || complaintsError);
      return NextResponse.json({ error: 'Traceability records could not be assembled.' }, { status: 500 });
    }
    const traces = (traceData || []) as Array<{ id: number; order_item_id: number; batch_id: string; quantity: number; created_by: string; created_at: string }>;
    const batchIds = [...new Set(traces.map(trace => trace.batch_id))];
    const incidentRows = (incidentData || []) as Array<{
      id: string; incident_code: string; application_id: string; batch_id: string | null;
      category: string; description: string; status: string; severity: string; resolution_note: string | null; created_at: string;
    }>;
    const [batchResult, incidentEventsResult] = await Promise.all([
      batchIds.length
        ? access.database.from('merchant_product_batches')
          .select('id, application_id, product_id, lot_code, supplier_name, received_at, expiry_at, quantity_received, storage_notes')
          .in('id', batchIds)
        : Promise.resolve({ data: [], error: null }),
      incidentRows.length
        ? access.database.from('merchant_incident_events').select('id, incident_id, event_type, actor, details, created_at')
          .in('incident_id', incidentRows.map(incident => incident.id)).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);
    if (batchResult.error || incidentEventsResult.error) {
      console.error('[Traceability] Could not load batch or incident detail:', batchResult.error || incidentEventsResult.error);
      return NextResponse.json({ error: 'Batch or incident trace could not be loaded.' }, { status: 500 });
    }
    const applicationIds = [...new Set([
      ...incidentRows.map(incident => incident.application_id),
      ...((batchResult.data || []) as Array<{ application_id: string }>).map(batch => batch.application_id)
    ])];
    const applicationResult = applicationIds.length
      ? await access.database.from('merchant_applications').select('id, merchant_code, business_name, business_type, town, county, status').in('id', applicationIds)
      : { data: [], error: null };
    if (applicationResult.error) {
      console.error('[Traceability] Could not load merchant detail:', applicationResult.error);
      return NextResponse.json({ error: 'Merchant trace could not be loaded.' }, { status: 500 });
    }
    const batches = (batchResult.data || []) as Array<Record<string, unknown> & { id: string; application_id: string; product_id: number }>;
    const merchants = (applicationResult.data || []) as Array<Record<string, unknown> & { id: string }>;
    const products = (productData || []) as Array<{ id: number; name: string; sku: string | null }>;
    const [movementResult, holdResult] = await Promise.all([
      batchIds.length
        ? access.database.from('merchant_inventory_movements')
          .select('id, batch_id, movement_type, quantity_delta, order_id, order_item_id, actor, note, created_at')
          .in('batch_id', batchIds).order('created_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: [], error: null }),
      batchIds.length
        ? access.database.from('merchant_batch_holds')
          .select('id, batch_id, reason, placed_by, placed_at, released_by, released_at, release_note')
          .in('batch_id', batchIds).order('placed_at', { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);
    if (movementResult.error || holdResult.error) {
      console.error('[Traceability] Could not load batch events:', movementResult.error || holdResult.error);
      return NextResponse.json({ error: 'Inventory event trace could not be loaded.' }, { status: 500 });
    }
    const batchMap = new Map(batches.map(batch => [batch.id, {
      ...batch,
      merchant: merchants.find(merchant => merchant.id === batch.application_id) || null,
      product: products.find(product => product.id === batch.product_id) || null,
      movements: (movementResult.data || []).filter(movement => movement.batch_id === batch.id),
      holds: (holdResult.data || []).filter(hold => hold.batch_id === batch.id)
    }]));

    try {
      await recordTraceAccess(access, 'order', String(orderId));
    } catch (auditError) {
      return NextResponse.json({ error: auditError instanceof Error ? auditError.message : 'Trace access could not be audited.' }, { status: 503 });
    }
    const { customer_name: customerName, customer_phone: customerPhone, customer_email: customerEmail, rider_name: riderName, rider_phone: riderPhone, ...publicOrder } = order;
    return NextResponse.json({
      order: {
        ...publicOrder,
        customer: access.canViewSensitiveData
          ? { name: customerName, phone: customerPhone, email: customerEmail }
          : { name: 'Restricted', phone: null, email: null },
        delivery: access.canViewSensitiveData
          ? { riderName, riderPhone }
          : { riderName: riderName ? 'Assigned' : null, riderPhone: null }
      },
      items: items.map(item => ({
        ...item,
        product: products.find(product => product.id === item.product_id) || null,
        batches: traces.filter(trace => trace.order_item_id === item.id).map(trace => ({
          ...trace,
          batch: batchMap.get(trace.batch_id) || null
        }))
      })),
      fulfillment: (fulfillmentData || []).map(event => ({
        ...event,
        merchant: merchants.find(merchant => merchant.id === event.application_id) || null
      })),
      customerComplaints: complaintData || [],
      incidents: incidentRows.map(incident => ({
        ...incident,
        events: (incidentEventsResult.data || []).filter(event => event.incident_id === incident.id)
      }))
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  const search = batchValue?.trim();
  if (!search || search.length > 120 || /[%_]/.test(search)) {
    return NextResponse.json({ error: 'Enter a valid exact batch ID or lot code.' }, { status: 400 });
  }
  const query = access.database.from('merchant_product_batches')
    .select('id, application_id, product_id, lot_code, supplier_name, received_at, expiry_at, quantity_received, storage_notes')
    .limit(50);
  const { data: batchData, error: batchError } = isUuid(search)
    ? await query.eq('id', search)
    : await query.eq('lot_code', search);
  if (batchError) {
    console.error('[Traceability] Could not search batch:', batchError);
    return NextResponse.json({ error: 'Batch trace could not be loaded.' }, { status: 500 });
  }
  if (!batchData?.length) return NextResponse.json({ error: 'No batch or lot code found.' }, { status: 404 });
  const batches = batchData as Array<{ id: string; application_id: string; product_id: number; lot_code: string; quantity_received: number }>;
  const batchIds = batches.map(batch => batch.id);
  const [{ data: traceRows, error: tracesError }, { data: movementRows, error: movementsError }, { data: holdRows, error: holdsError }, { data: merchantRows, error: merchantsError }, { data: productRows, error: batchProductsError }] = await Promise.all([
    access.database.from('merchant_order_item_trace').select('id, order_item_id, batch_id, quantity, created_by, created_at').in('batch_id', batchIds),
    access.database.from('merchant_inventory_movements').select('id, batch_id, movement_type, quantity_delta, order_id, order_item_id, actor, note, created_at').in('batch_id', batchIds).order('created_at', { ascending: false }).limit(500),
    access.database.from('merchant_batch_holds').select('id, batch_id, reason, placed_by, placed_at, released_by, released_at, release_note').in('batch_id', batchIds).order('placed_at', { ascending: false }),
    access.database.from('merchant_applications').select('id, merchant_code, business_name, business_type, town, county, status').in('id', batches.map(batch => batch.application_id)),
    access.database.from('products').select('id, name, sku').in('id', [...new Set(batches.map(batch => batch.product_id))])
  ]);
  if (tracesError || movementsError || holdsError || merchantsError || batchProductsError) {
    console.error('[Traceability] Could not assemble batch history:', tracesError || movementsError || holdsError || merchantsError || batchProductsError);
    return NextResponse.json({ error: 'Batch history could not be assembled.' }, { status: 500 });
  }
  const traceList = (traceRows || []) as Array<{ id: number; order_item_id: number; batch_id: string; quantity: number; created_by: string; created_at: string }>;
  const relatedItemIds = [...new Set(traceList.map(trace => trace.order_item_id))];
  const { data: relatedItems, error: relatedItemsError } = relatedItemIds.length
    ? await access.database.from('order_items').select('id, order_id, product_id').in('id', relatedItemIds)
    : { data: [], error: null };
  if (relatedItemsError) {
    console.error('[Traceability] Could not load batch order links:', relatedItemsError);
    return NextResponse.json({ error: 'Related orders could not be loaded.' }, { status: 500 });
  }
  const orderIds = [...new Set((relatedItems || []).map(item => Number(item.order_id)).filter(Number.isSafeInteger))];
  const { data: relatedOrders, error: relatedOrdersError } = orderIds.length
    ? await access.database.from('orders').select('id, customer_name, status, created_at').in('id', orderIds)
    : { data: [], error: null };
  if (relatedOrdersError) {
    console.error('[Traceability] Could not load related orders:', relatedOrdersError);
    return NextResponse.json({ error: 'Related orders could not be loaded.' }, { status: 500 });
  }
  try {
    await recordTraceAccess(access, 'batch', search);
  } catch (auditError) {
    return NextResponse.json({ error: auditError instanceof Error ? auditError.message : 'Trace access could not be audited.' }, { status: 503 });
  }

  return NextResponse.json({
    batches: batches.map(batch => ({
      ...batch,
      merchant: (merchantRows || []).find(merchant => merchant.id === batch.application_id) || null,
      product: (productRows || []).find(product => product.id === batch.product_id) || null,
      movements: (movementRows || []).filter(movement => movement.batch_id === batch.id),
      holds: (holdRows || []).filter(hold => hold.batch_id === batch.id),
      orders: traceList.filter(trace => trace.batch_id === batch.id).map(trace => {
        const item = (relatedItems || []).find(candidate => candidate.id === trace.order_item_id);
        const relatedOrder = (relatedOrders || []).find(candidate => Number(candidate.id) === Number(item?.order_id));
        return {
          ...trace,
          order_item_id: trace.order_item_id,
          order: relatedOrder
            ? { id: relatedOrder.id, customer: access.canViewSensitiveData ? relatedOrder.customer_name : 'Restricted', status: relatedOrder.status, created_at: relatedOrder.created_at }
            : null
        };
      })
    }))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    batchId?: unknown;
    reason?: unknown;
    releaseNote?: unknown;
    applicationId?: unknown;
    orderId?: unknown;
    category?: unknown;
    description?: unknown;
    severity?: unknown;
    quantity?: unknown;
    productId?: unknown;
    lotCode?: unknown;
    supplierName?: unknown;
    storageNotes?: unknown;
    expiryAt?: unknown;
    orderItemId?: unknown;
    eventType?: unknown;
    note?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid traceability action is required.' }, { status: 400 });
  }
  if (body.action === 'receive') {
    const access = await getAccess(true);
    if ('response' in access) return access.response;
    const quantity = Number(body.quantity);
    const productId = Number(body.productId);
    const applicationId = body.applicationId;
    const lotCode = typeof body.lotCode === 'string' ? body.lotCode.trim().slice(0, 120) : '';
    const supplierName = typeof body.supplierName === 'string' ? body.supplierName.trim().slice(0, 160) : '';
    const storageNotes = typeof body.storageNotes === 'string' ? body.storageNotes.trim().slice(0, 1000) : '';
    const expiryAt = typeof body.expiryAt === 'string' ? body.expiryAt : null;
    const parsedExpiry = expiryAt ? new Date(`${expiryAt}T00:00:00.000Z`) : null;
    if (
      typeof applicationId !== 'string' || !isUuid(applicationId)
      || !Number.isSafeInteger(productId) || productId < 1
      || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000
      || lotCode.length < 1
      || (expiryAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryAt)
        || !parsedExpiry || !Number.isFinite(parsedExpiry.getTime())
        || parsedExpiry.toISOString().slice(0, 10) !== expiryAt))
    ) {
      return NextResponse.json({ error: 'Provide a merchant, product, lot code, positive quantity, and valid optional expiry date.' }, { status: 400 });
    }
    const { data, error } = await access.database.rpc('receive_merchant_product_batch', {
      p_application_id: applicationId,
      p_product_id: productId,
      p_lot_code: lotCode,
      p_supplier_name: supplierName || null,
      p_expiry_at: expiryAt,
      p_quantity: quantity,
      p_storage_notes: storageNotes || null,
      p_actor: access.actor
    });
    if (error) {
      console.error('[Traceability] Could not receive batch:', error);
      const duplicate = error.code === '23505';
      const invalidMerchant = /approved merchant/i.test(error.message);
      return NextResponse.json({
        error: duplicate ? 'This merchant already has that product lot code.'
          : invalidMerchant ? 'Only an approved merchant can receive tracked inventory.'
            : 'Batch could not be received. Confirm the merchant operations migration is installed.'
      }, { status: duplicate ? 409 : invalidMerchant ? 409 : 503 });
    }
    return NextResponse.json({ batch: data }, { status: 201 });
  }
  if (body.action === 'allocate') {
    const access = await getAccess();
    if ('response' in access) return access.response;
    const quantity = Number(body.quantity);
    if (typeof body.batchId !== 'string' || !isUuid(body.batchId)
      || !Number.isSafeInteger(body.orderItemId) || Number(body.orderItemId) < 1
      || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
      return NextResponse.json({ error: 'Provide a valid order item, batch, and positive quantity.' }, { status: 400 });
    }
    const { data, error } = await access.database.from('merchant_order_item_trace').insert({
      order_item_id: body.orderItemId,
      batch_id: body.batchId,
      quantity,
      created_by: access.actor
    }).select('id, order_item_id, batch_id, quantity, created_at').single();
    if (error) {
      console.error('[Traceability] Could not allocate batch:', error);
      const conflict = error.code === '23505';
      return NextResponse.json({
        error: conflict ? 'This batch is already traced to that order item.'
          : /hold|expired|inventory|approved merchant|match the traced|confirmed payment|payment proof|delivery radius|coordinates are required/i.test(error.message)
            ? error.message
            : 'Batch could not be allocated. Confirm the order item and batch are valid.'
      }, { status: conflict ? 409 : 400 });
    }
    return NextResponse.json({ trace: data }, { status: 201 });
  }
  if (body.action === 'fulfillment') {
    const access = await getAccess();
    if ('response' in access) return access.response;
    const allowedEvents = ['accepted', 'rejected', 'preparing', 'ready', 'handed_to_rider', 'collected', 'delivered', 'cancelled', 'exception'];
    if (
      !Number.isSafeInteger(body.orderId) || Number(body.orderId) < 1
      || typeof body.applicationId !== 'string' || !isUuid(body.applicationId)
      || typeof body.eventType !== 'string' || !allowedEvents.includes(body.eventType)
      || (body.note !== undefined && typeof body.note !== 'string')
    ) {
      return NextResponse.json({ error: 'A valid order, approved merchant, and fulfilment event are required.' }, { status: 400 });
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    if (body.eventType === 'accepted' && note.length < 8) {
      return NextResponse.json({
        error: 'Record how and when the merchant confirmed acceptance before marking this order accepted.'
      }, { status: 400 });
    }
    const { data, error } = await access.database.from('merchant_fulfillment_events').insert({
      order_id: body.orderId,
      application_id: body.applicationId,
      event_type: body.eventType,
      actor: access.actor,
      details: note ? { note } : {}
    }).select('id, order_id, application_id, event_type, actor, details, occurred_at').single();
    if (error) {
      console.error('[Traceability] Could not append fulfilment event:', error);
      const workflowError = /must be assigned|transition is not permitted|first fulfilment/i.test(error.message);
      return NextResponse.json({
        error: workflowError ? error.message : 'Fulfilment event could not be recorded.'
      }, { status: workflowError ? 409 : 500 });
    }
    return NextResponse.json({ event: data }, { status: 201 });
  }
  if (body.action === 'hold' || body.action === 'release') {
    const access = await getAccess(true);
    if ('response' in access) return access.response;
    if (typeof body.batchId !== 'string' || !isUuid(body.batchId)) {
      return NextResponse.json({ error: 'A valid batch ID is required.' }, { status: 400 });
    }
    if (body.action === 'hold') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
      if (reason.length < 5) return NextResponse.json({ error: 'Explain why this batch must be held.' }, { status: 400 });
      const { data, error } = await access.database.from('merchant_batch_holds')
        .insert({ batch_id: body.batchId, reason, placed_by: access.actor })
        .select('id, batch_id, reason, placed_by, placed_at')
        .single();
      if (error) {
        console.error('[Traceability] Could not hold batch:', error);
        return NextResponse.json({ error: error.code === '23505' ? 'This batch is already on hold.' : 'Batch hold could not be placed.' }, { status: error.code === '23505' ? 409 : 500 });
      }
      return NextResponse.json({ hold: data }, { status: 201 });
    }
    const releaseNote = typeof body.releaseNote === 'string' ? body.releaseNote.trim().slice(0, 2000) : '';
    if (releaseNote.length < 5) return NextResponse.json({ error: 'Add a note explaining why the batch hold is being released.' }, { status: 400 });
    const { data, error } = await access.database.from('merchant_batch_holds')
      .update({ released_by: access.actor, released_at: new Date().toISOString(), release_note: releaseNote })
      .eq('batch_id', body.batchId)
      .is('released_at', null)
      .select('id, batch_id, released_by, released_at, release_note')
      .maybeSingle();
    if (error) {
      console.error('[Traceability] Could not release batch hold:', error);
      return NextResponse.json({ error: 'Batch hold could not be released.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'No active hold exists for this batch.' }, { status: 409 });
    return NextResponse.json({ hold: data });
  }

  if (body.action === 'incident') {
    const access = await getAccess();
    if ('response' in access) return access.response;
    const category = body.category;
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 5000) : '';
    if (
      typeof body.applicationId !== 'string' || !isUuid(body.applicationId)
      || !['product_quality', 'food_safety', 'delivery', 'conduct', 'other'].includes(String(category))
      || description.length < 10
      || (body.orderId !== undefined && body.orderId !== null && (!Number.isSafeInteger(body.orderId) || Number(body.orderId) < 1))
      || (body.batchId !== undefined && body.batchId !== null && (typeof body.batchId !== 'string' || !isUuid(body.batchId)))
    ) {
      return NextResponse.json({ error: 'Provide a valid merchant, incident category, and description (at least 10 characters).' }, { status: 400 });
    }
    const severity = ['unassessed', 'low', 'medium', 'high', 'critical'].includes(String(body.severity)) ? String(body.severity) : 'unassessed';
    const { data, error } = await access.database.from('merchant_incidents').insert({
      application_id: body.applicationId,
      order_id: body.orderId ?? null,
      batch_id: body.batchId ?? null,
      category,
      description,
      severity,
      created_by: access.actor
    }).select('id, incident_code, status, severity, created_at').single();
    if (error) {
      console.error('[Traceability] Could not create incident:', error);
      return NextResponse.json({ error: 'Incident could not be recorded.' }, { status: 500 });
    }
    return NextResponse.json({ incident: data }, { status: 201 });
  }
  return NextResponse.json({ error: 'Unsupported traceability action.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const access = await getAccess(true);
  if ('response' in access) return access.response;
  let body: { incidentId?: unknown; status?: unknown; severity?: unknown; assignedTo?: unknown; resolutionNote?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid incident update is required.' }, { status: 400 });
  }
  const statuses = ['reported', 'triaged', 'investigating', 'action_required', 'resolved', 'closed'];
  const severities = ['unassessed', 'low', 'medium', 'high', 'critical'];
  if (typeof body.incidentId !== 'string' || !isUuid(body.incidentId)
    || (body.status !== undefined && !statuses.includes(String(body.status)))
    || (body.severity !== undefined && !severities.includes(String(body.severity)))
    || (body.assignedTo !== undefined && typeof body.assignedTo !== 'string')
    || (body.resolutionNote !== undefined && typeof body.resolutionNote !== 'string')
    || (['resolved', 'closed'].includes(String(body.status)) && (typeof body.resolutionNote !== 'string' || body.resolutionNote.trim().length < 5))) {
    return NextResponse.json({ error: 'Provide a valid incident update.' }, { status: 400 });
  }
  const update: Record<string, unknown> = { updated_by: access.actor };
  if (body.status !== undefined) update.status = body.status;
  if (body.severity !== undefined) update.severity = body.severity;
  if (body.assignedTo !== undefined) update.assigned_to = String(body.assignedTo).trim().slice(0, 160) || null;
  if (body.resolutionNote !== undefined) update.resolution_note = String(body.resolutionNote).trim().slice(0, 2000) || null;
  const { data, error } = await access.database.from('merchant_incidents')
    .update(update)
    .eq('id', body.incidentId)
    .select('id, incident_code, status, severity, assigned_to, resolution_note, updated_at, resolved_at')
    .maybeSingle();
  if (error) {
    console.error('[Traceability] Could not update incident:', error);
    const workflowError = /status transition is not permitted|resolution note/i.test(error.message);
    return NextResponse.json({
      error: workflowError ? error.message : 'Incident update could not be saved.'
    }, { status: workflowError ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
  return NextResponse.json({ incident: data });
}
