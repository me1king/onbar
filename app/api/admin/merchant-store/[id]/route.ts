import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_settings !== true) {
    return NextResponse.json({ error: 'Merchant store access is required.' }, { status: 403 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'A valid merchant ID is required.' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Merchant operations database access is not configured.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: application, error: applicationError } = await database
    .from('merchant_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (applicationError) {
    console.error('[MerchantStore] Could not load merchant:', applicationError);
    const migrationMissing = applicationError.code === '42P01' || /merchant_applications/i.test(applicationError.message);
    return NextResponse.json({
      error: migrationMissing
        ? 'Merchant operations schema is not installed. Run supabase/MERCHANT_OPERATIONS_MIGRATION.sql in Supabase.'
        : 'Merchant store details could not be loaded.'
    }, { status: 503 });
  }
  if (!application) return NextResponse.json({ error: 'Merchant not found.' }, { status: 404 });

  const actor = session.email || (session.role === 'owner' ? 'Owner' : 'Admin');
  const { error: auditError } = await database.from('merchant_application_events').insert({
    application_id: id,
    event_type: 'store_viewed',
    actor,
    details: { view: 'read_only_merchant_store' }
  });
  if (auditError) {
    console.error('[MerchantStore] Could not audit store access:', auditError);
    return NextResponse.json({ error: 'Merchant store access could not be audited.' }, { status: 503 });
  }

  const [
    { data: applicationEvents, error: eventsError },
    { data: batchRows, error: batchesError },
    { data: fulfillmentRows, error: fulfillmentError },
    { data: incidentRows, error: incidentsError }
  ] = await Promise.all([
    database.from('merchant_application_events')
      .select('id, event_type, actor, details, created_at')
      .eq('application_id', id).order('created_at', { ascending: false }).limit(300),
    database.from('merchant_product_batches')
      .select('id, application_id, product_id, lot_code, supplier_name, received_at, expiry_at, quantity_received, storage_notes')
      .eq('application_id', id).order('received_at', { ascending: false }).limit(500),
    database.from('merchant_fulfillment_events')
      .select('id, order_id, event_type, actor, details, occurred_at')
      .eq('application_id', id).order('occurred_at', { ascending: false }).limit(500),
    database.from('merchant_incidents')
      .select('id, incident_code, batch_id, order_id, category, description, status, severity, resolution_note, created_at')
      .eq('application_id', id).order('created_at', { ascending: false }).limit(500)
  ]);
  if (eventsError || batchesError || fulfillmentError || incidentsError) {
    console.error('[MerchantStore] Could not load store history:', eventsError || batchesError || fulfillmentError || incidentsError);
    return NextResponse.json({ error: 'Merchant store history could not be loaded. Confirm the merchant operations migration is installed.' }, { status: 503 });
  }

  const batches = batchRows || [];
  const batchIds = batches.map(batch => batch.id);
  const productIds = [...new Set(batches.map(batch => batch.product_id))];
  const [
    { data: products, error: productsError },
    { data: movements, error: movementsError },
    { data: holds, error: holdsError },
    { data: traces, error: tracesError }
  ] = await Promise.all([
    productIds.length
      ? database.from('products').select('id, name, sku').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? database.from('merchant_inventory_movements')
        .select('id, batch_id, movement_type, quantity_delta, order_id, actor, note, created_at')
        .in('batch_id', batchIds).order('created_at', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? database.from('merchant_batch_holds')
        .select('id, batch_id, reason, placed_by, placed_at, released_by, released_at, release_note')
        .in('batch_id', batchIds).order('placed_at', { ascending: false }).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? database.from('merchant_order_item_trace')
        .select('id, order_item_id, batch_id, quantity, created_by, created_at')
        .in('batch_id', batchIds).order('created_at', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (productsError || movementsError || holdsError || tracesError) {
    console.error('[MerchantStore] Could not load inventory history:', productsError || movementsError || holdsError || tracesError);
    return NextResponse.json({ error: 'Merchant inventory history could not be loaded.' }, { status: 503 });
  }

  const itemIds = [...new Set((traces || []).map(trace => trace.order_item_id))];
  const { data: orderItems, error: orderItemsError } = itemIds.length
    ? await database.from('order_items').select('id, order_id').in('id', itemIds)
    : { data: [], error: null };
  if (orderItemsError) {
    console.error('[MerchantStore] Could not load traced order references:', orderItemsError);
    return NextResponse.json({ error: 'Merchant order references could not be loaded.' }, { status: 503 });
  }

  const orderIds = [...new Set([
    ...(orderItems || []).map(item => Number(item.order_id)),
    ...(fulfillmentRows || []).map(event => Number(event.order_id)),
    ...(incidentRows || [])
      .filter(incident => incident.order_id !== null)
      .map(incident => Number(incident.order_id))
  ].filter(Number.isSafeInteger))];
  const { data: orderRows, error: ordersError } = orderIds.length
    ? await database.from('orders').select('id, status, created_at').in('id', orderIds)
    : { data: [], error: null };
  if (ordersError) {
    console.error('[MerchantStore] Could not load order references:', ordersError);
    return NextResponse.json({ error: 'Merchant order history could not be loaded.' }, { status: 503 });
  }

  const incidentIds = (incidentRows || []).map(incident => incident.id);
  const { data: incidentEvents, error: incidentEventsError } = incidentIds.length
    ? await database.from('merchant_incident_events')
      .select('id, incident_id, event_type, actor, details, created_at')
      .in('incident_id', incidentIds).order('created_at', { ascending: false }).limit(2000)
    : { data: [], error: null };
  if (incidentEventsError) {
    console.error('[MerchantStore] Could not load incident history:', incidentEventsError);
    return NextResponse.json({ error: 'Merchant incident history could not be loaded.' }, { status: 503 });
  }

  const dispatchLocationEvent = (applicationEvents || []).find(event => event.event_type === 'dispatch_location_updated');
  const submittedEvent = (applicationEvents || []).find(event => event.event_type === 'submitted');
  const eventLocationDescription = (event: typeof dispatchLocationEvent) =>
    typeof event?.details?.location_description === 'string'
      ? event.details.location_description
      : null;
  const dispatchLocationDescription = dispatchLocationEvent
    ? eventLocationDescription(dispatchLocationEvent)
    : application.dispatch_location_description || eventLocationDescription(submittedEvent);

  return NextResponse.json({
    application: {
      ...application,
      dispatch_location_description: dispatchLocationDescription,
      documents: Array.isArray(application.documents)
        ? application.documents.map((document: Record<string, unknown>) => ({
          id: document.id,
          type: document.type,
          name: document.name,
          contentType: document.contentType || 'application/octet-stream',
          expiresAt: document.expiresAt
        }))
        : []
    },
    applicationEvents: applicationEvents || [],
    batches: batches.map(batch => ({
      ...batch,
      product: (products || []).find(product => product.id === batch.product_id) || null,
      movements: (movements || []).filter(movement => movement.batch_id === batch.id),
      holds: (holds || []).filter(hold => hold.batch_id === batch.id),
      orders: (traces || []).filter(trace => trace.batch_id === batch.id).map(trace => {
        const item = (orderItems || []).find(candidate => candidate.id === trace.order_item_id);
        const order = (orderRows || []).find(candidate => Number(candidate.id) === Number(item?.order_id));
        return { ...trace, order: order || null };
      })
    })),
    fulfillment: (fulfillmentRows || []).map(event => ({
      ...event,
      order: (orderRows || []).find(order => Number(order.id) === Number(event.order_id)) || null
    })),
    incidents: (incidentRows || []).map(incident => ({
      ...incident,
      order: (orderRows || []).find(order => Number(order.id) === Number(incident.order_id)) || null,
      events: (incidentEvents || []).filter(event => event.incident_id === incident.id)
    }))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role) && session.permissions.can_manage_settings !== true) {
    return NextResponse.json({ error: 'Merchant store access is required.' }, { status: 403 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'A valid merchant ID is required.' }, { status: 400 });

  let body: {
    latitude?: unknown;
    longitude?: unknown;
    deliveryRadiusKm?: unknown;
    dispatchLocationDescription?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid business coordinates are required.' }, { status: 400 });
  }

  const parseCoordinate = (value: unknown): number | null | undefined => {
    if (value === null || value === '') return null;
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const latitude = parseCoordinate(body.latitude);
  const longitude = parseCoordinate(body.longitude);
  const hasLocationDescription = Object.prototype.hasOwnProperty.call(body, 'dispatchLocationDescription');
  const dispatchLocationDescription = body.dispatchLocationDescription === null
    ? null
    : typeof body.dispatchLocationDescription === 'string'
      ? body.dispatchLocationDescription.trim() || null
      : undefined;
  const hasDeliveryRadius = Object.prototype.hasOwnProperty.call(body, 'deliveryRadiusKm');
  const deliveryRadiusKm = !hasDeliveryRadius
    ? undefined
    : body.deliveryRadiusKm === null || body.deliveryRadiusKm === ''
      ? null
      : parseCoordinate(body.deliveryRadiusKm);
  if (
    latitude === undefined || longitude === undefined
    || ((latitude === null) !== (longitude === null))
    || (latitude !== null && (latitude < -90 || latitude > 90))
    || (longitude !== null && (longitude < -180 || longitude > 180))
    || (hasLocationDescription && (
      dispatchLocationDescription === undefined
      || (dispatchLocationDescription !== null && dispatchLocationDescription.length > 300)
    ))
    || (hasDeliveryRadius && (
      deliveryRadiusKm === undefined
      || (deliveryRadiusKm !== null && (deliveryRadiusKm < 0 || deliveryRadiusKm > 500))
    ))
  ) {
    return NextResponse.json({
      error: 'Enter both valid coordinates or clear both fields. Latitude must be -90 to 90, longitude -180 to 180, and delivery radius 0 to 500 km.'
    }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Merchant operations database access is not configured.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = hasDeliveryRadius
    ? await database.rpc('update_merchant_dispatch_settings', {
      p_application_id: id,
      p_latitude: latitude,
      p_longitude: longitude,
      p_delivery_radius_km: deliveryRadiusKm,
      p_location_description: hasLocationDescription ? dispatchLocationDescription : null,
      p_actor: session.email || session.role
    })
    : await database.rpc('update_merchant_dispatch_location', {
      p_application_id: id,
      p_latitude: latitude,
      p_longitude: longitude,
      p_actor: session.email || session.role
    });
  if (error) {
    console.error('[MerchantStore] Could not update dispatch coordinates:', error);
    return NextResponse.json({
      error: /update_merchant_dispatch_(settings|location)|schema cache/i.test(error.message)
        ? hasDeliveryRadius
          ? 'Dispatch setup is not installed yet. Run supabase/DISPATCH_FULFILLMENT_RECOVERY_MIGRATION.sql.'
          : 'Dispatch migration is missing. Run supabase/DISPATCH_MIGRATION.sql.'
        : 'Business coordinates could not be saved.'
    }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    latitude,
    longitude,
    ...(hasLocationDescription ? { dispatchLocationDescription } : {}),
    ...(hasDeliveryRadius ? { deliveryRadiusKm } : {})
  });
}
