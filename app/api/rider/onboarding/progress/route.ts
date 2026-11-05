import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const steps = new Set([
  'phone',
  'identity',
  'vehicle',
  'verification',
  'agreement',
  'biometrics',
  'pending',
  'success'
]);
const formFields = new Set([
  'riderName',
  'riderEmail',
  'birthDate',
  'idNumber',
  'licenseNumber',
  'plateNumber',
  'vehicleType'
]);

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[17]\d{8}$/.test(digits) ? digits : null;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function validFormData(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.every(([key, field]) =>
    formFields.has(key) && typeof field === 'string' && field.length <= 254
  ) && JSON.stringify(value).length <= 4_000;
}

function unavailable() {
  return NextResponse.json({
    error: 'Rider progress storage is not installed. Ask the Online Bar team to apply supabase/RIDER_ONBOARDING_PROGRESS_MIGRATION.sql.'
  }, { status: 503 });
}

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return NextResponse.json({ error: 'This saved session is invalid. Start again with your phone number.' }, { status: 401 });
  }
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider progress storage is not configured on the server.' }, { status: 503 });

  const { data, error } = await database.from('rider_onboarding_sessions')
    .select('rider_phone,current_step,form_data,updated_at')
    .eq('session_token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    console.error('[RiderOnboardingProgress] Could not load saved progress:', error);
    return /rider_onboarding_sessions/i.test(error.message)
      ? unavailable()
      : NextResponse.json({ error: 'Saved rider progress could not be loaded. Please try again.' }, { status: 503 });
  }
  if (!data) {
    const { error: cleanupError } = await database.from('rider_onboarding_sessions')
      .delete()
      .eq('session_token_hash', hashToken(token))
      .lt('expires_at', new Date().toISOString());
    if (cleanupError) {
      console.error('[RiderOnboardingProgress] Could not remove expired progress:', cleanupError);
      return NextResponse.json({ error: 'Expired rider progress could not be cleared. Please try again.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'This saved session has expired. Start again with your phone number.' }, { status: 404 });
  }

  let currentStep = data.current_step;
  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', data.rider_phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderOnboardingProgress] Could not check application status:', riderError);
    return NextResponse.json({ error: 'Rider application status could not be checked. Please try again.' }, { status: 503 });
  }
  if (rider?.verification_status === 'Verified') {
    currentStep = 'success';
  } else if (rider?.verification_status === 'Pending') {
    currentStep = 'pending';
  }

  return NextResponse.json({
    phone: data.rider_phone,
    currentStep,
    formData: data.form_data,
    updatedAt: data.updated_at
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  let submitted: unknown;
  try {
    submitted = await request.json();
  } catch {
    return NextResponse.json({ error: 'Provide valid rider onboarding progress.' }, { status: 400 });
  }
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
    return NextResponse.json({ error: 'Provide valid rider onboarding progress.' }, { status: 400 });
  }
  const body = submitted as Record<string, unknown>;
  const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null;
  const token = typeof body.sessionToken === 'string' ? body.sessionToken : '';
  const currentStep = typeof body.currentStep === 'string' ? body.currentStep : '';
  if (!phone) return NextResponse.json({ error: 'Enter a valid Kenyan mobile number.' }, { status: 400 });
  if (!steps.has(currentStep)) return NextResponse.json({ error: 'The onboarding step is invalid.' }, { status: 400 });
  if (!validFormData(body.formData)) return NextResponse.json({ error: 'The saved rider details are invalid.' }, { status: 400 });
  if (token && !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    return NextResponse.json({ error: 'This saved session is invalid. Start again with your phone number.' }, { status: 401 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider progress storage is not configured on the server.' }, { status: 503 });
  const now = new Date().toISOString();
  const sessionToken = token || randomBytes(32).toString('base64url');
  const sessionTokenHash = hashToken(sessionToken);

  if (token) {
    const { data, error } = await database.from('rider_onboarding_sessions')
      .update({
        current_step: currentStep,
        form_data: body.formData,
        updated_at: now,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('session_token_hash', sessionTokenHash)
      .eq('rider_phone', phone)
      .gt('expires_at', now)
      .select('rider_phone')
      .maybeSingle();
    if (error) {
      console.error('[RiderOnboardingProgress] Could not save progress:', error);
      return /rider_onboarding_sessions/i.test(error.message)
        ? unavailable()
        : NextResponse.json({ error: 'Rider progress could not be saved. Please try again.' }, { status: 503 });
    }
    if (!data) return NextResponse.json({ error: 'This saved session expired or belongs to a different phone number. Start again.' }, { status: 401 });
  } else {
    const { error: cleanupError } = await database.from('rider_onboarding_sessions')
      .delete()
      .lt('expires_at', now);
    if (cleanupError) {
      console.error('[RiderOnboardingProgress] Could not remove expired progress:', cleanupError);
      return NextResponse.json({ error: 'Expired rider progress could not be cleared. Please try again.' }, { status: 503 });
    }
    const { data: existingRider, error: riderError } = await database.from('rider_status')
      .select('verification_status')
      .eq('rider_phone', phone)
      .maybeSingle();
    if (riderError) {
      console.error('[RiderOnboardingProgress] Could not check existing application:', riderError);
      return NextResponse.json({ error: 'The rider application could not be checked. Please try again.' }, { status: 503 });
    }
    if (existingRider?.verification_status === 'Verified') {
      return NextResponse.json({ error: 'This phone number already belongs to an approved rider. Sign in to your rider account.' }, { status: 409 });
    }
    if (existingRider?.verification_status === 'Pending') {
      return NextResponse.json({ error: 'An application for this phone number is already under review. The team will contact you by email.' }, { status: 409 });
    }

    const { error } = await database.from('rider_onboarding_sessions').insert({
      rider_phone: phone,
      session_token_hash: sessionTokenHash,
      current_step: currentStep,
      form_data: body.formData,
      updated_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    if (error) {
      console.error('[RiderOnboardingProgress] Could not start progress session:', error);
      return /rider_onboarding_sessions/i.test(error.message)
        ? unavailable()
        : NextResponse.json({ error: 'Rider progress could not be started. Please try again.' }, { status: 503 });
    }
  }

  return NextResponse.json({
    saved: true,
    sessionToken: token ? undefined : sessionToken,
    savedAt: now
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
