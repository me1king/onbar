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

  const { data: dispatchEligibilityReasons, error: readinessError } = await database.rpc(
    'rider_online_block_reasons',
    { p_rider_phone: rider.rider_phone }
  );
  if (readinessError) {
    console.error('[AdminRiderProfile] Could not verify rider dispatch readiness:', readinessError);
    return NextResponse.json({ error: 'Rider safety checks are unavailable. Apply supabase/RIDER_DISPATCH_SAFETY_MIGRATION.sql.' }, { status: 503 });
  }
  const blockReasons = Array.isArray(dispatchEligibilityReasons) ? dispatchEligibilityReasons : [];
  const displayStatus = rider.status === 'Idle' && blockReasons.length > 0 ? 'Offline' : rider.status;
  const riderForDisplay = { ...rider, status: displayStatus };

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
        .select('whatsapp_number,emergency_contact_name,emergency_contact_phone,guarantor_name,guarantor_phone,delivery_zones,max_distance_km,shift_days,shift_start_time,shift_end_time,mpesa_number,mpesa_registered_name,mpesa_name_verified_at,mpesa_name_verified_by,license_expiry_date,insurance_expiry_date,license_document_path,license_document_submitted_at,license_document_verified_at,license_document_verified_by,insurance_document_path,insurance_document_submitted_at,insurance_document_verified_at,insurance_document_verified_by,age_check_training_completed_at,rider_agreement_accepted_at,rider_agreement_version')
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
      const licensePath = getVerificationStoragePath(details?.license_document_path);
      const insurancePath = getVerificationStoragePath(details?.insurance_document_path);
      const [licenseUrlResult, insuranceUrlResult] = await Promise.all([
        licensePath
          ? database.storage.from('rider-verifications').createSignedUrl(licensePath, 60 * 15)
          : Promise.resolve({ data: null, error: null }),
        insurancePath
          ? database.storage.from('rider-verifications').createSignedUrl(insurancePath, 60 * 15)
          : Promise.resolve({ data: null, error: null })
      ]);
      if (licenseUrlResult.error || insuranceUrlResult.error) {
        console.error('[AdminRiderProfile] Could not sign replacement compliance documents:', licenseUrlResult.error || insuranceUrlResult.error);
        return NextResponse.json({ error: 'A rider compliance document is temporarily unavailable.' }, { status: 503 });
      }
      profileDetails = {
        ...details,
        license_document_url: licenseUrlResult.data?.signedUrl || null,
        insurance_document_url: insuranceUrlResult.data?.signedUrl || null
      };
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
    rider: riderForDisplay,
    dispatchEligibilityReasons: blockReasons,
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
    documents,
    refreshedAt: now.toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  const sensitiveAllowed = session?.role.toLowerCase() === 'owner'
    || Boolean(session && hasAdminPermission(session, 'can_view_sensitive_data'));
  if (!session || !hasAdminPermission(session, 'can_manage_orders') || !sensitiveAllowed) {
    return NextResponse.json({ error: 'Sensitive rider-payment or document verification access is required.' }, { status: 403 });
  }

  const { id } = await params;
  const riderId = Number(id);
  if (!Number.isSafeInteger(riderId) || riderId <= 0) {
    return NextResponse.json({ error: 'A valid rider ID is required.' }, { status: 400 });
  }

  let body: { action?: unknown };
  try {
    body = await request.json() as { action?: unknown };
  } catch {
    return NextResponse.json({ error: 'Send a valid rider verification action.' }, { status: 400 });
  }
  if (!['verify-mpesa', 'verify-license', 'verify-insurance'].includes(String(body.action))) {
    return NextResponse.json({ error: 'Choose a supported rider verification action.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider database access is not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('rider_phone')
    .eq('id', riderId)
    .maybeSingle();
  if (riderError) {
    console.error('[AdminRiderProfile] Could not verify rider identity:', riderError);
    return NextResponse.json({ error: 'Rider identity could not be verified.' }, { status: 503 });
  }
  if (!rider) return NextResponse.json({ error: 'Rider was not found.' }, { status: 404 });

  const { data: details, error: detailsError } = await database.from('rider_profile_details')
    .select('mpesa_number,mpesa_registered_name,license_document_path,license_expiry_date,insurance_document_path,insurance_expiry_date')
    .eq('rider_phone', rider.rider_phone)
    .maybeSingle();
  if (detailsError || !details) {
    console.error('[AdminRiderProfile] Could not load rider verification target:', detailsError);
    return NextResponse.json({ error: 'Rider verification details could not be loaded.' }, { status: 503 });
  }

  const now = new Date();
  const nairobiParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const nairobiDate = Object.fromEntries(nairobiParts.map(part => [part.type, part.value]));
  const today = `${nairobiDate.year}-${nairobiDate.month}-${nairobiDate.day}`;
  const actor = session.role;
  let updates: Record<string, unknown>;
  let changedField: string;

  if (body.action === 'verify-mpesa') {
    if (!details.mpesa_number?.trim() || !details.mpesa_registered_name?.trim()) {
      return NextResponse.json({ error: 'The rider must save both an M-Pesa number and registered name first.' }, { status: 409 });
    }
    updates = { mpesa_name_verified_at: now.toISOString(), mpesa_name_verified_by: actor };
    changedField = 'mpesa_name_verified_at';
  } else if (body.action === 'verify-license') {
    if (!details.license_document_path || !details.license_expiry_date || details.license_expiry_date < today) {
      return NextResponse.json({ error: 'A submitted, unexpired driving licence is required before verification.' }, { status: 409 });
    }
    updates = { license_document_verified_at: now.toISOString(), license_document_verified_by: actor };
    changedField = 'license_document_verified_at';
  } else {
    if (!details.insurance_document_path || !details.insurance_expiry_date || details.insurance_expiry_date < today) {
      return NextResponse.json({ error: 'A submitted, unexpired insurance certificate is required before verification.' }, { status: 409 });
    }
    updates = { insurance_document_verified_at: now.toISOString(), insurance_document_verified_by: actor };
    changedField = 'insurance_document_verified_at';
  }

  const { error: updateError } = await database.from('rider_profile_details')
    .update({ ...updates, updated_at: now.toISOString() })
    .eq('rider_phone', rider.rider_phone);
  if (updateError) {
    console.error('[AdminRiderProfile] Could not save rider verification:', updateError);
    return NextResponse.json({ error: 'The rider verification could not be saved.' }, { status: 503 });
  }

  const { error: auditError } = await database.from('rider_profile_audit_events').insert({
    rider_phone: rider.rider_phone,
    actor_type: 'admin',
    actor,
    changed_fields: [changedField]
  });
  if (auditError) {
    console.error('[AdminRiderProfile] Verification saved but its audit event could not be recorded:', auditError);
    return NextResponse.json({
      saved: true,
      warning: 'Verification was saved, but its audit entry could not be recorded.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
}
