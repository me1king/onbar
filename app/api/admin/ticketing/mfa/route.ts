import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  createTicketingTotpSecret,
  decryptTicketingTotpSecret,
  encryptTicketingTotpSecret,
  ticketingTotpProvisioningUri,
  verifyTicketingTotp
} from '@/lib/ticketing/adminMfa.server';

export const dynamic = 'force-dynamic';

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { session: null, response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (session.role.toLowerCase() !== 'owner') {
    return { session: null, response: NextResponse.json({ error: 'Only the Online Bar platform owner can manage Ticketing MFA.' }, { status: 403 }) };
  }
  const email = process.env.TICKETING_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || session.email?.trim().toLowerCase() !== email) {
    return { session: null, response: NextResponse.json({ error: 'The signed-in owner must match TICKETING_ADMIN_EMAIL before managing Ticketing MFA.' }, { status: 403 }) };
  }
  return { session, response: null, email };
}

export async function GET() {
  const { response, email } = await authorize();
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });
  const { data, error } = await database.from('ticketing_admin_mfa')
    .select('active')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    console.error('[TicketingMFA] Could not load enrollment status:', error);
    return NextResponse.json({ error: 'Ticketing authenticator status could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({ active: data?.active === true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { response, email } = await authorize();
  if (response) return response;
  let body: { action?: unknown; code?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid authenticator request is required.' }, { status: 400 });
  }
  if (body.action !== 'setup' && body.action !== 'verify') {
    return NextResponse.json({ error: 'Choose authenticator setup or verification.' }, { status: 400 });
  }
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  try {
    const rateBucket = createHash('sha256')
      .update(`onlinebar-ticketing-mfa:${body.action}:${email}`)
      .digest('hex');
    const { data: allowed, error: rateError } = await database.rpc('ticketing_consume_rate_limit', {
      p_bucket_hash: rateBucket,
      p_max_attempts: body.action === 'setup' ? 3 : 8,
      p_window_seconds: 300
    });
    if (rateError) throw rateError;
    if (allowed !== true) {
      return NextResponse.json({ error: 'Too many authenticator attempts. Wait five minutes before trying again.' }, { status: 429 });
    }
    const { data: record, error } = await database.from('ticketing_admin_mfa')
      .select('active,encrypted_secret')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (record?.active) return NextResponse.json({ error: 'A Ticketing authenticator is already active.' }, { status: 409 });

    if (body.action === 'setup') {
      if ((process.env.TICKETING_MFA_ENCRYPTION_KEY?.trim().length || 0) < 32) {
        return NextResponse.json({ error: 'Configure TICKETING_MFA_ENCRYPTION_KEY with at least 32 characters on Online Bar before setup.' }, { status: 503 });
      }
      const secret = typeof record?.encrypted_secret === 'string'
        ? decryptTicketingTotpSecret(record.encrypted_secret)
        : createTicketingTotpSecret();
      if (!record) {
        const { error: saveError } = await database.from('ticketing_admin_mfa').insert({
          email,
          encrypted_secret: encryptTicketingTotpSecret(secret),
          active: false,
          last_verified_step: null,
          updated_at: new Date().toISOString()
        });
        if (saveError && saveError.code !== '23505') throw saveError;
        if (saveError?.code === '23505') {
          const { data: raced, error: reloadError } = await database.from('ticketing_admin_mfa')
            .select('active,encrypted_secret')
            .eq('email', email)
            .maybeSingle();
          if (reloadError) throw reloadError;
          if (raced?.active) return NextResponse.json({ error: 'A Ticketing authenticator is already active.' }, { status: 409 });
          if (typeof raced?.encrypted_secret !== 'string') throw saveError;
          return NextResponse.json({
            provisioningUri: ticketingTotpProvisioningUri(email, decryptTicketingTotpSecret(raced.encrypted_secret)),
            secret: decryptTicketingTotpSecret(raced.encrypted_secret)
          }, { headers: { 'Cache-Control': 'no-store' } });
        }
      }
      return NextResponse.json({
        provisioningUri: ticketingTotpProvisioningUri(email, secret),
        secret
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      return NextResponse.json({ error: 'Enter the six-digit code from your authenticator app.' }, { status: 400 });
    }
    if (typeof record?.encrypted_secret !== 'string') {
      return NextResponse.json({ error: 'Start authenticator setup before verifying a code.' }, { status: 409 });
    }
    const step = verifyTicketingTotp(decryptTicketingTotpSecret(record.encrypted_secret), body.code);
    if (step === null) return NextResponse.json({ error: 'That authenticator code is invalid or expired.' }, { status: 401 });
    const { data: accepted, error: consumeError } = await database.rpc('ticketing_consume_admin_mfa_step', {
      p_email: email,
      p_step: step,
      p_activate: true
    });
    if (consumeError) throw consumeError;
    if (accepted !== true) return NextResponse.json({ error: 'This authenticator code was already used. Wait for a new code and try again.' }, { status: 409 });
    return NextResponse.json({ active: true });
  } catch (cause) {
    console.error('[TicketingMFA] Could not complete authenticator management:', cause);
    return NextResponse.json({ error: 'Ticketing authenticator management failed. Confirm the MFA migration and server configuration.' }, { status: 503 });
  }
}
