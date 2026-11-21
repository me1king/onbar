import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import {
  getDarajaCredentials,
  getStoredDarajaConfiguration,
  initializeDarajaB2cPayout,
  verifyDarajaCredentials
} from '@/lib/darajaPayments.server';
import { decryptMerchantPayoutDestination } from '@/lib/merchantPayoutSecurity.server';
import { getPublicBaseUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function authorize(request?: Request) {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_execute_payouts')) {
    return { response: NextResponse.json({ error: 'Merchant settlement finance permission required.' }, { status: 403 }) };
  }
  if (request && !isSameOriginRequest(request)) {
    return { response: NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 }) };
  }
  return { database, session, actor: session.email || `admin:${session.role}` };
}

async function getProviderStatus(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const missing: string[] = [];
  if (process.env.DARAJA_B2C_ENABLED?.trim().toLowerCase() !== 'true') missing.push('DARAJA_B2C_ENABLED=true');
  if (!process.env.DARAJA_B2C_INITIATOR_NAME?.trim()) missing.push('DARAJA_B2C_INITIATOR_NAME');
  if (!process.env.DARAJA_B2C_SECURITY_CREDENTIAL?.trim()) missing.push('DARAJA_B2C_SECURITY_CREDENTIAL');
  const maximum = Number(process.env.DARAJA_B2C_MAX_AMOUNT_KES?.trim() || 250000);
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 250000) missing.push('valid DARAJA_B2C_MAX_AMOUNT_KES');
  const encryptionKey = Buffer.from(process.env.MERCHANT_PAYOUT_DATA_ENCRYPTION_KEY?.trim() || '', 'base64');
  if (encryptionKey.length !== 32) missing.push('MERCHANT_PAYOUT_DATA_ENCRYPTION_KEY');

  let darajaConfigured = false;
  try {
    darajaConfigured = (await getStoredDarajaConfiguration(database)).configured;
  } catch (error) {
    console.error('[MerchantSettlementsAdmin] Could not verify Daraja configuration:', error);
  }
  if (!darajaConfigured) missing.push('verified Daraja checkout credentials');
  return { configured: missing.length === 0, missing };
}

function parseBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rpcStatus(message: string) {
  return /not found|not a requested|only an approved|not verified|below the configured minimum|already being/i.test(message)
    ? 409
    : 400;
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const [{ data: applications, error: applicationError }, { data: policies, error: policyError },
    { data: destinations, error: destinationError }, { data: settlements, error: settlementError }] = await Promise.all([
    access.database.from('merchant_applications')
      .select('id, merchant_code, business_name, email, status')
      .eq('status', 'approved')
      .order('business_name', { ascending: true })
      .limit(1000),
    access.database.from('merchant_settlement_policies')
      .select('id, application_id, version, merchant_share_bps, minimum_payout_kes, is_active, effective_from')
      .eq('is_active', true)
      .is('effective_until', null)
      .order('version', { ascending: false }),
    access.database.from('merchant_payout_destinations')
      .select('id, application_id, method, masked_account, verification_status, is_current, created_at')
      .eq('is_current', true)
      .order('created_at', { ascending: false }),
    access.database.from('merchant_settlements')
      .select('id, application_id, destination_id, amount_kes, status, requested_by, approved_by, provider_reference, mpesa_receipt, failure_message, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(500)
  ]);
  const queryError = applicationError || policyError || destinationError || settlementError;
  if (queryError) {
    console.error('[MerchantSettlementsAdmin] Could not load merchant settlement data:', queryError);
    return NextResponse.json({
      error: /merchant_settlement|schema cache/i.test(queryError.message)
        ? 'Merchant settlement storage is not installed. Apply supabase/MERCHANT_SETTLEMENTS_MIGRATION.sql.'
        : 'Merchant settlement data could not be loaded.'
    }, { status: 503 });
  }

  const policyByApplication = new Map((policies || []).map(policy => [policy.application_id, policy]));
  const destinationById = new Map((destinations || []).map(destination => [destination.id, destination]));
  const applicationById = new Map((applications || []).map(application => [application.id, application]));
  const provider = await getProviderStatus(access.database);
  return NextResponse.json({
    applications: (applications || []).map(application => ({
      ...application,
      policy: policyByApplication.get(application.id) || null,
      destination: (destinations || []).find(destination => destination.application_id === application.id) || null
    })),
    settlements: (settlements || []).map(settlement => ({
      ...settlement,
      businessName: applicationById.get(settlement.application_id)?.business_name || 'Merchant',
      merchantCode: applicationById.get(settlement.application_id)?.merchant_code || null,
      destination: destinationById.get(settlement.destination_id) || null
    })),
    provider
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  const access = await authorize(request);
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed = parseBody(await request.json());
    if (!parsed) return NextResponse.json({ error: 'A valid settlement action is required.' }, { status: 400 });
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'A valid settlement action is required.' }, { status: 400 });
  }

  const action = body.action;
  if (action === 'set_policy') {
    if (!isUuid(body.applicationId)
        || !Number.isSafeInteger(body.merchantShareBps)
        || Number(body.merchantShareBps) < 1 || Number(body.merchantShareBps) > 10000
        || !Number.isSafeInteger(body.minimumPayoutKes)
        || Number(body.minimumPayoutKes) < 1 || Number(body.minimumPayoutKes) > 250000
        || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Enter a seller share from 0.01% to 100%, a payout minimum up to KES 250,000, and an enabled state.' }, { status: 400 });
    }
    const { data, error } = await access.database.rpc('set_merchant_settlement_policy', {
      p_application_id: body.applicationId,
      p_merchant_share_bps: Number(body.merchantShareBps),
      p_minimum_payout_kes: Number(body.minimumPayoutKes),
      p_enabled: body.enabled,
      p_actor: access.actor
    });
    if (error) {
      console.error('[MerchantSettlementsAdmin] Could not update merchant payout policy:', error);
      return NextResponse.json({ error: 'The merchant payout policy could not be saved.' }, { status: rpcStatus(error.message) });
    }
    return NextResponse.json({ policy: data });
  }

  if (action === 'generate_payables') {
    if (!isUuid(body.applicationId)) {
      return NextResponse.json({ error: 'Choose a valid merchant business.' }, { status: 400 });
    }
    const { data, error } = await access.database.rpc('generate_merchant_payables', {
      p_application_id: body.applicationId,
      p_actor: access.actor
    });
    if (error) {
      console.error('[MerchantSettlementsAdmin] Could not generate merchant payables:', error);
      return NextResponse.json({ error: 'Verified delivered orders could not be reconciled.' }, { status: rpcStatus(error.message) });
    }
    return NextResponse.json({ insertedCount: data });
  }

  if (action === 'review_destination') {
    if (!isUuid(body.destinationId)
        || (body.decision !== 'verify' && body.decision !== 'reject')
        || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 1000))) {
      return NextResponse.json({ error: 'Provide a valid payout destination decision and optional note.' }, { status: 400 });
    }
    const { data, error } = await access.database.rpc('review_merchant_payout_destination', {
      p_destination_id: body.destinationId,
      p_action: body.decision,
      p_actor: access.actor,
      p_note: typeof body.note === 'string' ? body.note : null
    });
    if (error) {
      console.error('[MerchantSettlementsAdmin] Could not review payout destination:', error);
      return NextResponse.json({ error: 'The payout destination review could not be saved.' }, { status: rpcStatus(error.message) });
    }
    return NextResponse.json({ destination: data });
  }

  if (action === 'review_settlement') {
    if (!isUuid(body.settlementId)
        || (body.decision !== 'approve' && body.decision !== 'reject')
        || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 1000))) {
      return NextResponse.json({ error: 'Provide a valid payout request decision and optional note.' }, { status: 400 });
    }
    const { data, error } = await access.database.rpc('review_merchant_settlement', {
      p_settlement_id: body.settlementId,
      p_action: body.decision,
      p_actor: access.actor,
      p_note: typeof body.note === 'string' ? body.note : null
    });
    if (error) {
      console.error('[MerchantSettlementsAdmin] Could not review payout request:', error);
      return NextResponse.json({ error: 'The payout request review could not be saved.' }, { status: rpcStatus(error.message) });
    }
    return NextResponse.json({ settlement: data });
  }

  if (action === 'adjustment') {
    const amount = Number(body.amountKes);
    if (!isUuid(body.applicationId)
        || !isUuid(body.idempotencyKey)
        || typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 500
        || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000000
        || Math.round(amount * 100) !== amount * 100) {
      return NextResponse.json({ error: 'Enter a non-zero adjustment up to KES 10,000,000 with a reason of 5–500 characters.' }, { status: 400 });
    }
    const idempotencyKey = `finance-adjustment:${body.idempotencyKey}`;
    const { data, error } = await access.database.rpc('create_merchant_settlement_adjustment', {
      p_application_id: body.applicationId,
      p_amount_kes: amount,
      p_idempotency_key: idempotencyKey,
      p_reason: body.reason.trim(),
      p_actor: access.actor
    });
    if (error) {
      console.error('[MerchantSettlementsAdmin] Could not record merchant settlement adjustment:', error);
      return NextResponse.json({ error: 'The settlement adjustment could not be recorded.' }, { status: rpcStatus(error.message) });
    }
    return NextResponse.json({ adjustment: data }, { status: 201 });
  }

  if (action === 'execute_payout') {
    if (!isUuid(body.settlementId)) {
      return NextResponse.json({ error: 'Choose a valid approved payout request.' }, { status: 400 });
    }
    const provider = await getProviderStatus(access.database);
    if (!provider.configured) {
      return NextResponse.json({
        error: 'No payout was sent. Complete Daraja B2C configuration before enabling transfers.',
        missingConfiguration: provider.missing
      }, { status: 503 });
    }
    const { data: payout, error: payoutError } = await access.database
      .from('merchant_settlements')
      .select('id, application_id, destination_id, amount_kes, status')
      .eq('id', body.settlementId)
      .maybeSingle();
    if (payoutError || !payout) {
      if (payoutError) console.error('[MerchantSettlementsAdmin] Could not load approved payout:', payoutError);
      return NextResponse.json({ error: 'The approved payout request could not be loaded.' }, { status: payoutError ? 503 : 404 });
    }
    if (payout.status !== 'approved') {
      return NextResponse.json({ error: 'Only an approved payout request can be sent.' }, { status: 409 });
    }
    const { data: destination, error: destinationError } = await access.database
      .from('merchant_payout_destinations')
      .select('encrypted_account, verification_status, is_current')
      .eq('id', payout.destination_id)
      .eq('application_id', payout.application_id)
      .maybeSingle();
    if (destinationError || !destination || destination.verification_status !== 'verified' || !destination.is_current) {
      if (destinationError) console.error('[MerchantSettlementsAdmin] Could not verify approved payout destination:', destinationError);
      return NextResponse.json({ error: 'The current verified payout destination could not be confirmed.' }, { status: 409 });
    }

    let phone: string;
    try {
      phone = decryptMerchantPayoutDestination(destination.encrypted_account);
    } catch (error) {
      console.error('[MerchantSettlementsAdmin] Could not decrypt verified payout destination:', error);
      return NextResponse.json({ error: 'The payout destination could not be decrypted. No transfer was sent.' }, { status: 503 });
    }
    const amountKsh = Number(payout.amount_kes);
    const configuredMaximum = Number(process.env.DARAJA_B2C_MAX_AMOUNT_KES?.trim() || 250000);
    if (!Number.isSafeInteger(amountKsh) || amountKsh < 1 || amountKsh > configuredMaximum) {
      return NextResponse.json({ error: 'The payout amount is invalid. No transfer was sent.' }, { status: 409 });
    }

    const callbackToken = randomBytes(32).toString('hex');
    const callbackUrl = new URL(
      `/api/mpesa/merchant-payouts/${callbackToken}`,
      getPublicBaseUrl()
    ).toString();
    if (new URL(callbackUrl).protocol !== 'https:') {
      return NextResponse.json({ error: 'A public HTTPS payout callback URL is required. No transfer was sent.' }, { status: 503 });
    }
    try {
      await verifyDarajaCredentials(await getDarajaCredentials(access.database));
    } catch (error) {
      console.error('[MerchantSettlementsAdmin] Daraja credentials could not be verified before payout:', error);
      return NextResponse.json({ error: 'Daraja credentials could not be verified. No transfer was sent.' }, { status: 503 });
    }

    const callbackTokenHash = createHash('sha256').update(callbackToken).digest('hex');
    const { data: attempt, error: beginError } = await access.database.rpc('begin_merchant_payout_attempt', {
      p_settlement_id: payout.id,
      p_callback_token_hash: callbackTokenHash,
      p_actor: access.actor
    });
    if (beginError || !attempt || typeof attempt.id !== 'string') {
      if (beginError) console.error('[MerchantSettlementsAdmin] Could not start payout attempt:', beginError);
      return NextResponse.json({ error: 'The payout could not be safely started.' }, { status: 409 });
    }

    try {
      const providerResult = await initializeDarajaB2cPayout({
        database: access.database,
        amountKsh,
        phone,
        callbackUrl,
        reference: payout.id.replaceAll('-', '').slice(0, 12)
      });
      const { error: submissionError } = await access.database.rpc('record_merchant_payout_submission', {
        p_attempt_id: attempt.id,
        p_conversation_id: providerResult.conversationId,
        p_originator_conversation_id: providerResult.originatorConversationId
      });
      if (submissionError) {
        console.error('[MerchantSettlementsAdmin] Provider accepted payout but references could not be saved:', submissionError);
        await access.database.rpc('record_merchant_payout_unknown', {
          p_attempt_id: attempt.id,
          p_message: 'Provider accepted the request; finance reconciliation is required.'
        });
      }
      return NextResponse.json({
        settlementId: payout.id,
        status: 'processing',
        message: 'Safaricom accepted the payout request. The transfer is pending its verified callback.'
      }, { status: 202 });
    } catch (error) {
      console.error('[MerchantSettlementsAdmin] Payout provider outcome is uncertain:', error);
      await access.database.rpc('record_merchant_payout_unknown', {
        p_attempt_id: attempt.id,
        p_message: 'The provider outcome is uncertain. Reconcile with Safaricom before retrying.'
      });
      return NextResponse.json({
        settlementId: payout.id,
        status: 'processing',
        error: 'The provider outcome is uncertain. The payout remains held for finance reconciliation; do not retry it.'
      }, { status: 202 });
    }
  }

  return NextResponse.json({ error: 'Unsupported merchant settlement action.' }, { status: 400 });
}
