import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const deliveryStatuses = ['Paid', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered', 'Cancelled'];

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Delivery operations access is required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Delivery data access is not configured on the server.' }, { status: 503 });
  }

  const [ordersResult, ridersResult, waitingCount, transitCount, deliveredCount] = await Promise.all([
    database.from('orders')
      .select('id,created_at,customer_name,customer_phone,customer_email,status,total_price,delivery_cost,delivery_address,delivery_area,delivery_building,delivery_landmark,delivery_instructions,delivery_eta_minutes,latitude,longitude,rider_name,rider_phone')
      .in('status', deliveryStatuses)
      .order('created_at', { ascending: false })
      .limit(150),
    database.from('rider_status')
      .select('id,rider_name,rider_phone,vehicle_type,vehicle_reg,status,verification_status,battery_level,last_known_lat,last_known_lng,location_updated_at,updated_at,max_deliveries')
      .order('rider_name', { ascending: true })
      .limit(250),
    database.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Paid')
      .is('rider_phone', null),
    database.from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['Dispatched', 'Picked Up', 'Out for Delivery']),
    database.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Delivered')
  ]);

  const requiredError = ordersResult.error || ridersResult.error
    || waitingCount.error || transitCount.error || deliveredCount.error;
  if (requiredError) {
    console.error('[AdminDelivery] Could not load delivery operations:', requiredError);
    const missingDeliveryFields = /delivery_address|delivery_area|delivery_building|delivery_landmark|delivery_instructions|delivery_eta_minutes|last_known_lat|location_updated_at|rider_status/i.test(requiredError.message);
    return NextResponse.json({
      error: missingDeliveryFields
        ? 'Delivery schema is incomplete. Apply DISPATCH_MIGRATION.sql and DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql, then refresh.'
        : 'Delivery operations could not be loaded. Check the database connection and migration status.'
    }, { status: 503 });
  }

  const now = Date.now();
  const riders = (ridersResult.data || []).map(rider => {
    const heartbeatAt = rider.updated_at ? new Date(rider.updated_at).getTime() : 0;
    const locationAt = rider.location_updated_at ? new Date(rider.location_updated_at).getTime() : 0;
    const online = rider.verification_status === 'Verified'
      && ['Idle', 'Delivering'].includes(rider.status || '')
      && heartbeatAt > 0 && now >= heartbeatAt && now - heartbeatAt <= 15 * 60 * 1000;
    const locationFresh = online && locationAt > 0 && now >= locationAt && now - locationAt <= 5 * 60 * 1000;
    const latitude = locationFresh ? Number(rider.last_known_lat) : null;
    const longitude = locationFresh ? Number(rider.last_known_lng) : null;
    const validLocation = latitude !== null && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && longitude !== null && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

    return {
      ...rider,
      online,
      locationFresh: Boolean(validLocation),
      lat: validLocation ? latitude : null,
      lng: validLocation ? longitude : null,
      location_updated_at: locationFresh ? rider.location_updated_at : null
    };
  });

  const activitySince = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error: eventsError } = await database
    .from('delivery_events')
    .select('id,order_id,from_status,to_status,actor_type,actor_id,created_at')
    .gte('created_at', activitySince)
    .order('created_at', { ascending: false })
    .limit(40);

  if (eventsError) console.error('[AdminDelivery] Delivery event history is unavailable:', eventsError);

  const orders = ordersResult.data || [];
  const fleetOnline = riders.filter(rider => rider.online).length;
  const locationsFresh = riders.filter(rider => rider.locationFresh).length;

  return NextResponse.json({
    orders,
    riders,
    activity: eventsError ? [] : events || [],
    activityWarning: eventsError
      ? 'Delivery event history is unavailable. Apply DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql to enable the audit timeline.'
      : null,
    metrics: {
      waitingDispatch: waitingCount.count || 0,
      inTransit: transitCount.count || 0,
      verifiedOnlineRiders: fleetOnline,
      freshRiderLocations: locationsFresh,
      completedDeliveries: deliveredCount.count || 0
    },
    updatedAt: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
