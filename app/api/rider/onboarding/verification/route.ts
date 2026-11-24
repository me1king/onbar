import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const bucket = 'rider-verifications';
const allowedImageTypes = new Set(['image/jpeg', 'image/png']);
const maximumImageSize = 5 * 1024 * 1024;
const sessionTokenPattern = /^[A-Za-z0-9_-]{40,64}$/;

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[17]\d{8}$/.test(digits) ? `254${digits}` : null;
}

function isImage(value: FormDataEntryValue | null): value is File {
  return value instanceof File
    && allowedImageTypes.has(value.type)
    && value.size > 0
    && value.size <= maximumImageSize;
}

function ageOnDate(dateOfBirth: string, now = new Date()) {
  const date = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(date.getTime())) return null;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (
    now.getUTCMonth() < date.getUTCMonth()
    || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())
  ) age--;
  return age >= 0 ? age : null;
}

export async function GET(request: Request) {
  const phone = normalizePhone(new URL(request.url).searchParams.get('phone') || '');
  if (!phone) return NextResponse.json({ error: 'A valid Kenyan rider phone number is required.' }, { status: 400 });

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider verification is not configured on the server.' }, { status: 503 });
  const sessionToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!sessionTokenPattern.test(sessionToken)) {
    return NextResponse.json({ error: 'Resume your saved onboarding session to check application status.' }, { status: 401 });
  }
  const { data: session, error: sessionError } = await database.from('rider_onboarding_progress')
    .select('rider_phone')
    .eq('session_token_hash', hashSessionToken(sessionToken))
    .eq('rider_phone', phone)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (sessionError) {
    console.error('[RiderOnboarding] Could not verify status session:', sessionError);
    return NextResponse.json({ error: 'Your saved onboarding session could not be checked.' }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: 'Your saved onboarding session is invalid or expired.' }, { status: 401 });

  const { data: rider, error } = await database.from('rider_status')
    .select('rider_name,verification_status')
    .eq('rider_phone', phone)
    .maybeSingle();
  if (error) {
    console.error('[RiderOnboarding] Could not load verification status:', error);
    return NextResponse.json({ error: 'Rider verification status could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({
    verificationStatus: rider?.verification_status || null,
    riderName: rider?.rider_name || null
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Submit a valid rider verification form.' }, { status: 400 });
  }

  const phone = normalizePhone(String(form.get('phone') || ''));
  const sessionToken = String(form.get('sessionToken') || '');
  const riderName = String(form.get('riderName') || '').trim();
  const riderEmail = String(form.get('riderEmail') || '').trim().toLowerCase();
  const birthDate = String(form.get('birthDate') || '').trim();
  const idNumber = String(form.get('idNumber') || '').trim();
  const licenseNumber = String(form.get('licenseNumber') || '').trim();
  const plateNumber = String(form.get('plateNumber') || '').trim().toUpperCase();
  const vehicleType = String(form.get('vehicleType') || '').trim();
  const riderPhoto = form.get('riderPhoto');
  const vehiclePhoto = form.get('vehiclePhoto');

  if (!phone) return NextResponse.json({ error: 'Enter a valid Kenyan rider phone number.' }, { status: 400 });
  if (!sessionTokenPattern.test(sessionToken)) {
    return NextResponse.json({ error: 'Your saved onboarding session is missing. Return to the phone step and continue again.' }, { status: 401 });
  }
  if (!riderName || riderName.length > 160) {
    return NextResponse.json({ error: 'Enter the rider’s full name (up to 160 characters).' }, { status: 400 });
  }
  if (riderEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(riderEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address for rider communications.' }, { status: 400 });
  }
  if (idNumber.length > 80 || licenseNumber.length > 80 || plateNumber.length > 40) {
    return NextResponse.json({ error: 'One or more identity or vehicle details are too long.' }, { status: 400 });
  }
  if (!['Motorbike', 'Car', 'Van'].includes(vehicleType)) {
    return NextResponse.json({ error: 'Choose a supported vehicle type.' }, { status: 400 });
  }
  if (!isImage(riderPhoto) || !isImage(vehiclePhoto)) {
    return NextResponse.json({
      error: 'Upload a JPG or PNG selfie and vehicle photo, each no larger than 5 MB.'
    }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider verification is not configured on the server.' }, { status: 503 });

  const { data: onboardingSession, error: sessionError } = await database.from('rider_onboarding_progress')
    .select('rider_phone')
    .eq('session_token_hash', hashSessionToken(sessionToken))
    .eq('rider_phone', phone)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (sessionError) {
    console.error('[RiderOnboarding] Could not verify onboarding session:', sessionError);
    return NextResponse.json({ error: 'Your saved onboarding session could not be checked.' }, { status: 503 });
  }
  if (!onboardingSession) {
    return NextResponse.json({ error: 'Your saved onboarding session is invalid or expired. Start again from the phone step.' }, { status: 401 });
  }

  let minimumAge = 18;
  let licenseRequired = true;
  const { data: onboardingSettings, error: settingsError } = await database.from('settings')
    .select('value')
    .eq('key', 'onboarding_config')
    .maybeSingle();
  if (settingsError) {
    console.error('[RiderOnboarding] Could not load verification rules:', settingsError);
    return NextResponse.json({ error: 'Rider verification rules could not be loaded.' }, { status: 503 });
  }
  const settings = onboardingSettings?.value as {
    rules?: { min_age?: unknown; require_license?: unknown };
  } | null;
  if (typeof settings?.rules?.min_age === 'number' && Number.isFinite(settings.rules.min_age)) {
    minimumAge = Math.max(18, Math.min(100, Math.floor(settings.rules.min_age)));
  }
  if (typeof settings?.rules?.require_license === 'boolean') {
    licenseRequired = settings.rules.require_license;
  }
  if (licenseRequired && !licenseNumber) {
    return NextResponse.json({ error: 'A valid driver’s licence number is required.' }, { status: 400 });
  }
  if (birthDate) {
    const age = ageOnDate(birthDate);
    if (age === null || age < minimumAge) {
      return NextResponse.json({ error: `Riders must be at least ${minimumAge} years old.` }, { status: 400 });
    }
  }

  const { data: existingRider, error: existingError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', phone)
    .maybeSingle();
  if (existingError) {
    console.error('[RiderOnboarding] Could not check for an existing rider application:', existingError);
    return NextResponse.json({ error: 'The rider application could not be checked.' }, { status: 503 });
  }
  if (existingRider && existingRider.verification_status !== 'Rejected') {
    return NextResponse.json({
      error: existingRider.verification_status === 'Verified'
        ? 'This phone number already belongs to an approved rider.'
        : 'An application for this phone number is already under review.'
    }, { status: 409 });
  }

  const uploadedPaths: string[] = [];
  const { data: existingBucket, error: bucketLookupError } = await database.storage.getBucket(bucket);
  if (bucketLookupError || !existingBucket) {
    const { error: bucketCreateError } = await database.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: maximumImageSize,
      allowedMimeTypes: [...allowedImageTypes]
    });
    if (bucketCreateError && !/already exists/i.test(bucketCreateError.message)) {
      console.error('[RiderOnboarding] Could not prepare verification storage bucket:', bucketLookupError || bucketCreateError);
      return NextResponse.json({
        error: 'Verification storage is not ready. Apply the rider onboarding security migration or contact support.'
      }, { status: 503 });
    }
  }
  const uploadImage = async (file: File, suffix: string) => {
    const path = `riders/${randomUUID()}-${suffix}`;
    const { error } = await database.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    uploadedPaths.push(path);
    return path;
  };

  try {
    const [riderPhotoUrl, vehiclePhotoUrl] = await Promise.all([
      uploadImage(riderPhoto, 'selfie'),
      uploadImage(vehiclePhoto, 'vehicle')
    ]);
    const application = {
      rider_phone: phone,
      rider_name: riderName,
      rider_email: riderEmail,
      vehicle_type: vehicleType,
      vehicle_reg: plateNumber || null,
      plate_number: plateNumber || null,
      id_number: idNumber || null,
      license_number: licenseNumber || null,
      rider_photo_url: riderPhotoUrl,
      vehicle_photo_url: vehiclePhotoUrl,
      verification_status: 'Pending',
      status: 'Offline',
      updated_at: new Date().toISOString()
    };

    const saveResult = existingRider
      ? await database.from('rider_status').update(application)
        .eq('rider_phone', phone)
        .eq('verification_status', 'Rejected')
        .select('rider_phone')
        .maybeSingle()
      : await database.from('rider_status').insert(application).select('rider_phone').maybeSingle();

    if (saveResult.error || !saveResult.data) {
      if (saveResult.error?.code === '23505') {
        return NextResponse.json({ error: 'An application for this phone number is already under review.' }, { status: 409 });
      }
      console.error('[RiderOnboarding] Could not save rider verification:', saveResult.error);
      throw new Error('Rider verification could not be saved. Check that the rider verification database fields are installed.');
    }

    const { error: progressError } = await database.from('rider_onboarding_progress')
      .update({
        current_step: 'pending',
        form_data: {},
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('session_token_hash', hashSessionToken(sessionToken))
      .eq('rider_phone', phone);
    if (progressError) {
      console.error('[RiderOnboarding] Application was submitted, but saved progress could not be advanced:', progressError);
    }

    return NextResponse.json({ verificationStatus: 'Pending' }, { status: 201 });
  } catch (error) {
    const { error: cleanupError } = await database.storage.from(bucket).remove(uploadedPaths);
    if (cleanupError) console.error('[RiderOnboarding] Could not remove incomplete verification uploads:', cleanupError);
    console.error('[RiderOnboarding] Verification submission failed:', error);
    return NextResponse.json({
      error: error instanceof Error && error.message.startsWith('Rider verification could not be saved')
        ? error.message
        : 'Verification photos could not be uploaded. Confirm the rider-verifications storage bucket is installed and retry.'
    }, { status: 503 });
  }
}
