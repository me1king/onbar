import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

function isValidCoordinate(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'This profile update could not be verified.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Profile saving is not configured on this server.' }, { status: 503 });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Sign in to save details to your profile.' }, { status: 401 });

  let body: {
    fullName?: unknown;
    phoneNumber?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid set of profile details is required.' }, { status: 400 });
  }

  if ((body.fullName !== undefined && (typeof body.fullName !== 'string' || body.fullName.trim().length > 120))
    || (body.phoneNumber !== undefined && (typeof body.phoneNumber !== 'string' || body.phoneNumber.trim().length > 40))
    || (body.address !== undefined && (typeof body.address !== 'string' || body.address.trim().length > 300))
    || ((body.latitude !== undefined || body.longitude !== undefined)
      && !(isValidCoordinate(body.latitude, -90, 90) && isValidCoordinate(body.longitude, -180, 180)))) {
    return NextResponse.json({ error: 'Check the name, phone, address, and delivery pin details.' }, { status: 400 });
  }

  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Your sign-in session expired. Sign in again to save profile details.' }, { status: 401 });
  }

  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const updates = {
    ...(typeof body.fullName === 'string' && body.fullName.trim() ? { full_name: body.fullName.trim() } : {}),
    ...(typeof body.phoneNumber === 'string' && body.phoneNumber.trim() ? { phone_number: body.phoneNumber.trim() } : {}),
    ...(typeof body.address === 'string' && body.address.trim() ? { address: body.address.trim() } : {}),
    ...(body.latitude !== undefined && body.longitude !== undefined
      ? { latitude: body.latitude, longitude: body.longitude }
      : {})
  };
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Add at least one profile detail before saving.' }, { status: 400 });
  }

  const { data: profile, error: updateError } = await database.from('profiles')
    .update(updates)
    .eq('id', authData.user.id)
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('[CheckoutProfile] Could not update customer profile:', updateError);
    return NextResponse.json({ error: 'Your account profile could not be updated. Your checkout details remain saved on this device.' }, { status: 503 });
  }
  if (!profile) {
    const { error: insertError } = await database.from('profiles').insert({
      id: authData.user.id,
      email: authData.user.email || null,
      ...updates
    });
    if (insertError) {
      console.error('[CheckoutProfile] Could not create customer profile:', insertError);
      return NextResponse.json({ error: 'Your account profile could not be created. Your checkout details remain saved on this device.' }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
