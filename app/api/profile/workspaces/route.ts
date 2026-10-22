import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function phoneVariants(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return [];

  const national = digits.startsWith('254')
    ? digits.slice(3)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;

  return [...new Set([
    value.trim(),
    digits,
    national,
    `0${national}`,
    `254${national}`,
    `+254${national}`
  ].filter(Boolean))];
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Workspace access is not configured on this server.' }, { status: 503 });
  }
  if (!token) {
    return NextResponse.json({ error: 'Sign in to view your approved workspaces.' }, { status: 401 });
  }

  const authClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData.user;
  if (authError || !user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
    return NextResponse.json({ error: 'A verified account is required to view workspace access.' }, { status: 401 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const [{ data: applications, error: applicationsError }, { data: profile, error: profileError }] = await Promise.all([
    database.from('merchant_applications')
      .select('id, business_name, status')
      .eq('email', user.email.toLowerCase())
      .order('submitted_at', { ascending: false })
      .limit(25),
    database.from('profiles')
      .select('phone_number')
      .eq('id', user.id)
      .maybeSingle()
  ]);

  if (applicationsError || profileError) {
    console.error('[ProfileWorkspaces] Could not load account workspace access:', applicationsError || profileError);
    return NextResponse.json({ error: 'Your approved workspace access could not be checked.' }, { status: 503 });
  }

  const variants = phoneVariants(typeof profile?.phone_number === 'string' ? profile.phone_number : '');
  let riderApproved = false;
  if (variants.length > 0) {
    const { data: riders, error: ridersError } = await database
      .from('rider_status')
      .select('rider_phone, verification_status')
      .in('rider_phone', variants)
      .limit(10);
    if (ridersError) {
      console.error('[ProfileWorkspaces] Could not check rider approval:', ridersError);
      return NextResponse.json({ error: 'Your approved workspace access could not be checked.' }, { status: 503 });
    }
    const profileDigits = profile?.phone_number?.replace(/\D/g, '');
    riderApproved = (riders || []).some(rider =>
      rider.verification_status === 'Verified'
      && rider.rider_phone.replace(/\D/g, '') === profileDigits
    );
  }

  return NextResponse.json({
    merchantApplications: (applications || []).map(application => ({
      id: application.id,
      businessName: application.business_name,
      status: application.status
    })),
    riderApproved
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
