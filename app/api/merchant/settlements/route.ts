import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  encryptMerchantPayoutDestination,
  maskMerchantPayoutDestination,
  normalizeMerchantMpesaPhone
} from '@/lib/merchantPayoutSecurity.server';

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

function validUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function settlementError(message: string) {
  if (/settlement|terms|policy/i.test(message)) return 'Merchant payout terms have not been enabled by OnBar Finance.';
  if (/destination/i.test(message)) return 'Submit and verify a current M-Pesa payout number before requesting a payout.';
  if (/minimum|available payout balance/i.test(message)) return 'Your available payout balance has not reached the configured minimum.';
  if (/already exists|duplicate key/i.test(message)) return 'A payout request is already being reviewed for this merchant.';
  return 'The settlement request could not be completed. Contact OnBar Finance.';
}

async function authorize(request: Request, applicationId: unknown) {
  const clients = getClients();
  if (!clients) {
    return { error: 'Merchant settlement access is not configured on this server.', status: 503 as const };
  }
  if (!validUuid(applicationId)) {
    return { error: 'Choose a valid merchant business.', status: 400 as const };
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: 'Sign in to view merchant settlements.', status: 401 as const };
  const { data: userData, error: userError } = await clients.auth.auth.getUser(token);
  const user = userData.user;
  const email = user?.email && user.email_confirmed_at
    ? user.email.trim().toLowerCase()
    : null;
  if (userError || !user || (!email && !user.phone_confirmed_at)) {
    return { error: 'A verified merchant account is required.', status: 401 as const };
  }

  const fields = 'id, status, email';
  const { data: linkedApplication, error: linkedError } = await clients.database
    .from('merchant_applications')
    .select(fields)
    .eq('id', applicationId)
    .eq('account_user_id', user.id)
    .maybeSingle();
  if (linkedError) {
    console.error('[MerchantSettlements] Could not verify merchant ownership:', linkedError);
    return { error: 'Your merchant access could not be verified.', status: 503 as const };
  }
  let application = linkedApplication;
  if (!application && email) {
    const { data: legacyApplication, error: legacyError } = await clients.database
      .from('merchant_applications')
      .select(fields)
      .eq('id', applicationId)
      .eq('email', email)
      .maybeSingle();
    if (legacyError) {
      console.error('[MerchantSettlements] Could not verify legacy merchant ownership:', legacyError);
      return { error: 'Your merchant access could not be verified.', status: 503 as const };
    }
    application = legacyApplication;
  }
  if (!application || application.status !== 'approved') {
    return { error: 'An approved business linked to your account is required.', status: 403 as const };
  }
  return { database: clients.database, application, actor: email || `account:${user.id}` };
}

async function loadSummary(database: SupabaseClient, applicationId: string) {
  const { data, error } = await database.rpc('get_merchant_settlement_summary', {
    p_application_id: applicationId
  });
  if (error) {
    console.error('[MerchantSettlements] Could not load merchant settlement summary:', error);
    throw new Error(/get_merchant_settlement_summary|schema cache/i.test(error.message)
      ? 'Merchant settlements are not installed. Apply supabase/MERCHANT_SETTLEMENTS_MIGRATION.sql.'
      : 'Merchant settlement records could not be loaded.');
  }
  return data;
}

export async function GET(request: Request) {
  const applicationId = new URL(request.url).searchParams.get('applicationId');
  const access = await authorize(request, applicationId);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const summary = await loadSummary(access.database, access.application.id);
    return NextResponse.json({ summary }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Merchant settlement records could not be loaded.'
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'A valid merchant settlement action is required.' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid merchant settlement action is required.' }, { status: 400 });
  }

  const access = await authorize(request, body.applicationId);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    if (body.action === 'submit_destination') {
      if (typeof body.phone !== 'string' || body.phone.length > 40) {
        return NextResponse.json({ error: 'Enter a valid Kenyan M-Pesa number.' }, { status: 400 });
      }
      const phone = normalizeMerchantMpesaPhone(body.phone);
      const encryptedAccount = encryptMerchantPayoutDestination(phone);
      const { data, error } = await access.database.rpc('submit_merchant_payout_destination', {
        p_application_id: access.application.id,
        p_encrypted_account: encryptedAccount,
        p_masked_account: maskMerchantPayoutDestination(phone),
        p_actor: access.actor
      });
      if (error) {
        console.error('[MerchantSettlements] Could not submit payout destination:', error);
        return NextResponse.json({ error: 'The payout destination could not be saved.' }, { status: 503 });
      }
      if (!data || typeof data !== 'object' || typeof data.id !== 'string') {
        console.error('[MerchantSettlements] Destination submission returned no destination identifier.');
        return NextResponse.json({ error: 'The payout destination could not be confirmed as saved.' }, { status: 503 });
      }
      return NextResponse.json({
        destination: {
          id: data.id,
          maskedAccount: maskMerchantPayoutDestination(phone),
          verificationStatus: 'pending'
        }
      }, { status: 201 });
    }

    if (body.action === 'request_payout') {
      const { data: destination, error: destinationError } = await access.database
        .from('merchant_payout_destinations')
        .select('id')
        .eq('application_id', access.application.id)
        .eq('is_current', true)
        .eq('verification_status', 'verified')
        .maybeSingle();
      if (destinationError) {
        console.error('[MerchantSettlements] Could not verify payout destination:', destinationError);
        return NextResponse.json({ error: 'The verified payout destination could not be checked.' }, { status: 503 });
      }
      if (!destination) {
        return NextResponse.json({ error: 'Submit and verify a current M-Pesa payout number before requesting a payout.' }, { status: 409 });
      }
      const { data, error } = await access.database.rpc('request_merchant_settlement', {
        p_application_id: access.application.id,
        p_destination_id: destination.id,
        p_actor: access.actor
      });
      if (error) {
        console.error('[MerchantSettlements] Could not create payout request:', error);
        return NextResponse.json({ error: settlementError(error.message) }, { status: 409 });
      }
      return NextResponse.json({ settlement: data }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported merchant settlement action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Merchant settlement action failed.';
    const status = /encryption key|payout storage/i.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
