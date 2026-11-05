import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { getMerchantMinutesUntilClose, isMerchantOpenAt } from '@/lib/merchantAvailability';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { routingEngine, type GeoPoint } from '@/lib/engines/routingEngine';
import { alertAllocatedMerchants } from '@/lib/merchantOrderAlerts.server';
import { alertAssignedRider } from '@/lib/riderOrderAlerts.server';

export const dynamic = 'force-dynamic';

type Order = {
  id: number;
  status: string | null;
  payment_method: string | null;
  payment_verified_at: string | null;
  customer_name: string;
  customer_email: string | null;
  total_price: number | string;
  checkout_request_id: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  note: string | null;
  created_at: string;
  rider_name: string | null;
  rider_phone: string | null;
};

type OrderItem = {
  id: number;
  order_id: number;
  product_id: number | null;
  quantity: number | null;
  unit_price: number | string | null;
  product?: { id: number; name: string; price: number | string } | null;
};

type Rider = {
  id: number;
  rider_name: string;
  rider_phone: string;
  status: string | null;
  verification_status: string | null;
  area_zone: string | null;
  current_location: string | null;
  last_known_lat: number | string | null;
  last_known_lng: number | string | null;
  max_deliveries: number | null;
  health_score: number | null;
  location_updated_at: string | null;
  updated_at: string | null;
};

type MerchantTrace = {
  order_item_id: number;
  batch_id: string;
  quantity: number;
  batch?: {
    product_id?: number;
    expiry_at?: string | null;
    holds?: Array<{ id: number; released_at: string | null }>;
    application?: {
      id?: string;
      business_name?: string;
      status?: string;
      accepting_orders?: boolean;
      operating_hours?: Record<string, unknown>;
      delivery_radius_km?: number | string | null;
      latitude?: number | string | null;
      longitude?: number | string | null;
    } | null;
  } | null;
};

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

async function getAdminSession() {
  const store = await cookies();
  const session = await verifySessionCookie(store.get('admin_session')?.value);
  if (!session || (!['owner', 'admin'].includes(session.role) && session.permissions?.can_manage_orders !== true)) {
    return null;
  }
  return session;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCoordinates(lat: number | null, lng: number | null) {
  return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function assessVendors(
  database: SupabaseClient,
  order: Order,
  items: OrderItem[],
  events: Array<{ application_id: string; event_type: string }>,
  eventsAvailable: boolean
) {
  const reasons: string[] = [];
  const selectedVendorIds = new Set<string>();
  const selectedVendorNames = new Map<string, string>();
  const selectedVendors = new Map<string, {
    vendorId: string;
    vendorName: string;
    distanceKm: number | null;
    isOpen: boolean;
    acceptingOrders: boolean;
    minutesUntilClose: number | null;
    accepted: boolean;
  }>();
  const selectedVendorLocations = new Map<string, {
    vendorId: string;
    vendorName: string;
    latitude: number;
    longitude: number;
  }>();
  const productChecks: Array<{
    productId: number | null;
    productName: string;
    quantity: number;
    reservedQuantity: number;
    orderUnitPrice: number | null;
    cataloguePrice: number | null;
    priceMatchesCatalogue: boolean;
    reserved: boolean;
  }> = [];
  const orderLat = numberOrNull(order.latitude);
  const orderLng = numberOrNull(order.longitude);
  const itemIds = items.map(item => item.id);
  let traces: MerchantTrace[] = [];

  if (items.length === 0) reasons.push('Order has no saved product lines.');
  if (!validCoordinates(orderLat, orderLng)) {
    reasons.push('Customer delivery coordinates are missing, so vendor distance cannot be verified.');
  }

  if (itemIds.length > 0) {
    const { data, error } = await database
      .from('merchant_order_item_trace')
      .select('order_item_id, quantity, batch:merchant_product_batches(product_id, expiry_at, holds:merchant_batch_holds(id, released_at), application:merchant_applications(id, business_name, status, accepting_orders, operating_hours, delivery_radius_km, latitude, longitude))')
      .in('order_item_id', itemIds);

    if (error) {
      reasons.push('Merchant batch trace data is unavailable. Apply MERCHANT_OPERATIONS_MIGRATION.sql and DISPATCH_MIGRATION.sql.');
    } else {
      traces = (data || []) as unknown as MerchantTrace[];
    }
  }
  const { data: returnedMovements, error: returnedMovementsError } = itemIds.length
    ? await database
      .from('merchant_inventory_movements')
      .select('order_item_id, batch_id, quantity_delta')
      .eq('movement_type', 'returned')
      .eq('note', 'Returned for offline merchant redistribution')
      .in('order_item_id', itemIds)
    : { data: [], error: null };
  if (returnedMovementsError) {
    reasons.push('Merchant inventory return records are unavailable; allocation totals cannot be verified.');
    traces = [];
  }
  if (!eventsAvailable && items.length > 0) {
    reasons.push('Merchant fulfillment acceptance records are unavailable; apply MERCHANT_OPERATIONS_MIGRATION.sql.');
  }

  for (const item of items) {
    const quantity = Number(item.quantity || 0);
    const unitPrice = numberOrNull(item.unit_price);
    if (!item.product_id || quantity < 1) {
      reasons.push(`Order line ${item.id} has no valid product or quantity.`);
      productChecks.push({
        productId: item.product_id,
        productName: item.product?.name || 'Unknown product',
        quantity,
        reservedQuantity: 0,
        orderUnitPrice: unitPrice,
        cataloguePrice: numberOrNull(item.product?.price),
        priceMatchesCatalogue: false,
        reserved: false
      });
      continue;
    }
    const cataloguePrice = numberOrNull(item.product?.price);
    const priceMatchesCatalogue = unitPrice !== null && unitPrice >= 0
      && cataloguePrice !== null
      && Math.abs(unitPrice - cataloguePrice) <= 0.01;
    if (unitPrice === null || unitPrice < 0) {
      reasons.push(`Order line ${item.id} has no valid saved customer price.`);
    }

    const itemTraces = traces.filter(trace => Number(trace.order_item_id) === item.id);
    let allocatedQuantity = 0;
    for (const trace of itemTraces) {
      const returnedQuantity = (returnedMovements || [])
        .filter(movement => movement.batch_id === trace.batch_id
          && Number(movement.order_item_id) === Number(trace.order_item_id))
        .reduce((total, movement) => total + Number(movement.quantity_delta || 0), 0);
      const activeQuantity = Math.max(0, Number(trace.quantity || 0) - returnedQuantity);
      if (activeQuantity <= 0) continue;
      const batch = trace.batch;
      const merchant = batch?.application;
      if (!batch || Number(batch.product_id) !== item.product_id || !merchant || merchant.status !== 'approved') continue;
      if (batch.expiry_at && batch.expiry_at < new Date().toISOString().slice(0, 10)) continue;
      if (batch.holds?.some(hold => hold.released_at === null)) continue;
      const merchantAccepted = events.some(event =>
        event.application_id === merchant.id && event.event_type === 'accepted'
      );
      const merchantRejected = events.some(event =>
        event.application_id === merchant.id && event.event_type === 'rejected'
      );
      const isOnline = merchant.accepting_orders !== false && isMerchantOpenAt(merchant.operating_hours);
      if ((!isOnline || merchantRejected) && !merchantAccepted) continue;
      allocatedQuantity += activeQuantity;

      if (merchant.id) {
        selectedVendorIds.add(merchant.id);
        selectedVendorNames.set(merchant.id, merchant.business_name || 'Approved merchant');
        const isOpen = isMerchantOpenAt(merchant.operating_hours);
        const merchantDistance = validCoordinates(orderLat, orderLng)
          && validCoordinates(numberOrNull(merchant.latitude), numberOrNull(merchant.longitude))
          ? distanceKm(
            orderLat!,
            orderLng!,
            numberOrNull(merchant.latitude)!,
            numberOrNull(merchant.longitude)!
          )
          : null;
        selectedVendors.set(merchant.id, {
          vendorId: merchant.id,
          vendorName: merchant.business_name || 'Approved merchant',
          distanceKm: merchantDistance === null ? null : Number(merchantDistance.toFixed(2)),
          isOpen,
          acceptingOrders: merchant.accepting_orders !== false,
          minutesUntilClose: isOpen ? getMerchantMinutesUntilClose(merchant.operating_hours) : null,
          accepted: merchantAccepted
        });
      }
      const vendorLat = numberOrNull(merchant.latitude);
      const vendorLng = numberOrNull(merchant.longitude);
      if (merchant.id && vendorLat !== null && vendorLng !== null && validCoordinates(vendorLat, vendorLng)) {
        selectedVendorLocations.set(merchant.id, {
          vendorId: merchant.id,
          vendorName: merchant.business_name || 'Approved merchant',
          latitude: vendorLat,
          longitude: vendorLng
        });
      }
      const radiusKm = numberOrNull(merchant.delivery_radius_km);
      if (!validCoordinates(orderLat, orderLng) || !validCoordinates(vendorLat, vendorLng)) {
        reasons.push(`${merchant.business_name || 'A selected merchant'} has no saved coordinates; vendor distance is unavailable.`);
      } else if (radiusKm === null) {
        reasons.push(`${merchant.business_name || 'A selected merchant'} has no delivery radius, so distance eligibility cannot be verified.`);
      } else {
        const distance = distanceKm(orderLat!, orderLng!, vendorLat!, vendorLng!);
        if (distance > radiusKm) {
          reasons.push(`${merchant.business_name || 'A selected merchant'} is ${distance.toFixed(1)} km away, beyond its ${radiusKm} km delivery radius.`);
        }
      }
      if (merchant.id && !merchantAccepted) {
        if (merchantRejected) {
          reasons.push(`${merchant.business_name || 'A selected merchant'} declined this order; retry allocation to an available merchant before dispatch.`);
        } else if (!isOnline) {
          reasons.push(`${merchant.business_name || 'A selected merchant'} is offline or outside its operating hours; this order needs allocation to an available merchant before dispatch.`);
        } else {
          reasons.push(`${merchant.business_name || 'A selected merchant'} has not accepted this order.`);
        }
      }
    }
    if (allocatedQuantity < quantity) {
      reasons.push(`Product ${item.product_id} has ${allocatedQuantity}/${quantity} units reserved with an approved merchant.`);
    }
    productChecks.push({
      productId: item.product_id,
      productName: item.product?.name || `Product ${item.product_id}`,
      quantity,
      reservedQuantity: allocatedQuantity,
      orderUnitPrice: unitPrice,
      cataloguePrice,
      priceMatchesCatalogue,
      reserved: allocatedQuantity >= quantity
    });
  }

  return {
    ready: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    selectedVendorIds: Array.from(selectedVendorIds),
    selectedVendorNames: Array.from(selectedVendorNames.values()),
    selectedVendors: Array.from(selectedVendors.values()),
    selectedVendorLocations: Array.from(selectedVendorLocations.values()),
    productChecks,
    priceBasis: 'Saved checkout price is shown beside the current catalogue price for reference; discounts or later price changes may explain differences. Merchant-specific pricing is not stored.'
  };
}

function eligibleRiders(riders: Rider[], loads: Map<string, number>) {
  const now = Date.now();
  return riders.filter(rider =>
    rider.verification_status === 'Verified'
    && ['Idle', 'Delivering'].includes(rider.status || '')
    && Boolean(rider.updated_at
      && now >= new Date(rider.updated_at).getTime()
      && now - new Date(rider.updated_at).getTime() <= 15 * 60 * 1000)
    && (loads.get(rider.rider_phone) || 0) < Math.max(1, Number(rider.max_deliveries || 3))
  );
}

function coordinateKey(point: GeoPoint) {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

type RoadLookup = Map<string, Map<string, { distanceMeters: number; durationSeconds: number }>>;

async function buildRoadDistanceLookup(
  riders: Rider[],
  loads: Map<string, number>,
  vendorLocations: Array<{ latitude: number; longitude: number }>
): Promise<{ lookup: RoadLookup; error: string | null }> {
  const lookup: RoadLookup = new Map();
  const now = Date.now();
  const locatedRiders = eligibleRiders(riders, loads).flatMap(rider => {
    const latitude = numberOrNull(rider.last_known_lat);
    const longitude = numberOrNull(rider.last_known_lng);
    const locationTime = rider.location_updated_at ? new Date(rider.location_updated_at).getTime() : 0;
    if (!validCoordinates(latitude, longitude) || locationTime <= 0 || now < locationTime || now - locationTime > 5 * 60 * 1000) return [];
    return [{
      rider,
      point: { latitude: latitude!, longitude: longitude! },
      activeLoad: loads.get(rider.rider_phone) || 0,
      healthScore: Number(rider.health_score || 0)
    }];
  }).sort((a, b) =>
    (a.activeLoad - b.activeLoad) || (b.healthScore - a.healthScore)
  ).slice(0, 50);

  const uniqueLocations = Array.from(new Map(vendorLocations
    .filter(location => validCoordinates(location.latitude, location.longitude))
    .map(location => [coordinateKey(location), location] as const)).values());
  if (locatedRiders.length === 0 || uniqueLocations.length === 0) return { lookup, error: null };
  if (!routingEngine.hasOsrmProvider()) {
    return { lookup, error: 'OSRM_BASE_URL is not configured on the server.' };
  }

  try {
    for (let offset = 0; offset < uniqueLocations.length; offset += 50) {
      const locations = uniqueLocations.slice(offset, offset + 50);
      const matrix = await routingEngine.computeRoadDistanceMatrix(
        locatedRiders.map(candidate => candidate.point),
        locations
      );
      locations.forEach((location, destinationIndex) => {
        const ridersAtLocation = new Map<string, { distanceMeters: number; durationSeconds: number }>();
        locatedRiders.forEach((candidate, sourceIndex) => {
          const distanceMeters = matrix.distancesMeters[sourceIndex]?.[destinationIndex];
          const durationSeconds = matrix.durationsSeconds[sourceIndex]?.[destinationIndex];
          if (distanceMeters !== null && distanceMeters !== undefined
            && durationSeconds !== null && durationSeconds !== undefined) {
            ridersAtLocation.set(candidate.rider.rider_phone, { distanceMeters, durationSeconds });
          }
        });
        lookup.set(coordinateKey(location), ridersAtLocation);
      });
    }
    return { lookup, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OSRM road routing is unavailable.';
    console.error('[AdminDispatch] OSRM road-distance ranking failed:', message);
    return { lookup: new Map(), error: message };
  }
}

function recommendRiders(
  riders: Rider[],
  loads: Map<string, number>,
  vendorLocations: Array<{ latitude: number; longitude: number }>,
  roadLookup: RoadLookup,
  routingError: string | null,
  priorityRiderPhones: Set<string>
) {
  const validVendorLocations = vendorLocations.filter(location =>
    validCoordinates(location.latitude, location.longitude)
  );
  const candidates = eligibleRiders(riders, loads).map(rider => {
    let route: { distanceMeters: number; durationSeconds: number } | undefined;
    for (const location of validVendorLocations) {
      const candidateRoute = roadLookup.get(coordinateKey(location))?.get(rider.rider_phone);
      if (candidateRoute && (!route || candidateRoute.distanceMeters < route.distanceMeters)) route = candidateRoute;
    }
    const activeLoad = loads.get(rider.rider_phone) || 0;
    const maxDeliveries = Math.max(1, Number(rider.max_deliveries || 3));
    const healthScore = Number(rider.health_score || 0);
    const distance = route?.distanceMeters ?? null;
    const suitabilityScore = (distance === null ? 100_000 : distance / 1000)
      + (activeLoad / maxDeliveries) * 8
      - Math.min(100, Math.max(0, healthScore)) * 0.02;
    return {
      riderPhone: rider.rider_phone,
      riderName: rider.rider_name,
      status: rider.status,
      activeLoad,
      maxDeliveries,
      distanceKm: distance === null ? null : Number((distance / 1000).toFixed(2)),
      etaMinutes: route ? Math.ceil(route.durationSeconds / 60) : null,
      locationAvailable: distance !== null,
      healthScore,
      priorityMerchantConnection: priorityRiderPhones.has(rider.rider_phone),
      suitabilityScore
    };
  }).sort((a, b) => {
    if (a.priorityMerchantConnection !== b.priorityMerchantConnection) {
      return a.priorityMerchantConnection ? -1 : 1;
    }
    if (a.locationAvailable !== b.locationAvailable) return a.locationAvailable ? -1 : 1;
    return a.suitabilityScore - b.suitabilityScore;
  });

  return {
    candidates,
    recommended: candidates.find(candidate => candidate.locationAvailable) || null,
    priorityRiderAvailable: candidates.some(candidate =>
      candidate.priorityMerchantConnection && candidate.locationAvailable
    ),
    reason: validVendorLocations.length === 0
      ? 'Selected merchant pickup coordinates are missing; rider-to-pickup distance cannot be ranked.'
      : candidates.length === 0
        ? 'No verified rider has a recent online heartbeat, an idle/delivering status, and available capacity.'
        : routingError
            ? 'OSRM road-route calculation is unavailable. Check the OSRM_BASE_URL service configuration.'
          : !candidates.some(candidate => candidate.locationAvailable)
            ? 'Eligible riders need a fresh GPS position and a routable road path to the pickup.'
        : null
  };
}

async function loadDispatchData(database: SupabaseClient) {
  const [ordersResult, ridersResult, loadResult, decisionResult, directoryRidersResult, zonesResult] = await Promise.all([
    database.from('orders')
      .select('id, status, payment_method, payment_verified_at, checkout_request_id, customer_name, customer_email, total_price, latitude, longitude, note, created_at, rider_name, rider_phone')
      .eq('status', 'Paid')
      .not('payment_verified_at', 'is', null)
      .in('payment_method', ['Paystack', 'PayHero'])
      .order('payment_verified_at', { ascending: true })
      .limit(100),
    database.from('rider_status')
      .select('id, rider_name, rider_phone, status, verification_status, area_zone, current_location, last_known_lat, last_known_lng, max_deliveries, health_score, location_updated_at, updated_at'),
    database.from('orders')
      .select('rider_phone')
      .in('status', ['Dispatched', 'Out for Delivery'])
      .not('rider_phone', 'is', null),
    database.from('dispatch_decisions')
      .select('id, order_id, selected_rider_name, selected_rider_phone, selected_vendor_ids, decision_type, criteria, chosen_by, override_reason, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    database.from('rider_status').select(`
      id, rider_name, rider_phone, vehicle_type, vehicle_reg, id_number, license_number,
      plate_number, rider_photo_url, vehicle_photo_url, verification_status, current_location,
      status, battery_level, total_deliveries, rating, area_zone, max_deliveries, weekly_salary,
      health_score, runner_xp, runner_level, acceptance_rate, can_accept_orders, can_reject_orders,
      can_view_earnings, last_known_lat, last_known_lng, location_updated_at, updated_at,
      wallet:rider_wallets(balance, total_earned)
    `).order('rider_name', { ascending: true }),
    database.rpc('get_order_delivery_demand_zones')
  ]);

  for (const result of [ordersResult, ridersResult, loadResult, decisionResult, directoryRidersResult]) {
    if (result.error) throw result.error;
  }

  const paidOrders = ((ordersResult.data || []) as Order[])
    .filter(order =>
      order.status?.toLowerCase() === 'paid'
      && Boolean(order.payment_verified_at)
      && ['paystack', 'payhero'].includes((order.payment_method || '').toLowerCase())
      && !order.rider_phone
    );
  const { data: confirmations, error: confirmationError } = paidOrders.length
    ? await database.from('payment_confirmations')
      .select('order_id, provider, reference, amount_kobo, currency')
      .in('order_id', paidOrders.map(order => order.id))
    : { data: [], error: null };
  if (confirmationError) throw confirmationError;
  const confirmedOrderIds = new Set((confirmations || [])
    .filter(confirmation => {
      const order = paidOrders.find(candidate => candidate.id === Number(confirmation.order_id));
      return Boolean(order)
        && confirmation.provider === (order?.payment_method === 'PayHero' ? 'PayHero' : 'Paystack')
        && confirmation.reference === order?.checkout_request_id
        && Number(confirmation.amount_kobo) === Math.round(Number(order?.total_price) * 100)
        && confirmation.currency === 'KES';
    })
    .map(confirmation => Number(confirmation.order_id)));
  const orders = paidOrders.filter(order => confirmedOrderIds.has(order.id));
  const riders = (ridersResult.data || []) as Rider[];
  const loads = new Map<string, number>();
  for (const row of loadResult.data || []) {
    if (row.rider_phone) loads.set(row.rider_phone, (loads.get(row.rider_phone) || 0) + 1);
  }
  const demandZones = (zonesResult.data || []) as Array<{
    latitude: number | string | null;
    longitude: number | string | null;
    order_count: number | string | null;
  }>;

  const orderIds = orders.map(order => order.id);
  const { data: itemData, error: itemError } = orderIds.length
    ? await database.from('order_items')
      .select('id, order_id, product_id, quantity, unit_price, product:products(id, name, price)')
      .in('order_id', orderIds)
    : { data: [], error: null };
  if (itemError) throw itemError;
  const { data: eventData, error: eventError } = orderIds.length
    ? await database.from('merchant_fulfillment_events')
      .select('order_id, application_id, event_type')
      .in('order_id', orderIds)
    : { data: [], error: null };

  const itemsByOrder = new Map<number, OrderItem[]>();
  for (const item of (itemData || []) as OrderItem[]) {
    const lines = itemsByOrder.get(item.order_id) || [];
    lines.push(item);
    itemsByOrder.set(item.order_id, lines);
  }

  const preparedJobs = await Promise.all(orders.map(async order => {
    const items = itemsByOrder.get(order.id) || [];
    const orderEvents = (eventData || [])
      .filter(event => Number(event.order_id) === order.id)
      .map(event => ({ application_id: event.application_id, event_type: event.event_type }));
    const fulfillment = await assessVendors(database, order, items, orderEvents, !eventError);
    return {
      ...order,
      items,
      fulfillment
    };
  }));
  const allVendorLocations = preparedJobs.flatMap(job => job.fulfillment.selectedVendorLocations);
  const selectedVendorIds = [...new Set(preparedJobs.flatMap(job => job.fulfillment.selectedVendorIds))];
  const { data: riderConnections, error: riderConnectionsError } = selectedVendorIds.length
    ? await database.from('merchant_rider_invites')
      .select('application_id,rider_phone')
      .in('application_id', selectedVendorIds)
      .eq('status', 'accepted')
    : { data: [], error: null };
  const priorityConnectionsReady = !riderConnectionsError;
  if (riderConnectionsError
    && !['42P01', 'PGRST205'].includes(riderConnectionsError.code || '')
    && !/merchant_rider_invites/i.test(riderConnectionsError.message || '')) {
    throw riderConnectionsError;
  }
  const priorityRidersByVendor = new Map<string, Set<string>>();
  for (const connection of riderConnections || []) {
    const ridersForVendor = priorityRidersByVendor.get(connection.application_id) || new Set<string>();
    ridersForVendor.add(connection.rider_phone);
    priorityRidersByVendor.set(connection.application_id, ridersForVendor);
  }
  const roadDistances = await buildRoadDistanceLookup(riders, loads, allVendorLocations);
  const jobs = preparedJobs.map(job => {
    const priorityRiderPhones = new Set(job.fulfillment.selectedVendorIds.flatMap(vendorId =>
      [...(priorityRidersByVendor.get(vendorId) || [])]
    ));
    const riderRecommendation = recommendRiders(
      riders,
      loads,
      job.fulfillment.selectedVendorLocations,
      roadDistances.lookup,
      roadDistances.error,
      priorityRiderPhones
    );
    return {
      ...job,
      riderCandidates: riderRecommendation.candidates,
      recommendedRider: riderRecommendation.recommended,
      riderAvailabilityReason: riderRecommendation.reason,
      priorityRiderAvailable: riderRecommendation.priorityRiderAvailable,
      merchantRiderPriorityReady: priorityConnectionsReady
    };
  });

  return {
    jobs,
    decisions: decisionResult.data || [],
    unverifiedPaymentCount: paidOrders.length - confirmedOrderIds.size,
    riders: (directoryRidersResult.data || []).map(rider => ({
      ...rider,
      wallet: Array.isArray(rider.wallet) ? rider.wallet[0] || null : rider.wallet || null,
      lat: rider.last_known_lat === null || rider.last_known_lat === undefined ? null : Number(rider.last_known_lat),
      lng: rider.last_known_lng === null || rider.last_known_lng === undefined ? null : Number(rider.last_known_lng)
    })),
    demandZones: zonesResult.error ? [] : demandZones.flatMap(zone => {
      const latitude = Number(zone.latitude);
      const longitude = Number(zone.longitude);
      const intensity = Number(zone.order_count);
      return Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(intensity)
        ? [{ lat: latitude, lng: longitude, intensity }]
        : [];
    }),
    demandZonesError: zonesResult.error ? 'Demand heatmap is unavailable; add or verify customer delivery coordinates.' : null
  };
}

export async function GET() {
  if (!await getAdminSession()) {
    return NextResponse.json({ error: 'Dispatch access requires an authorized admin session.' }, { status: 403 });
  }
  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Dispatch database access is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });
  }

  try {
    return NextResponse.json(await loadDispatchData(database), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    const migrationMissing = /dispatch_decisions|payment_confirmations|rider_status|last_known_lat|merchant_order_item_trace|merchant_applications|merchant_product_batches|merchant_fulfillment_events|schema cache|does not exist/i.test(message);
    console.error('[AdminDispatch] Could not load dispatch data:', message);
    return NextResponse.json({
      error: migrationMissing
        ? 'Dispatch prerequisites are missing. Run supabase/DISPATCH_MIGRATION.sql and, for vendor checks, supabase/MERCHANT_OPERATIONS_MIGRATION.sql.'
        : 'Dispatch data could not be loaded. Check the Supabase connection and migration status.'
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Dispatch mutations must come from this site.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Dispatch access requires an authorized admin session.' }, { status: 403 });
  }
  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Dispatch database access is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });
  }

  let body: { orderId?: unknown; mode?: unknown; riderPhone?: unknown; reason?: unknown; operation?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid dispatch request is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  if (body.operation === 'retry_merchant_allocation') {
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: 'A valid paid order is required.' }, { status: 400 });
    }
    const { data, error } = await database.rpc('retry_paid_order_merchant_allocation', {
      p_order_id: orderId,
      p_actor: session.email || session.role
    });
    if (error) {
      console.error('[AdminDispatch] Merchant allocation retry failed:', error);
      return NextResponse.json({
        error: /retry_paid_order_merchant_allocation|schema cache/i.test(error.message)
          ? 'Merchant allocation retry is not installed. Apply the latest merchant operations and dispatch migrations.'
          : 'Merchant allocation could not be retried.'
      }, { status: 503 });
    }
    const result = data as {
      success?: boolean;
      error?: string;
      code?: string;
      fully_allocated?: boolean;
      unallocated_items?: Array<{ product_name: string; requested_quantity: number; allocated_quantity: number }>;
    } | null;
    if (!result?.success) {
      return NextResponse.json({ error: result?.error || 'The paid order could not be reallocated.', code: result?.code }, { status: 409 });
    }
    try {
      const alerts = await alertAllocatedMerchants(database, orderId);
      if (alerts.applications > 0 && !alerts.escalationQueued) {
        return NextResponse.json({ error: 'Merchant allocation succeeded, but the alert ladder could not be scheduled.', allocation: result }, { status: 503 });
      }
    } catch (alertError) {
      console.error('[AdminDispatch] Merchant allocation succeeded but alerts could not be scheduled:', alertError);
      return NextResponse.json({ error: 'Merchant allocation succeeded, but the alert ladder could not be scheduled.', allocation: result }, { status: 503 });
    }
    return NextResponse.json({
      allocation: result,
      message: result.fully_allocated
        ? 'Merchant stock was redistributed to currently available approved businesses.'
        : 'Available businesses were checked, but some stock is still unavailable. The paid order remains in the dispatch review queue.'
    });
  }

  const mode = body.mode;
  const riderPhone = typeof body.riderPhone === 'string' ? body.riderPhone.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !['automatic', 'override'].includes(String(mode))) {
    return NextResponse.json({ error: 'A valid order and dispatch mode are required.' }, { status: 400 });
  }
  if (mode === 'override' && (!riderPhone || reason.length < 8 || reason.length > 500)) {
    return NextResponse.json({ error: 'Choose a rider and enter an override reason (8–500 characters).' }, { status: 400 });
  }

  try {
    const dispatchData = await loadDispatchData(database);
    const job = dispatchData.jobs.find(candidate => candidate.id === orderId);
    if (!job) {
      return NextResponse.json({ error: 'The order is no longer eligible for dispatch. Refresh the dispatch board.' }, { status: 409 });
    }
    if (!job.fulfillment.ready) {
      return NextResponse.json({
        error: 'Rider assignment is blocked because vendor fulfillment is not verified. A rider override cannot bypass missing stock, merchant acceptance, or delivery checks.',
        fulfillment: job.fulfillment
      }, { status: 409 });
    }
    const selectedRider = mode === 'automatic'
      ? job.recommendedRider
      : job.riderCandidates.find(candidate => candidate.riderPhone === riderPhone);
    if (!selectedRider) {
      return NextResponse.json({
        error: mode === 'automatic'
          ? job.riderAvailabilityReason || 'No eligible rider is available.'
          : 'The chosen rider is not verified, online, or below the active delivery limit.'
      }, { status: 409 });
    }

    const criteria = {
      vendor_ready: job.fulfillment.ready,
      vendor_reasons: job.fulfillment.reasons,
      selected_vendor_ids: job.fulfillment.selectedVendorIds,
      selected_vendor_names: job.fulfillment.selectedVendorNames,
      product_checks: job.fulfillment.productChecks,
      rider_selection: selectedRider,
      rider_availability_reason: job.riderAvailabilityReason,
      payment_method: job.payment_method,
      payment_verified_at: job.payment_verified_at
    };
    const { data, error } = await database.rpc('assign_paid_order_rider', {
      p_order_id: orderId,
      p_rider_phone: selectedRider.riderPhone,
      p_actor: session.email || session.role,
      p_is_override: mode === 'override',
      p_override_reason: mode === 'override' ? reason : null,
      p_criteria: criteria
    });
    if (error) {
      console.error('[AdminDispatch] Atomic assignment failed:', error);
      return NextResponse.json({
        error: /assign_paid_order_rider|schema cache/i.test(error.message)
          ? 'Dispatch database migration is missing. Run supabase/DISPATCH_MIGRATION.sql.'
          : 'Assignment could not be saved. Refresh and review rider availability.'
      }, { status: 503 });
    }
    const result = data as { success?: boolean; error?: string; code?: string; [key: string]: unknown } | null;
    if (!result?.success) {
      return NextResponse.json({
        error: result?.error || 'Assignment was not completed.',
        code: result?.code || 'ASSIGNMENT_FAILED'
      }, { status: result?.code === 'PAYMENT_NOT_CONFIRMED' ? 409 : 409 });
    }

    let notificationWarning: string | undefined;
    if (typeof result.rider_phone === 'string') {
      try {
        const notification = await alertAssignedRider(database, orderId, result.rider_phone);
        notificationWarning = notification.warning || undefined;
      } catch (notificationError) {
        console.error('[AdminDispatch] Rider assignment saved but rider alerts failed:', notificationError);
        notificationWarning = 'Assignment was saved, but rider alerts could not be scheduled.';
      }
    }

    return NextResponse.json({
      assignment: result,
      ...(notificationWarning ? { warning: notificationWarning } : {})
    });
  } catch (error) {
    console.error('[AdminDispatch] Assignment request failed:', error);
    return NextResponse.json({ error: 'Assignment could not be completed. Refresh the dispatch board and try again.' }, { status: 503 });
  }
}
