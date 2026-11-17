import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

function getNairobiWeekStart(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month) - 1;
  const day = Number(values.day);
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  const monday = day - ((weekday + 6) % 7);
  return new Date(Date.UTC(year, month, monday, 3)).toISOString();
}

function getVerificationStoragePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (raw.startsWith('riders/')) return raw;
  try {
    const pathname = new URL(raw).pathname;
    const match = pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/rider-verifications\/(.+)$/);
    if (!match) return null;
    const path = decodeURIComponent(match[1]);
    return path.startsWith('riders/') ? path : null;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider profile access is required.' }, { status: 403 });
  }

  const { id } = await params;
  const riderId = Number(id);
  if (!Number.isSafeInteger(riderId) || riderId <= 0) {
    return NextResponse.json({ error: 'A valid rider ID is required.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider database access is not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('id,rider_name,rider_phone,vehicle_type,vehicle_reg,plate_number,status,verification_status,battery_level,battery_updated_at,area_zone,created_at,updated_at,last_known_lat,last_known_lng,location_updated_at')
    .eq('id', riderId)
    .maybeSingle();

  if (riderError) {
    console.error('[AdminRiderProfile] Could not load rider:', riderError);
    const telemetrySchemaMissing = /battery_updated_at/i.test(riderError.message);
    const onboardingSchemaMissing = /plate_number|rider_status|schema cache/i.test(riderError.message);
    return NextResponse.json({
      error: telemetrySchemaMissing
        ? 'Battery telemetry fields are not installed. Apply supabase/RIDER_BATTERY_TELEMETRY_MIGRATION.sql.'
        : onboardingSchemaMissing
        ? 'Rider profile fields are not installed. Apply RIDER_ONBOARDING_SECURITY_MIGRATION.sql and DISPATCH_MIGRATION.sql.'
        : 'Rider profile could not be loaded. Check the database connection.'
    }, { status: 503 });
  }
  if (!rider) return NextResponse.json({ error: 'Rider was not found.' }, { status: 404 });

  const now = new Date();
  const weekStart = getNairobiWeekStart(now);
  const [walletResult, deliveredResult, weeklyResult, recentOrdersResult, activeOrdersResult] = await Promise.all([
    database.from('rider_wallets')
      .select('balance,total_earned')
      .eq('rider_phone', rider.rider_phone)
      .maybeSingle(),
    database.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_phone', rider.rider_phone)
      .eq('status', 'Delivered'),
    database.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_phone', rider.rider_phone)
      .eq('status', 'Delivered')
      .gte('delivered_at', weekStart),
    database.from('orders')
      .select('id,status,total_price,created_at,picked_up_at,delivered_at,delivery_eta_minutes')
      .eq('rider_phone', rider.rider_phone)
      .order('created_at', { ascending: false })
      .limit(10),
    database.from('orders')
      .select('id,status,total_price,created_at,picked_up_at,delivered_at,delivery_eta_minutes')
      .eq('rider_phone', rider.rider_phone)
      .in('status', ['Dispatched', 'Picked Up', 'Out for Delivery'])
      .order('created_at', { ascending: false })
      .limit(10)
  ]);
  const dataError = walletResult.error || deliveredResult.error || weeklyResult.error || recentOrdersResult.error || activeOrdersResult.error;
  if (dataError) {
    console.error('[AdminRiderProfile] Could not load rider activity:', dataError);
    return NextResponse.json({
      error: /delivered_at|delivery_eta_minutes|schema cache/i.test(dataError.message)
        ? 'Rider delivery history needs the latest delivery migration. Apply DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql.'
        : 'Rider delivery or wallet information could not be loaded.'
    }, { status: 503 });
  }

  const { data: lastOfflineLocation, error: offlineLocationError } = await database
    .from('rider_offline_location_events')
    .select('latitude,longitude,location_recorded_at,went_offline_at')
    .eq('rider_phone', rider.rider_phone)
    .order('went_offline_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastOfflineLocationUnavailable = Boolean(offlineLocationError
    && (offlineLocationError.code === '42P01'
      || offlineLocationError.code === 'PGRST205'
      || /rider_offline_location_events|schema cache/i.test(offlineLocationError.message)));
  if (offlineLocationError && !lastOfflineLocationUnavailable) {
    console.error('[AdminRiderProfile] Could not load the last offline rider location:', offlineLocationError);
    return NextResponse.json({ error: 'The rider location security history could not be loaded.' }, { status: 503 });
  }

  const sensitiveAllowed = session.role.toLowerCase() === 'owner'
    || hasAdminPermission(session, 'can_view_sensitive_data');
  let documents: {
    id_number_last4: string | null;
    license_number: string | null;
    rider_photo_url: string | null;
    vehicle_photo_url: string | null;
  } | null = null;
  let profileDetails: Record<string, unknown> | null = null;
  let profileDetailsUnavailable = false;
  if (sensitiveAllowed) {
    const [
      { data: sensitive, error: sensitiveError },
      { data: details, error: detailsError }
    ] = await Promise.all([
      database.from('rider_status')
        .select('id_number,license_number,rider_photo_url,vehicle_photo_url')
        .eq('id', riderId)
        .maybeSingle(),
      database.from('rider_profile_details')
        .select('whatsapp_number,emergency_contact_name,emergency_contact_phone,guarantor_name,guarantor_phone,delivery_zones,max_distance_km,shift_days,shift_start_time,shift_end_time,mpesa_number,mpesa_registered_name,mpesa_name_verified_at,license_expiry_date,insurance_expiry_date,age_check_training_completed_at,rider_agreement_accepted_at,rider_agreement_version')
        .eq('rider_phone', rider.rider_phone)
        .maybeSingle()
    ]);
    if (sensitiveError) {
      console.error('[AdminRiderProfile] Could not load authorized verification details:', sensitiveError);
      return NextResponse.json({ error: 'Authorized rider verification details could not be loaded.' }, { status: 503 });
    }
    if (detailsError) {
      if (detailsError.code === '42P01' || detailsError.code === 'PGRST205'
        || /rider_profile_details|schema cache/i.test(detailsError.message)) {
        profileDetailsUnavailable = true;
      } else {
        console.error('[AdminRiderProfile] Could not load authorized rider account details:', detailsError);
        return NextResponse.json({ error: 'Authorized rider account details could not be loaded.' }, { status: 503 });
      }
    } else {
      profileDetails = details;
    }

    const photoPath = getVerificationStoragePath(sensitive?.rider_photo_url);
    const vehiclePhotoPath = getVerificationStoragePath(sensitive?.vehicle_photo_url);
    const photoPaths = [
      { key: 'rider', path: photoPath },
      { key: 'vehicle', path: vehiclePhotoPath }
    ] as const;
    const signedPhotos = await Promise.all(photoPaths.map(async ({ key, path }) => {
      if (!path) return [key, null] as const;
      const { data: signedPhoto, error: photoError } = await database.storage
        .from('rider-verifications')
        .createSignedUrl(path, 60 * 15);
      if (photoError) {
        console.error(`[AdminRiderProfile] Could not sign ${key} photo:`, photoError);
        return [key, null] as const;
      }
      return [key, signedPhoto.signedUrl] as const;
    }));
    const photoUrls = Object.fromEntries(signedPhotos);
    if ((photoPath && !photoUrls.rider) || (vehiclePhotoPath && !photoUrls.vehicle)) {
      return NextResponse.json({ error: 'A rider verification photo is temporarily unavailable.' }, { status: 503 });
    }

    const idNumber = typeof sensitive?.id_number === 'string' ? sensitive.id_number : '';
    documents = {
      id_number_last4: idNumber ? idNumber.slice(-4) : null,
      license_number: sensitive?.license_number || null,
      rider_photo_url: photoUrls.rider || null,
      vehicle_photo_url: photoUrls.vehicle || null
    };
  }

  const recentDurations = (recentOrdersResult.data || []).flatMap(order => {
    if (order.status !== 'Delivered' || !order.picked_up_at || !order.delivered_at) return [];
    const minutes = (new Date(order.delivered_at).getTime() - new Date(order.picked_up_at).getTime()) / 60_000;
    return Number.isFinite(minutes) && minutes >= 0
      ? [{ minutes, deliveredAt: order.delivered_at }]
      : [];
  }).filter(order => new Date(order.deliveredAt).getTime() >= now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return NextResponse.json({
    rider,
    wallet: walletResult.data || null,
    profileDetails,
    profileDetailsRestricted: !sensitiveAllowed,
    profileDetailsUnavailable,
    performance: {
      total_deliveries: deliveredResult.count || 0,
      deliveries_this_week: weeklyResult.count || 0,
      average_delivery_minutes: recentDurations.length
        ? Math.round(recentDurations.reduce((total, delivery) => total + delivery.minutes, 0) / recentDurations.length)
        : null,
      on_time_rate: recentDurations.length
        ? Math.round(recentDurations.filter(delivery => delivery.minutes <= 30).length / recentDurations.length * 100)
        : null
    },
    orders: recentOrdersResult.data || [],
    activeOrders: activeOrdersResult.data || [],
    lastOfflineLocation: offlineLocationError ? null : lastOfflineLocation,
    lastOfflineLocationUnavailable,
    documents,
    refreshedAt: now.toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
