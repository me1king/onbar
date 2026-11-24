import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[17]\d{8}$/.test(digits) ? `254${digits}` : null;
}

function unavailable(error?: unknown) {
  if (error) console.error('[RiderMerchantInvites] Request failed:', error);
  return NextResponse.json({
    error: 'Merchant rider connections are not installed. Apply supabase/MERCHANT_OPERATIONS_MIGRATION.sql, DISPATCH_MIGRATION.sql, and MERCHANT_RIDER_CONNECTIONS_MIGRATION.sql.'
  }, { status: 503 });
}

function migrationMissing(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || /merchant_rider_invites|rider_status|merchant_applications/i.test(error.message || '');
}

function databaseFailure(error: { code?: string; message?: string }, message: string) {
  if (migrationMissing(error)) return unavailable();
  console.error('[RiderMerchantInvites] Could not complete rider connection request:', error);
  return NextResponse.json({ error: message }, { status: 503 });
}

async function getRider(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return { response: NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 }) };
  const database = getDatabase();
  if (!database) return { response: NextResponse.json({ error: 'Rider services are not configured.' }, { status: 503 }) };
  const phone = normalizePhone(session.phone);
  if (!phone) return { response: NextResponse.json({ error: 'Your rider profile has an invalid phone number.' }, { status: 403 }) };
  const { data: rider, error } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', phone)
    .maybeSingle();
  if (error) return { response: databaseFailure(error, 'Your rider verification could not be checked. Please try again.') };
  if (!rider || rider.verification_status !== 'Verified') {
    return { response: NextResponse.json({ error: 'Only verified riders can manage business connections.' }, { status: 403 }) };
  }
  return { database, phone };
}

export async function GET(request: Request) {
  const access = await getRider(request);
  if ('response' in access) return access.response;

  const { data, error } = await access.database.from('merchant_rider_invites')
    .select('id,application_id,status,created_at,accepted_at,merchant:merchant_applications(business_name,town,county)')
    .eq('rider_phone', access.phone)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });
  if (error) return databaseFailure(error, 'Merchant invitations could not be loaded. Please try again.');
  const connections = (data || []).map(invite => {
    const business = Array.isArray(invite.merchant) ? invite.merchant[0] : invite.merchant;
    return {
      id: invite.id,
      applicationId: invite.application_id,
      status: invite.status,
      createdAt: invite.created_at,
      acceptedAt: invite.accepted_at,
      businessName: business?.business_name || 'Merchant',
      town: business?.town || '',
      county: business?.county || ''
    };
  });
  return NextResponse.json({ connections }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  const access = await getRider(request);
  if ('response' in access) return access.response;

  let body: { inviteId?: unknown; decision?: unknown };
  try {
    body = await request.json() as { inviteId?: unknown; decision?: unknown };
  } catch {
    return NextResponse.json({ error: 'Choose whether to accept or decline the merchant connection.' }, { status: 400 });
  }
  const inviteId = typeof body.inviteId === 'string' ? body.inviteId : '';
  const decision = body.decision;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteId)
    || !['accept', 'decline'].includes(String(decision))) {
    return NextResponse.json({ error: 'Choose a valid merchant invitation and response.' }, { status: 400 });
  }

  const { data, error } = await access.database.from('merchant_rider_invites')
    .update({
      status: decision === 'accept' ? 'accepted' : 'declined',
      accepted_at: decision === 'accept' ? new Date().toISOString() : null
    })
    .eq('id', inviteId)
    .eq('rider_phone', access.phone)
    .eq('status', 'pending')
    .select('id,status')
    .maybeSingle();
  if (error) return databaseFailure(error, 'Your response could not be saved. Please try again.');
  if (!data) return NextResponse.json({ error: 'This invitation is no longer available for your verified rider account.' }, { status: 409 });
  return NextResponse.json({ connection: data }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
