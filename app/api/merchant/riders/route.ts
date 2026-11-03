import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isWebPushConfigured, sendWebPush } from '@/lib/webPush.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Clients = {
  auth: SupabaseClient;
  database: SupabaseClient;
};

function getClients(): Clients | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[17]\d{8}$/.test(digits) ? digits : null;
}

function migrationMissing(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || /merchant_rider_invites/i.test(error.message || '');
}

function unavailable(error?: unknown) {
  if (error) console.error('[MerchantRiders] Rider connection request failed:', error);
  return NextResponse.json({
    error: 'Merchant rider connections are not installed. Apply supabase/MERCHANT_RIDER_CONNECTIONS_MIGRATION.sql.'
  }, { status: 503 });
}

function databaseFailure(error: { code?: string; message?: string }, message: string) {
  if (migrationMissing(error)) return unavailable();
  console.error('[MerchantRiders] Could not complete rider connection request:', error);
  return NextResponse.json({ error: message }, { status: 503 });
}

async function getAccess(request: Request) {
  const clients = getClients();
  if (!clients) {
    return { response: NextResponse.json({ error: 'Merchant rider management is not configured.' }, { status: 503 }) };
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: 'Sign in to manage your riders.' }, { status: 401 }) };
  const { data, error } = await clients.auth.auth.getUser(token);
  const user = data.user;
  if (error || !user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
    return { response: NextResponse.json({ error: 'Sign in with a verified merchant account.' }, { status: 401 }) };
  }

  const applicationId = new URL(request.url).searchParams.get('applicationId') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return { response: NextResponse.json({ error: 'Select a valid business location.' }, { status: 400 }) };
  }
  const { data: application, error: applicationError } = await clients.database
    .from('merchant_applications')
    .select('id,business_name,status')
    .eq('id', applicationId)
    .eq('email', user.email.toLowerCase())
    .maybeSingle();
  if (applicationError) {
    console.error('[MerchantRiders] Could not verify business ownership:', applicationError);
    return { response: NextResponse.json({ error: 'Your business access could not be verified.' }, { status: 503 }) };
  }
  if (!application) return { response: NextResponse.json({ error: 'That business is not linked to your verified account.' }, { status: 404 }) };
  if (application.status !== 'approved') {
    return { response: NextResponse.json({ error: 'Only approved businesses can connect riders.' }, { status: 403 }) };
  }
  return { database: clients.database, application, actor: user.email.toLowerCase() };
}

export async function GET(request: Request) {
  const access = await getAccess(request);
  if ('response' in access) return access.response;

  const { data: invites, error } = await access.database.from('merchant_rider_invites')
    .select('id,rider_phone,status,created_at,accepted_at')
    .eq('application_id', access.application.id)
    .order('created_at', { ascending: false });
  if (error) return databaseFailure(error, 'Rider connections could not be loaded. Please try again.');

  const phones = [...new Set((invites || []).map(invite => invite.rider_phone))];
  const { data: riderRows, error: ridersError } = phones.length
    ? await access.database.from('rider_status')
      .select('rider_phone,rider_name,verification_status')
      .in('rider_phone', phones)
    : { data: [], error: null };
  if (ridersError) return databaseFailure(ridersError, 'Rider profiles could not be loaded. Please try again.');
  const ridersByPhone = new Map((riderRows || []).map(rider => [rider.rider_phone, rider]));

  return NextResponse.json({
    businessName: access.application.business_name,
    riders: (invites || []).map(invite => {
      const rider = ridersByPhone.get(invite.rider_phone);
      return {
        id: invite.id,
        phone: invite.rider_phone,
        name: rider?.rider_name || null,
        verificationStatus: rider?.verification_status || null,
        status: invite.status,
        createdAt: invite.created_at,
        acceptedAt: invite.accepted_at
      };
    })
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const access = await getAccess(request);
  if ('response' in access) return access.response;

  let body: { phone?: unknown };
  try {
    body = await request.json() as { phone?: unknown };
  } catch {
    return NextResponse.json({ error: 'Enter the rider’s Kenyan phone number.' }, { status: 400 });
  }
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  if (!phone) return NextResponse.json({ error: 'Enter a valid Kenyan mobile number, such as 0712345678.' }, { status: 400 });

  const { data: existing, error: existingError } = await access.database.from('merchant_rider_invites')
    .select('id,status')
    .eq('application_id', access.application.id)
    .eq('rider_phone', phone)
    .maybeSingle();
  if (existingError) return databaseFailure(existingError, 'The existing rider connection could not be checked.');
  if (existing?.status === 'accepted') {
    return NextResponse.json({ error: 'This rider is already connected to your business.' }, { status: 409 });
  }

  const saved = existing
    ? await access.database.from('merchant_rider_invites')
      .update({ status: 'pending', created_by: access.actor, accepted_at: null })
      .eq('id', existing.id)
      .select('id,rider_phone,status,created_at,accepted_at')
      .single()
    : await access.database.from('merchant_rider_invites')
      .insert({
        application_id: access.application.id,
        rider_phone: phone,
        status: 'pending',
        created_by: access.actor
      })
      .select('id,rider_phone,status,created_at,accepted_at')
      .single();
  if (saved.error) return databaseFailure(saved.error, 'The rider invitation could not be saved. Please try again.');

  const { data: rider, error: riderError } = await access.database.from('rider_status')
    .select('rider_name,verification_status')
    .eq('rider_phone', phone)
    .maybeSingle();
  if (riderError) return databaseFailure(riderError, 'The rider verification status could not be checked.');
  let notificationSent = false;
  let notificationWarning: string | null = null;
  if (rider?.verification_status === 'Verified' && isWebPushConfigured()) {
    const { data: subscriptions, error: subscriptionError } = await access.database.from('rider_push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('rider_phone', phone);
    if (subscriptionError) {
      console.error('[MerchantRiders] Could not load rider notification devices:', subscriptionError);
      notificationWarning = 'The invitation was saved, but push delivery could not be checked. Ask the rider to open their Rider Terminal and refresh connections.';
    } else if (subscriptions?.length) {
      const results = await Promise.allSettled(subscriptions.map(subscription =>
        sendWebPush(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          {
            title: `Rider invitation from ${access.application.business_name}`,
            body: 'Open Rider Terminal to review this merchant connection request.',
            url: '/rider/dashboard',
            tag: `merchant-rider-invite-${saved.data.id}`,
            requireInteraction: true
          },
          3600
        )
      ));
      notificationSent = results.some(result => result.status === 'fulfilled');
      if (!notificationSent) {
        console.error('[MerchantRiders] Could not deliver push invitation to rider devices.');
        notificationWarning = 'The invitation was saved, but push delivery failed. Ask the rider to open their Rider Terminal and refresh connections.';
      }
    } else {
      notificationWarning = 'The invitation was saved, but this rider has no registered push device. Ask them to open Rider Terminal and refresh connections.';
    }
  } else if (rider?.verification_status === 'Verified') {
    notificationWarning = 'The invitation was saved, but push notifications are not configured. Ask the rider to open Rider Terminal and refresh connections.';
  }
  return NextResponse.json({
    rider: {
      id: saved.data.id,
      phone,
      name: rider?.rider_name || null,
      verificationStatus: rider?.verification_status || null,
      status: saved.data.status,
      createdAt: saved.data.created_at,
      acceptedAt: saved.data.accepted_at
    },
    notificationSent,
    ...(notificationWarning ? { notificationWarning } : {})
  }, { status: existing ? 200 : 201, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function DELETE(request: Request) {
  const access = await getAccess(request);
  if ('response' in access) return access.response;

  let body: { inviteId?: unknown };
  try {
    body = await request.json() as { inviteId?: unknown };
  } catch {
    return NextResponse.json({ error: 'Choose a rider connection to remove.' }, { status: 400 });
  }
  const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteId)) {
    return NextResponse.json({ error: 'Choose a valid rider connection.' }, { status: 400 });
  }
  const { data, error } = await access.database.from('merchant_rider_invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('application_id', access.application.id)
    .in('status', ['pending', 'accepted'])
    .select('id')
    .maybeSingle();
  if (error) return databaseFailure(error, 'The rider connection could not be removed. Please try again.');
  if (!data) return NextResponse.json({ error: 'This rider connection was already removed or does not belong to your business.' }, { status: 409 });
  return NextResponse.json({ removed: true }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
