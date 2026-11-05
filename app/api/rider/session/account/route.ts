import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';
import { createRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

function phoneVariants(value: string) {
  const normalized = normalizeTicketPhoneNumber(value);
  if (!normalized) return [];
  const national = normalized.slice(4);
  return [...new Set([normalized, national, `0${national}`, `254${national}`])];
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Rider account access is not configured on this server.' }, { status: 503 });
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Sign in to your OnlineBar account to continue.' }, { status: 401 });
  }

  const auth = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await auth.auth.getUser(accessToken);
  const user = authData.user;
  const verifiedEmail = user?.email && (user.email_confirmed_at || user.confirmed_at)
    ? user.email.trim().toLowerCase()
    : null;
  const verifiedPhone = user?.phone_confirmed_at && user.phone
    ? normalizeTicketPhoneNumber(user.phone)
    : null;

  if (authError || !user || (!verifiedEmail && !verifiedPhone)) {
    return NextResponse.json({ error: 'Verify your OnlineBar account email or phone before opening rider access.' }, { status: 401 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const candidates: Array<{
    id: number;
    rider_name: string;
    rider_phone: string;
    status: string;
    verification_status: string;
    rider_email?: string | null;
    current_tier: string | null;
    rating: number | null;
    acceptance_rate: number | null;
  }> = [];
  const riderFields = 'id, rider_name, rider_phone, status, verification_status, current_tier, rating, acceptance_rate';

  if (verifiedEmail) {
    const { data, error } = await database
      .from('rider_status')
      .select(`${riderFields}, rider_email`)
      .eq('verification_status', 'Verified')
      .eq('rider_email', verifiedEmail)
      .limit(3);
    if (error) {
      console.error('[RiderSession] Could not match the verified account email to a rider:', error);
      if (!verifiedPhone || !/rider_email|schema cache/i.test(error.message)) {
        return NextResponse.json({
          error: /rider_email|schema cache/i.test(error.message)
            ? 'Rider email linking is not installed. Apply the rider email communications migration or use your approval PIN.'
            : 'Rider account access could not be checked.'
        }, { status: 503 });
      }
    } else {
      candidates.push(...(data || []));
    }
  }

  if (verifiedPhone) {
    const variants = phoneVariants(verifiedPhone);
    const { data, error } = await database
      .from('rider_status')
      .select(riderFields)
      .eq('verification_status', 'Verified')
      .in('rider_phone', variants)
      .limit(3);
    if (error) {
      console.error('[RiderSession] Could not match the verified account phone to a rider:', error);
      return NextResponse.json({ error: 'Rider account access could not be checked.' }, { status: 503 });
    }
    candidates.push(...(data || []).map(rider => ({ ...rider, rider_email: null })));
  }

  const matchingRiders = [...new Map(candidates
    .filter(rider => rider.verification_status === 'Verified')
    .filter(rider => (
      Boolean(verifiedEmail && rider.rider_email?.trim().toLowerCase() === verifiedEmail)
      || Boolean(verifiedPhone && normalizeTicketPhoneNumber(rider.rider_phone) === verifiedPhone)
    ))
    .map(rider => [normalizeTicketPhoneNumber(rider.rider_phone) || rider.rider_phone, rider])
  ).values()];

  if (matchingRiders.length !== 1) {
    return NextResponse.json({
      error: 'This OnlineBar account is not linked to exactly one approved rider. Use the phone and four-digit PIN from your approval email, or contact dispatch to update your rider email or verified phone.'
    }, { status: 403 });
  }

  try {
    return NextResponse.json({
      token: createRiderSession(matchingRiders[0].rider_phone)
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('[RiderSession] Could not create account-linked rider session:', error);
    return NextResponse.json({ error: 'Rider sessions are not configured on the server.' }, { status: 503 });
  }
}
