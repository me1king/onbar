import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createRiderSession, verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function serializeRider(rider: Record<string, unknown>) {
  return {
    id: rider.id,
    name: rider.rider_name,
    phone: rider.rider_phone,
    status: rider.status,
    verificationStatus: rider.verification_status
  };
}

export async function POST(request: Request) {
  let body: { phone?: unknown; pin?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Enter a valid rider phone number and PIN.' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.replace(/\s+/g, '').trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (phone.length < 7 || phone.length > 40 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Enter a valid rider phone number and four-digit PIN.' }, { status: 400 });
  }
  if (!process.env.RIDER_SESSION_SECRET?.trim()) {
    return NextResponse.json({ error: 'Rider sessions are not configured on the server.' }, { status: 503 });
  }

  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Rider sign-in is not configured on the server.' }, { status: 503 });
  }

  const digits = phone.replace(/\D/g, '');
  const nationalNumber = digits.startsWith('254')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  const phoneVariants = [...new Set([
    phone,
    digits,
    nationalNumber,
    `0${nationalNumber}`,
    `254${nationalNumber}`,
    `+254${nationalNumber}`
  ])];
  const { data: canAttempt, error: rateLimitError } = await database
    .rpc('allow_rider_login_attempt', { identity_input: nationalNumber });
  if (rateLimitError) {
    console.error('[RiderSession] Could not check rider login rate limit:', rateLimitError);
    return NextResponse.json({ error: 'Rider sign-in is temporarily unavailable.' }, { status: 503 });
  }
  if (!canAttempt) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const { data: matchingRiders, error } = await database
    .rpc('verify_rider_pin', { phone_variants_input: phoneVariants, pin_input: pin });
  if (error) {
    console.error('[RiderSession] Could not verify rider credentials:', error);
    return NextResponse.json({ error: 'Rider sign-in could not be completed.' }, { status: 503 });
  }
  const data = matchingRiders?.[0];
  if (!data || data.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Phone number or PIN is incorrect, or the rider account is not approved.' }, { status: 401 });
  }

  try {
    return NextResponse.json({
      rider: serializeRider(data),
      token: createRiderSession(data.rider_phone)
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (sessionError) {
    console.error('[RiderSession] Could not create a rider session:', sessionError);
    return NextResponse.json({ error: 'Rider sessions are not configured on the server.' }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const session = verifyRiderSession(token);
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider session validation is unavailable.' }, { status: 503 });

  const { data, error } = await database
    .from('rider_status')
    .select('id, rider_name, rider_phone, status, verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (error) {
    console.error('[RiderSession] Could not refresh rider session:', error);
    return NextResponse.json({ error: 'Rider session could not be refreshed.' }, { status: 503 });
  }
  if (!data || data.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'This rider account is no longer approved.' }, { status: 401 });
  }

  return NextResponse.json({ rider: serializeRider(data) }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
