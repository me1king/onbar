import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_SESSION_TTL_SECONDS, createSessionCookie } from '@/lib/adminAuth';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 15 * 60 * 1000;

function getServerDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

function normalizeRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() || 'staff';
}

async function matchesSecret(input: string, configured: string) {
  const encoder = new TextEncoder();
  const [inputDigest, configuredDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(configured))
  ]);
  const left = new Uint8Array(inputDigest);
  const right = new Uint8Array(configuredDigest);
  let difference = input.length ^ configured.length;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function staffPermissions(staff: Record<string, boolean | string | null>, role: string) {
  const communications = staff.can_manage_communications === true;
  const marketing = staff.can_manage_marketing === true;
  return {
    can_view_revenue: staff.can_view_revenue === true,
    can_manage_inventory: staff.can_manage_inventory === true,
    can_manage_orders: staff.can_manage_orders === true,
    can_delete_items: false,
    can_manage_blog: marketing,
    can_manage_affiliates: marketing,
    can_manage_customer_care: communications,
    can_manage_broadcast: communications,
    can_manage_settings: staff.can_manage_settings === true,
    can_manage_media: marketing,
    can_view_sensitive_rider_data: staff.can_view_sensitive_data === true,
    can_view_audit_logs: staff.can_view_audit_logs === true,
    can_manage_marketing: marketing,
    can_manage_communications: communications,
    can_manage_kitchen: staff.can_manage_kitchen === true,
    can_manage_staff: staff.can_manage_staff === true,
    can_execute_payouts: staff.can_execute_payouts === true,
    is_administrator: role === 'admin'
  };
}

async function getRecentFailedAttempts(database: ReturnType<typeof getServerDatabase>, ip: string) {
  if (!database) throw new Error('Authentication logging is not configured.');
  const { count, error } = await database
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('success', false)
    .eq('ip_address', ip)
    .gt('attempt_time', new Date(Date.now() - WINDOW_MS).toISOString());
  if (error) throw new Error(`Could not check login rate limit: ${error.message}`);
  return count ?? 0;
}

async function recordAttempt(
  database: ReturnType<typeof getServerDatabase>,
  request: Request,
  mode: string,
  identity: string,
  success: boolean,
  reason: string
) {
  if (!database) throw new Error('Authentication logging is not configured.');
  const ip = getClientIp(request);
  const { error } = await database.from('login_attempts').insert({
    ip_address: ip,
    success,
    mode,
    identity_hint: identity.slice(0, 160),
    reason,
    user_agent: request.headers.get('user-agent')?.slice(0, 512) || null
  });
  if (error) {
    console.error('[AdminLogin] Could not record authentication attempt:', error);
    throw new Error(`Could not record authentication attempt: ${error.message}`);
  }
}

async function maybeRecordBruteForceThreat(
  database: ReturnType<typeof getServerDatabase>,
  request: Request,
  attemptCount: number,
  threshold: number
) {
  if (!database || attemptCount !== threshold) return;
  const { error } = await database.from('security_threats').insert({
    type: 'BRUTE_FORCE_ATTEMPTS',
    severity: 'HIGH',
    description: `${threshold} failed authentication attempts within 15 minutes.`,
    status: 'OPEN',
    ip_address: getClientIp(request)
  });
  if (error) {
    console.error('[AdminLogin] Could not record brute-force alert:', error);
    throw new Error(`Could not record security alert: ${error.message}`);
  }
}

function serverError(error: unknown) {
  console.error('[AdminLogin] Authentication infrastructure failure:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Authentication service is unavailable.' },
    { status: 503 }
  );
}

function createLoginResponse(
  role: string,
  permissions: Record<string, boolean | string[]>,
  email: string,
  supplierId: string | null = null
) {
  const response = NextResponse.json({ ok: true, role });
  return createSessionCookie(role, permissions, supplierId, email).then(value => {
    response.cookies.set('admin_session', value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_TTL_SECONDS
    });
    return response;
  });
}

export async function POST(request: Request) {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!sessionSecret) {
    console.error('[AdminLogin] Missing ADMIN_SESSION_SECRET and ADMIN_PASSWORD server environment variables.');
    return NextResponse.json({
      error: 'Admin login is not configured. In Render, open the onlinebar service → Environment and set ADMIN_PASSWORD and ADMIN_SESSION_SECRET, then redeploy.'
    }, { status: 500 });
  }
  const database = getServerDatabase();
  if (!database || !supabase) {
    return NextResponse.json({ error: 'Authentication database is not configured on the server.' }, { status: 503 });
  }

  let body: {
    password?: unknown;
    email?: unknown;
    mode?: unknown;
    phone?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid login request is required.' }, { status: 400 });
  }

  const mode = typeof body.mode === 'string' ? body.mode : 'pin';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (password.length > 512 || email.length > 254 || phone.length > 32) {
    return NextResponse.json({ error: 'Login input exceeds the supported length.' }, { status: 400 });
  }
  const ip = getClientIp(request);
  const threshold = mode === 'pin' ? 5 : 10;

  try {
    if (!['pin', 'email', 'staff_pin', 'rider'].includes(mode)) {
      await recordAttempt(database, request, mode, 'unknown', false, 'Unsupported login mode');
      return NextResponse.json({ error: 'Invalid login mode.' }, { status: 400 });
    }

    const blacklistResult = await database
      .from('ip_blacklist')
      .select('ip_address')
      .eq('ip_address', ip)
      .eq('active', true)
      .maybeSingle();
    let blockedOrigin = blacklistResult.data;
    if (blacklistResult.error) {
      const missingActiveColumn = blacklistResult.error.code === '42703'
        && /ip_blacklist\.active/i.test(blacklistResult.error.message);
      if (!missingActiveColumn) {
        throw new Error(`Could not check blocked origins: ${blacklistResult.error.message}`);
      }

      console.warn('[AdminLogin] ip_blacklist.active is missing; treating existing entries as blocked until the auth migration is applied.');
      const legacyBlacklistResult = await database
        .from('ip_blacklist')
        .select('ip_address')
        .eq('ip_address', ip)
        .maybeSingle();
      if (legacyBlacklistResult.error) {
        throw new Error(`Could not check blocked origins: ${legacyBlacklistResult.error.message}`);
      }
      blockedOrigin = legacyBlacklistResult.data;
    }
    if (blockedOrigin) {
      return NextResponse.json({ error: 'This network origin is blocked from authentication.' }, { status: 403 });
    }

    const failedAttempts = await getRecentFailedAttempts(database, ip);
    if (failedAttempts >= threshold) {
      return NextResponse.json({
        error: 'Too many failed login attempts. Try again in 15 minutes.'
      }, { status: 429 });
    }

    if (mode === 'pin') {
      const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
      if (!configuredPassword) {
        console.error('[AdminLogin] Owner PIN login requested without ADMIN_PASSWORD configured.');
        return NextResponse.json({
          error: 'Owner PIN login is not configured. Set ADMIN_PASSWORD in the Render service Environment and redeploy.'
        }, { status: 500 });
      }
      if (!password) return NextResponse.json({ error: 'PIN is required.' }, { status: 400 });

      const isMatch = await matchesSecret(password, configuredPassword);
      await recordAttempt(database, request, mode, 'owner', isMatch, isMatch ? 'Authenticated' : 'Invalid PIN');
      if (!isMatch) {
        const count = await getRecentFailedAttempts(database, ip);
        await maybeRecordBruteForceThreat(database, request, count, threshold);
        return NextResponse.json({
          error: 'Incorrect PIN. Check that the Owner PIN matches ADMIN_PASSWORD in the Render Environment, then redeploy.'
        }, { status: 401 });
      }

      const ownerPermissions = {
        can_view_revenue: true,
        can_manage_inventory: true,
        can_manage_orders: true,
        can_delete_items: true,
        can_manage_blog: true,
        can_manage_affiliates: true,
        can_manage_customer_care: true,
        can_manage_broadcast: true,
        can_manage_settings: true,
        can_manage_media: true,
        can_view_sensitive_rider_data: true,
        can_view_audit_logs: true,
        can_manage_marketing: true,
        can_manage_communications: true,
        can_manage_kitchen: true,
        can_manage_staff: true,
        can_execute_payouts: true
      };
      return await createLoginResponse('owner', ownerPermissions, 'Owner (PIN)');
    }

    if (mode === 'email') {
      if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !data.user) {
        await recordAttempt(database, request, mode, email, false, 'Invalid credentials');
        const count = await getRecentFailedAttempts(database, ip);
        await maybeRecordBruteForceThreat(database, request, count, threshold);
        return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
      }

      const { data: staffData, error: staffError } = await database
        .from('staff')
        .select('role, supplier_id, can_view_revenue, can_manage_inventory, can_manage_orders, can_execute_payouts, can_view_audit_logs, can_manage_settings, can_manage_staff, can_view_sensitive_data, can_manage_communications, can_manage_marketing, can_manage_kitchen')
        .eq('id', data.user.id)
        .maybeSingle();

      if (staffError || !staffData) {
        await recordAttempt(database, request, mode, email, false, 'Authenticated account is not authorized as staff');
        const count = await getRecentFailedAttempts(database, ip);
        await maybeRecordBruteForceThreat(database, request, count, threshold);
        return NextResponse.json({ error: 'Access denied. This account has no staff permissions.' }, { status: 403 });
      }
      const role = normalizeRole(staffData.role);
      await recordAttempt(database, request, mode, email, true, 'Authenticated');
      return await createLoginResponse(
        role,
        staffPermissions(staffData, role),
        email,
        typeof staffData.supplier_id === 'string' ? staffData.supplier_id : null
      );
    }

    if (mode === 'staff_pin') {
      if (!email || !password) return NextResponse.json({ error: 'Email and PIN are required.' }, { status: 400 });
      const { data: staffData, error: staffError } = await database
        .from('staff')
        .select('id, email, role, pin, supplier_id, can_view_revenue, can_manage_inventory, can_manage_orders, can_execute_payouts, can_view_audit_logs, can_manage_settings, can_manage_staff, can_view_sensitive_data, can_manage_communications, can_manage_marketing, can_manage_kitchen')
        .eq('email', email)
        .maybeSingle();

      if (staffError) throw new Error(`Could not check staff account: ${staffError.message}`);
      if (!staffData || !staffData.pin || !await matchesSecret(password, staffData.pin)) {
        await recordAttempt(database, request, mode, email, false, 'Invalid staff account or PIN');
        const count = await getRecentFailedAttempts(database, ip);
        await maybeRecordBruteForceThreat(database, request, count, threshold);
        return NextResponse.json({ error: 'Incorrect PIN or unauthorized account.' }, { status: 401 });
      }

      const role = normalizeRole(staffData.role);
      await recordAttempt(database, request, mode, email, true, 'Authenticated');
      return await createLoginResponse(
        role,
        staffPermissions(staffData, role),
        staffData.email,
        typeof staffData.supplier_id === 'string' ? staffData.supplier_id : null
      );
    }

    if (!phone || !password) return NextResponse.json({ error: 'Phone and PIN are required.' }, { status: 400 });
    const digits = phone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('254') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
    const phoneVariants = [...new Set([phone, digits, normalizedPhone, `0${normalizedPhone}`, `254${normalizedPhone}`, `+254${normalizedPhone}`])];
    const { data: matchingRiders, error: riderError } = await database
      .rpc('verify_rider_pin', { phone_variants_input: phoneVariants, pin_input: password });
    if (riderError) throw new Error(`Could not check rider account: ${riderError.message}`);
    const rider = matchingRiders?.[0];

    if (!rider || rider.verification_status !== 'Verified') {
      await recordAttempt(database, request, mode, normalizedPhone, false, 'Invalid or unverified rider account');
      const count = await getRecentFailedAttempts(database, ip);
      await maybeRecordBruteForceThreat(database, request, count, threshold);
      return NextResponse.json({ error: 'Invalid PIN or rider account is not verified.' }, { status: 401 });
    }

    await recordAttempt(database, request, mode, normalizedPhone, true, 'Authenticated');
    return NextResponse.json({ ok: true, role: 'rider' });
  } catch (error) {
    return serverError(error);
  }
}
