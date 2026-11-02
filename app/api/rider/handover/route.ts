import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { orderId?: unknown; code?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Enter the customer’s four-digit handover code.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !/^\d{4}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the customer’s four-digit handover code.' }, { status: 400 });
  }

  const handoverSecret = process.env.RIDER_HANDOVER_CODE_SECRET?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!handoverSecret || !url || !serviceKey) {
    return NextResponse.json({ error: 'Secure handover verification is not configured on the server.' }, { status: 503 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderHandover] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can confirm handover codes.' }, { status: 403 });
  }

  const codeHash = createHmac('sha256', handoverSecret)
    .update(`${orderId}:${session.phone}:${code}`)
    .digest('hex');
  const { data: result, error } = await database.rpc('verify_rider_handover_code', {
    p_order_id: orderId,
    p_rider_phone: session.phone,
    p_code_hash: codeHash
  });
  if (error) {
    console.error('[RiderHandover] Could not verify code:', error);
    return NextResponse.json({
      error: /verify_rider_handover_code|rider_handover_codes|schema cache/i.test(error.message)
        ? 'Secure handover is not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql.'
        : 'The handover code could not be verified.'
    }, { status: 503 });
  }
  if (result === 'locked') {
    return NextResponse.json({ error: 'Too many incorrect attempts. Contact dispatch to reset handover.' }, { status: 429 });
  }
  if (result === 'expired') {
    return NextResponse.json({ error: 'This code has expired. Ask the customer to request a new code.' }, { status: 410 });
  }
  if (result !== 'verified') {
    return NextResponse.json({ error: 'That code does not match. Check with the customer and try again.' }, { status: 400 });
  }

  return NextResponse.json({ verified: true }, { headers: { 'Cache-Control': 'no-store' } });
}
