import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  return url && serviceKey && publicKey ? { url, serviceKey, publicKey } : null;
}

function isEnabled(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const role = params.get('role');
  const workspace = params.get('workspace');
  if (role !== 'rider' && role !== 'merchant') {
    return NextResponse.json({ allowed: false, error: 'Invalid app role.' }, { status: 400 });
  }
  if (role === 'merchant' && workspace !== null && workspace !== 'onbar') {
    return NextResponse.json({ allowed: false, error: 'Invalid merchant workspace.' }, { status: 400 });
  }
  const config = configuration();
  if (!config) return NextResponse.json({ allowed: false, error: 'App access is not configured.' }, { status: 503 });

  const database = createClient(config.url, config.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const settingKey = role === 'rider' ? 'rider_app_install_enabled' : 'merchant_app_install_enabled';
  const { data: setting, error: settingError } = await database.from('settings').select('value').eq('key', settingKey).maybeSingle();
  if (settingError) {
    console.error('[AppInstall] Could not read admin install setting:', settingError);
    return NextResponse.json({ allowed: false, error: 'App access could not be checked.' }, { status: 503 });
  }
  if (!isEnabled(setting?.value)) {
    return NextResponse.json({ allowed: false, reason: 'admin_disabled' }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
  if (!token) return NextResponse.json({ allowed: false, reason: 'not_signed_in' }, { status: 401 });

  if (role === 'rider') {
    const riderSession = verifyRiderSession(token);
    if (!riderSession) return NextResponse.json({ allowed: false, reason: 'not_approved' }, { status: 403 });
    const { data: rider, error } = await database.from('rider_status').select('verification_status').eq('rider_phone', riderSession.phone).maybeSingle();
    if (error || rider?.verification_status !== 'Verified') {
      return NextResponse.json({ allowed: false, reason: 'not_approved' }, { status: 403 });
    }
    return NextResponse.json({ allowed: true, role, account: riderSession.phone }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const authClient = createClient(config.url, config.publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData.user;
  const email = user?.email && user.email_confirmed_at ? user.email.trim().toLowerCase() : null;
  if (authError || !user || (!email && !user.phone_confirmed_at)) {
    return NextResponse.json({ allowed: false, reason: 'not_signed_in' }, { status: 401 });
  }
  if (workspace === 'onbar') {
    const { data: linkedApplication, error: linkedError } = await database
      .from('merchant_applications')
      .select('id')
      .eq('account_user_id', user.id)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();
    if (linkedError) {
      console.error('[AppInstall] Could not verify OnBar merchant access:', linkedError);
      return NextResponse.json({ allowed: false, error: 'Merchant app access could not be checked.' }, { status: 503 });
    }
    let application = linkedApplication;
    if (!application && email) {
      const { data: legacyApplication, error: legacyError } = await database
        .from('merchant_applications')
        .select('id')
        .eq('email', email)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle();
      if (legacyError) {
        console.error('[AppInstall] Could not verify legacy OnBar merchant access:', legacyError);
        return NextResponse.json({ allowed: false, error: 'Merchant app access could not be checked.' }, { status: 503 });
      }
      application = legacyApplication;
    }
    if (!application) return NextResponse.json({ allowed: false, reason: 'not_approved' }, { status: 403 });
    return NextResponse.json({ allowed: true, role, account: user.id }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (!email) return NextResponse.json({ allowed: false, reason: 'not_signed_in' }, { status: 401 });
  const { data: membership, error: membershipError } = await database
    .from('mm_merchant_memberships')
    .select('merchant_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membershipError || !membership) {
    return NextResponse.json({ allowed: false, reason: 'not_approved' }, { status: 403 });
  }
  return NextResponse.json({ allowed: true, role, account: user.id }, { headers: { 'Cache-Control': 'private, no-store' } });
}
