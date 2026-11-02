import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  return url && serviceKey && publicKey ? { url, serviceKey, publicKey } : null;
}

async function getOwner(request: Request) {
  const configuration = getConfiguration();
  if (!configuration) {
    return { response: NextResponse.json({ error: 'Merchant business management is not configured.' }, { status: 503 }) };
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: 'Sign in to manage business locations.' }, { status: 401 }) };

  const auth = createClient(configuration.url, configuration.publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) {
    return { response: NextResponse.json({ error: 'Your sign-in session is invalid. Sign in again.' }, { status: 401 }) };
  }
  if (!data.user.email || !data.user.email_confirmed_at) {
    return { response: NextResponse.json({ error: 'Verify your account email before managing business locations.' }, { status: 403 }) };
  }
  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return { database, user: data.user };
}

function migrationError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || /business_id|merchant_businesses|merchant_business_branch_invites|set_merchant_business_location_availability|create_merchant_business_for_owner/i.test(error.message || '')
  ));
}

function unavailable(error: unknown) {
  console.error('[MerchantBusiness] Business location operation failed:', error);
  return NextResponse.json({
    error: 'Merchant business management is not installed or temporarily unavailable. Apply supabase/MERCHANT_BUSINESS_BRANCHES_MIGRATION.sql.'
  }, { status: 503 });
}

export async function GET(request: Request) {
  const owner = await getOwner(request);
  if ('response' in owner) return owner.response;

  const { data: business, error: businessError } = await owner.database
    .from('merchant_businesses')
    .select('id,business_name,business_type')
    .eq('owner_user_id', owner.user.id)
    .maybeSingle();
  if (businessError) return unavailable(businessError);

  if (!business) {
    const emailPattern = owner.user.email!.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
    const { data: applications, error: applicationError } = await owner.database
      .from('merchant_applications')
      .select('id,business_name,business_type,county,town')
      .eq('status', 'approved')
      .ilike('email', emailPattern)
      .is('business_id', null)
      .order('reviewed_at', { ascending: false })
      .limit(20);
    if (applicationError) return unavailable(applicationError);
    return NextResponse.json({ business: null, eligibleLocations: applications || [] }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  }

  const { data: locations, error: locationError } = await owner.database
    .from('merchant_applications')
    .select('id,business_name,trading_name,business_type,status,accepting_orders,county,town,address,phone,reviewed_at,created_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (locationError) return unavailable(locationError);

  const locationIds = (locations || []).map(location => location.id);
  const orderCounts = new Map<string, number>();
  if (locationIds.length) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const { data: events, error: eventError } = await owner.database
      .from('merchant_fulfillment_events')
      .select('application_id,order_id')
      .in('application_id', locationIds)
      .gte('created_at', since.toISOString())
      .limit(10000);
    if (eventError) return unavailable(eventError);
    const ordersByLocation = new Map<string, Set<number>>();
    for (const event of events || []) {
      const orders = ordersByLocation.get(event.application_id) || new Set<number>();
      orders.add(Number(event.order_id));
      ordersByLocation.set(event.application_id, orders);
    }
    for (const [applicationId, orders] of ordersByLocation) orderCounts.set(applicationId, orders.size);
  }

  return NextResponse.json({
    business,
    locations: (locations || []).map(location => ({
      ...location,
      orders_last_7_days: orderCounts.get(location.id) || 0
    }))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const owner = await getOwner(request);
  if ('response' in owner) return owner.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid business location action.' }, { status: 400 });
  }

  if (body.action === 'register') {
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      return NextResponse.json({ error: 'Select an approved location to register this business account.' }, { status: 400 });
    }
    const { data, error } = await owner.database.rpc('create_merchant_business_for_owner', {
      p_owner_user_id: owner.user.id,
      p_owner_email: owner.user.email!.trim().toLowerCase(),
      p_application_id: applicationId
    });
    if (error) {
      if (error.message.includes('Choose an approved location')) {
        return NextResponse.json({ error: 'Choose an approved location associated with your verified account email.' }, { status: 403 });
      }
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: 'A business account already exists for this owner. Refresh the page.' }, { status: 409 });
      }
      if (migrationError(error)) return unavailable(error);
      console.error('[MerchantBusiness] Could not register business owner:', error);
      return NextResponse.json({ error: 'Could not create your business account.' }, { status: 503 });
    }
    return NextResponse.json({ business: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.action === 'invite-branch') {
    const { data: business, error: businessError } = await owner.database
      .from('merchant_businesses')
      .select('id')
      .eq('owner_user_id', owner.user.id)
      .maybeSingle();
    if (businessError) return unavailable(businessError);
    if (!business) return NextResponse.json({ error: 'Register your approved business location before adding branches.' }, { status: 409 });

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: inviteError } = await owner.database.from('merchant_business_branch_invites').insert({
      business_id: business.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: owner.user.id
    });
    if (inviteError) return unavailable(inviteError);
    return NextResponse.json({
      onboardingUrl: `/merchant/onboarding?invite=${encodeURIComponent(token)}`,
      expiresAt
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ error: 'Choose a supported business location action.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const owner = await getOwner(request);
  if ('response' in owner) return owner.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid location update.' }, { status: 400 });
  }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)
      || typeof body.acceptingOrders !== 'boolean') {
    return NextResponse.json({ error: 'Choose a valid location and availability state.' }, { status: 400 });
  }

  const { data: business, error: businessError } = await owner.database
    .from('merchant_businesses')
    .select('id')
    .eq('owner_user_id', owner.user.id)
    .maybeSingle();
  if (businessError) return unavailable(businessError);
  if (!business) return NextResponse.json({ error: 'Register an approved business location first.' }, { status: 403 });

  const { error } = await owner.database.rpc('set_merchant_business_location_availability', {
    p_owner_user_id: owner.user.id,
    p_business_id: business.id,
    p_application_id: applicationId,
    p_accepting_orders: body.acceptingOrders
  });
  if (error) {
    if (error.message.includes('Only an approved location')) {
      return NextResponse.json({ error: 'Only approved locations can be paused or resumed.' }, { status: 409 });
    }
    if (migrationError(error)) return unavailable(error);
    console.error('[MerchantBusiness] Could not update location availability:', error);
    return NextResponse.json({ error: 'Location availability could not be updated.' }, { status: 503 });
  }
  return NextResponse.json({ updated: true, acceptingOrders: body.acceptingOrders }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
