import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

const shiftDays = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

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
  return new Date(Date.UTC(year, month, day - ((weekday + 6) % 7), 3)).toISOString();
}

function isProfileMigrationMissing(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || /rider_profile_details|rider_profile_audit_events|schema cache/i.test(error.message || '');
}

function optionalPhone(value: unknown, name: string) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 40 || value.replace(/\D/g, '').length < 7) {
    throw new Error(`${name} must be a valid phone number.`);
  }
  return value.trim();
}

function optionalText(value: unknown, name: string, maxLength = 120) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new Error(`${name} must be under ${maxLength} characters.`);
  }
  return value.trim() || null;
}

function optionalDate(value: unknown, name: string) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid date.`);
  }
  return value;
}

function optionalTime(value: unknown, name: string) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${name} must use 24-hour time.`);
  }
  return value;
}

function pathForRiderPhoto(value: unknown) {
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

export async function GET(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider profile access is not configured on the server.' }, { status: 503 });

  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('id,rider_name,rider_phone,vehicle_type,vehicle_reg,current_location,status,battery_level,total_deliveries,rating,area_zone,health_score,current_tier,acceptance_rate,verification_status,last_known_lat,last_known_lng,location_updated_at,updated_at')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderProfile] Could not load rider:', riderError);
    return NextResponse.json({ error: 'Rider profile could not be loaded.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only approved riders can access this profile.' }, { status: 403 });
  }

  const now = new Date();
  const weekStart = getNairobiWeekStart(now);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const [
    detailsResult,
    walletResult,
    deliveredCountResult,
    weeklyCountResult,
    recentOrdersResult,
    offersResult,
    incidentsResult,
    documentsResult,
    auditResult
  ] = await Promise.all([
    database.from('rider_profile_details').select('*').eq('rider_phone', session.phone).maybeSingle(),
    database.from('rider_wallets').select('balance,total_earned,updated_at').eq('rider_phone', session.phone).maybeSingle(),
    database.from('orders').select('id', { count: 'exact', head: true }).eq('rider_phone', session.phone).eq('status', 'Delivered'),
    database.from('orders').select('id', { count: 'exact', head: true }).eq('rider_phone', session.phone).eq('status', 'Delivered').gte('delivered_at', weekStart),
    database.from('orders').select('id,status,total_price,payment_method,created_at,picked_up_at,delivered_at,delivery_eta_minutes').eq('rider_phone', session.phone).order('created_at', { ascending: false }).limit(500),
    database.from('rider_offer_events').select('response,created_at').eq('rider_phone', session.phone).gte('created_at', oneYearAgo).in('response', ['accepted', 'declined', 'expired']).limit(2000),
    database.from('delivery_events').select('id,order_id,to_status,metadata,created_at').eq('actor_id', session.phone).like('to_status', 'Issue reported:%').gte('created_at', oneYearAgo).order('created_at', { ascending: false }).limit(100),
    database.from('rider_status').select('id_number,license_number,rider_photo_url,vehicle_photo_url,plate_number').eq('rider_phone', session.phone).maybeSingle(),
    database.from('rider_profile_audit_events').select('id,changed_fields,created_at').eq('rider_phone', session.phone).order('created_at', { ascending: false }).limit(100)
  ]);
  if (deliveredCountResult.error || weeklyCountResult.error || recentOrdersResult.error || walletResult.error) {
    const error = deliveredCountResult.error || weeklyCountResult.error || recentOrdersResult.error || walletResult.error;
    console.error('[RiderProfile] Could not load wallet or delivery history:', error);
    return NextResponse.json({ error: 'Rider wallet or delivery history could not be loaded. Check the delivery migrations.' }, { status: 503 });
  }

  const profileSetupRequired = Boolean(detailsResult.error && isProfileMigrationMissing(detailsResult.error));
  if (detailsResult.error && !profileSetupRequired) {
    console.error('[RiderProfile] Could not load saved profile details:', detailsResult.error);
    return NextResponse.json({ error: 'Saved rider profile details could not be loaded.' }, { status: 503 });
  }
  const profileWarnings: string[] = [];
  if (profileSetupRequired) profileWarnings.push('Apply supabase/RIDER_PROFILE_DETAILS_MIGRATION.sql to save contact details, zones, shifts, payout preferences, and document dates.');
  if (offersResult.error) {
    if (isProfileMigrationMissing(offersResult.error)) profileWarnings.push('Offer acceptance history is unavailable until RIDER_TERMINAL_WORKFLOW_MIGRATION.sql is applied.');
    else {
      console.error('[RiderProfile] Could not load offer history:', offersResult.error);
      profileWarnings.push('Offer acceptance history could not be loaded.');
    }
  }
  if (incidentsResult.error) {
    if (isProfileMigrationMissing(incidentsResult.error)) profileWarnings.push('Delivery incident history is unavailable until DELIVERY_ENGINE_AND_BUZZ_MIGRATION.sql is applied.');
    else {
      console.error('[RiderProfile] Could not load incidents:', incidentsResult.error);
      profileWarnings.push('Delivery incident history could not be loaded.');
    }
    if (auditResult.error) {
      if (!isProfileMigrationMissing(auditResult.error)) {
        console.error('[RiderProfile] Could not load profile change history:', auditResult.error);
        profileWarnings.push('Profile change history could not be loaded.');
      }
    }
  }

  let documents: {
    id_number_last4: string | null;
    license_number_last4: string | null;
    rider_photo_url: string | null;
    vehicle_photo_url: string | null;
  } | null = null;
  if (documentsResult.error) {
    if (!isProfileMigrationMissing(documentsResult.error)) {
      console.error('[RiderProfile] Could not load rider documents:', documentsResult.error);
      profileWarnings.push('Verification documents could not be loaded.');
    } else {
      profileWarnings.push('Apply RIDER_ONBOARDING_SECURITY_MIGRATION.sql to view uploaded document status.');
    }
  } else if (documentsResult.data) {
    const idNumber = typeof documentsResult.data.id_number === 'string' ? documentsResult.data.id_number : '';
    const licenseNumber = typeof documentsResult.data.license_number === 'string' ? documentsResult.data.license_number : '';
    const photoPaths = [
      pathForRiderPhoto(documentsResult.data.rider_photo_url),
      pathForRiderPhoto(documentsResult.data.vehicle_photo_url)
    ];
    const [riderPhotoResult, vehiclePhotoResult] = await Promise.all(photoPaths.map(path =>
      path
        ? database.storage.from('rider-verifications').createSignedUrl(path, 15 * 60)
        : Promise.resolve({ data: null, error: null })
    ));
    for (const [label, result] of [['rider photo', riderPhotoResult], ['vehicle photo', vehiclePhotoResult]] as const) {
      if (result.error) {
        console.error(`[RiderProfile] Could not sign ${label}:`, result.error);
        profileWarnings.push(`Your ${label} is temporarily unavailable.`);
      }
    }
    documents = {
      id_number_last4: idNumber ? idNumber.slice(-4) : null,
      license_number_last4: licenseNumber ? licenseNumber.slice(-4) : null,
      rider_photo_url: riderPhotoResult.data?.signedUrl || null,
      vehicle_photo_url: vehiclePhotoResult.data?.signedUrl || null
    };
  }

  const deliveredOrders = (recentOrdersResult.data || []).filter(order =>
    order.status === 'Delivered' && order.picked_up_at && order.delivered_at
  );
  const recentDurations = deliveredOrders.flatMap(order => {
    const pickedUp = new Date(order.picked_up_at as string).getTime();
    const delivered = new Date(order.delivered_at as string).getTime();
    const minutes = (delivered - pickedUp) / 60_000;
    return Number.isFinite(minutes) && minutes >= 0 && new Date(order.delivered_at as string) >= new Date(ninetyDaysAgo)
      ? [{ minutes }]
      : [];
  });
  const offerRows = offersResult.data || [];
  const decidedOffers = offerRows.filter(offer => ['accepted', 'declined', 'expired'].includes(offer.response));
  const acceptedOffers = decidedOffers.filter(offer => offer.response === 'accepted').length;
  const onTimeDeliveries = recentDurations.filter(delivery => delivery.minutes <= 30).length;
  const details = detailsResult.data || (profileSetupRequired ? null : {
    whatsapp_number: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    guarantor_name: null,
    guarantor_phone: null,
    delivery_zones: [],
    max_distance_km: null,
    shift_days: [],
    shift_start_time: null,
    shift_end_time: null,
    mpesa_number: null,
    mpesa_registered_name: null,
    mpesa_name_verified_at: null,
    license_expiry_date: null,
    insurance_expiry_date: null,
    age_check_training_completed_at: null,
    rider_agreement_accepted_at: null,
    rider_agreement_version: null,
    updated_at: null
  });

  return NextResponse.json({
    rider: {
      id: rider.id,
      name: rider.rider_name,
      phone: rider.rider_phone,
      vehicleType: rider.vehicle_type,
      vehicleRegistration: documentsResult.data?.plate_number || rider.vehicle_reg,
      status: rider.status,
      batteryLevel: rider.battery_level,
      areaZone: rider.area_zone,
      createdAt: null,
      lastKnownLatitude: rider.last_known_lat,
      lastKnownLongitude: rider.last_known_lng,
      locationUpdatedAt: rider.location_updated_at
    },
    details: details ? {
      whatsappNumber: details.whatsapp_number,
      emergencyContactName: details.emergency_contact_name,
      emergencyContactPhone: details.emergency_contact_phone,
      guarantorName: details.guarantor_name,
      guarantorPhone: details.guarantor_phone,
      deliveryZones: details.delivery_zones || [],
      maxDistanceKm: details.max_distance_km === null ? null : Number(details.max_distance_km),
      shiftDays: details.shift_days || [],
      shiftStartTime: details.shift_start_time?.slice(0, 5) || null,
      shiftEndTime: details.shift_end_time?.slice(0, 5) || null,
      mpesaNumber: details.mpesa_number,
      mpesaRegisteredName: details.mpesa_registered_name,
      mpesaNameVerified: Boolean(details.mpesa_name_verified_at),
      licenseExpiryDate: details.license_expiry_date,
      insuranceExpiryDate: details.insurance_expiry_date,
      ageCheckTrainingCompletedAt: details.age_check_training_completed_at,
      riderAgreementAcceptedAt: details.rider_agreement_accepted_at,
      riderAgreementVersion: details.rider_agreement_version,
      updatedAt: details.updated_at
    } : null,
    documents,
    wallet: walletResult.data || null,
    performance: {
      completedDeliveries: deliveredCountResult.count || 0,
      deliveriesThisWeek: weeklyCountResult.count || 0,
      averageDeliveryMinutes: recentDurations.length
        ? Math.round(recentDurations.reduce((total, delivery) => total + delivery.minutes, 0) / recentDurations.length)
        : null,
      onTimeRate: recentDurations.length
        ? Math.round(onTimeDeliveries / recentDurations.length * 100)
        : null,
      acceptanceRate: decidedOffers.length
        ? Math.round(acceptedOffers / decidedOffers.length * 100)
        : null,
      decidedOffers: decidedOffers.length,
      rating: null,
      ratingCount: 0,
      complaintsLast30Days: null
    },
    orders: recentOrdersResult.data || [],
    incidents: incidentsResult.data || [],
    audit: auditResult.error ? [] : auditResult.data || [],
    profileSetupRequired,
    warnings: profileWarnings,
    refreshedAt: now.toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider profile access is not configured on the server.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid rider profile update.' }, { status: 400 });
  }

  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderProfile] Could not verify rider profile update:', riderError);
    return NextResponse.json({ error: 'Rider account could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only approved riders can update this profile.' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  try {
    if (Object.hasOwn(body, 'whatsappNumber')) updates.whatsapp_number = optionalPhone(body.whatsappNumber, 'WhatsApp number');
    if (Object.hasOwn(body, 'emergencyContactName')) updates.emergency_contact_name = optionalText(body.emergencyContactName, 'Emergency contact name');
    if (Object.hasOwn(body, 'emergencyContactPhone')) updates.emergency_contact_phone = optionalPhone(body.emergencyContactPhone, 'Emergency contact phone');
    if (Object.hasOwn(body, 'guarantorName')) updates.guarantor_name = optionalText(body.guarantorName, 'Guarantor name');
    if (Object.hasOwn(body, 'guarantorPhone')) updates.guarantor_phone = optionalPhone(body.guarantorPhone, 'Guarantor phone');
    if (Object.hasOwn(body, 'deliveryZones')) {
      if (!Array.isArray(body.deliveryZones) || body.deliveryZones.length > 20
        || body.deliveryZones.some(zone => typeof zone !== 'string' || !zone.trim() || zone.trim().length > 80)) {
        throw new Error('Add up to 20 valid delivery zones.');
      }
      updates.delivery_zones = [...new Set(body.deliveryZones.map(zone => (zone as string).trim()))];
    }
    if (Object.hasOwn(body, 'maxDistanceKm')) {
      const value = body.maxDistanceKm === null || body.maxDistanceKm === '' ? null : Number(body.maxDistanceKm);
      if (value !== null && (!Number.isFinite(value) || value < 1 || value > 100)) throw new Error('Maximum delivery distance must be between 1 and 100 km.');
      updates.max_distance_km = value;
    }
    if (Object.hasOwn(body, 'shiftDays')) {
      if (!Array.isArray(body.shiftDays) || body.shiftDays.length > 7 || body.shiftDays.some(day => typeof day !== 'string' || !shiftDays.has(day))) {
        throw new Error('Select valid available shift days.');
      }
      updates.shift_days = [...new Set(body.shiftDays)];
    }
    if (Object.hasOwn(body, 'shiftStartTime')) updates.shift_start_time = optionalTime(body.shiftStartTime, 'Shift start time');
    if (Object.hasOwn(body, 'shiftEndTime')) updates.shift_end_time = optionalTime(body.shiftEndTime, 'Shift end time');
    if (Object.hasOwn(body, 'mpesaNumber')) updates.mpesa_number = optionalPhone(body.mpesaNumber, 'M-Pesa number');
    if (Object.hasOwn(body, 'mpesaRegisteredName')) updates.mpesa_registered_name = optionalText(body.mpesaRegisteredName, 'M-Pesa registered name');
    if (Object.hasOwn(body, 'licenseExpiryDate')) updates.license_expiry_date = optionalDate(body.licenseExpiryDate, 'Licence expiry date');
    if (Object.hasOwn(body, 'insuranceExpiryDate')) updates.insurance_expiry_date = optionalDate(body.insuranceExpiryDate, 'Insurance expiry date');
    if (Object.hasOwn(body, 'acceptAgreement') && body.acceptAgreement !== true) throw new Error('Agreement acceptance must be confirmed.');
  } catch (validationError) {
    return NextResponse.json({ error: validationError instanceof Error ? validationError.message : 'Check the profile fields and try again.' }, { status: 400 });
  }

  if (!Object.keys(updates).length && body.acceptAgreement !== true) {
    return NextResponse.json({ error: 'No rider profile changes were submitted.' }, { status: 400 });
  }

  if (body.acceptAgreement === true) {
    updates.rider_agreement_accepted_at = new Date().toISOString();
    updates.rider_agreement_version = 'rider-v1';
  }
  updates.rider_phone = session.phone;
  updates.updated_at = new Date().toISOString();

  const { data: saved, error: saveError } = await database.from('rider_profile_details')
    .upsert(updates, { onConflict: 'rider_phone' })
    .select('*')
    .single();
  if (saveError) {
    console.error('[RiderProfile] Could not save rider profile details:', saveError);
    return NextResponse.json({
      error: isProfileMigrationMissing(saveError)
        ? 'Rider profile editing is not installed. Apply supabase/RIDER_PROFILE_DETAILS_MIGRATION.sql.'
        : 'Your rider profile could not be saved.'
    }, { status: 503 });
  }

  const changedFields = Object.keys(updates).filter(field => field !== 'rider_phone' && field !== 'updated_at');
  const { error: auditError } = await database.from('rider_profile_audit_events').insert({
    rider_phone: session.phone,
    actor_type: 'rider',
    actor: session.phone,
    changed_fields: changedFields
  });
  if (auditError) {
    console.error('[RiderProfile] Profile saved but audit event could not be recorded:', auditError);
    return NextResponse.json({
      saved: true,
      warning: 'Profile changes were saved, but their audit entry could not be recorded.'
    }, { status: 200 });
  }
  return NextResponse.json({ saved: true, profileDetails: saved }, { headers: { 'Cache-Control': 'no-store' } });
}
