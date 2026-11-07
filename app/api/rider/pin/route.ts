import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Your rider session expired. Sign in again.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Enter your current PIN and a valid new PIN.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Enter your current PIN and a valid new PIN.' }, { status: 400 });
  }
  const pinInput = body as { currentPin?: unknown; newPin?: unknown; confirmPin?: unknown };
  const currentPin = typeof pinInput.currentPin === 'string' ? pinInput.currentPin.trim() : '';
  const newPin = typeof pinInput.newPin === 'string' ? pinInput.newPin.trim() : '';
  const confirmPin = typeof pinInput.confirmPin === 'string' ? pinInput.confirmPin.trim() : '';
  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
    return NextResponse.json({ error: 'PINs must each contain exactly four digits.' }, { status: 400 });
  }
  if (newPin !== confirmPin) return NextResponse.json({ error: 'The new PINs do not match.' }, { status: 400 });
  if (newPin === '0000') return NextResponse.json({ error: 'Choose a new PIN other than the temporary PIN 0000.' }, { status: 400 });
  if (newPin === currentPin) return NextResponse.json({ error: 'Your new PIN must be different from your current PIN.' }, { status: 400 });

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'PIN updates are not configured on the server.' }, { status: 503 });

  const { data: canAttempt, error: rateLimitError } = await database.rpc('allow_rider_login_attempt', {
    identity_input: `pin-change:${session.phone}`
  });
  if (rateLimitError) {
    console.error('[RiderPin] Could not check PIN change rate limit:', rateLimitError);
    return NextResponse.json({ error: 'PIN updates are temporarily unavailable.' }, { status: 503 });
  }
  if (!canAttempt) return NextResponse.json({ error: 'Too many PIN change attempts. Try again in 15 minutes.' }, { status: 429 });

  const { data: changed, error: changeError } = await database.rpc('change_rider_pin', {
    phone_input: session.phone,
    current_pin_input: currentPin,
    new_pin_input: newPin
  });
  if (changeError) {
    console.error('[RiderPin] Could not change rider PIN:', changeError);
    return NextResponse.json({
      error: /change_rider_pin|rider_account_security_events/i.test(changeError.message)
        ? 'Self-service PIN changes are not installed. Apply supabase/RIDER_SELF_SERVICE_PIN_MIGRATION.sql.'
        : 'PIN could not be changed. Please try again.'
    }, { status: 503 });
  }
  if (changed !== true) {
    return NextResponse.json({ error: 'Your current PIN is incorrect, or this rider account is no longer active.' }, { status: 401 });
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
