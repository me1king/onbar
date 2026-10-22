import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createTicketCredentials } from '@/lib/ticketing/credentials.server';
import { logTicketNotificationFailures, sendTicketOrderNotifications } from '@/lib/ticketing/notifications.server';
import { verifyPayHeroTicketTransaction } from '@/lib/ticketing/payhero.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const callbackSecret = new URL(request.url).searchParams.get('key') || '';
  if (!/^[0-9a-f]{64}$/.test(callbackSecret)) {
    return NextResponse.json({ error: 'PayHero callback authentication failed.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server-side ticket payment processing is not configured.' }, { status: 503 });
  }

  let callback: unknown;
  try {
    const body = await request.text();
    if (body.length > 32_768) {
      return NextResponse.json({ error: 'PayHero callback is too large.' }, { status: 413 });
    }
    callback = JSON.parse(body) as unknown;
  } catch {
    return NextResponse.json({ error: 'A valid PayHero callback is required.' }, { status: 400 });
  }

  if (!callback || typeof callback !== 'object' || !('response' in callback)) {
    return NextResponse.json({ error: 'PayHero callback details are missing.' }, { status: 400 });
  }
  const callbackRecord = callback as { status?: unknown; response?: unknown };
  if (!callbackRecord.response || typeof callbackRecord.response !== 'object') {
    return NextResponse.json({ error: 'PayHero callback details are invalid.' }, { status: 400 });
  }
  const callbackDetails = callbackRecord.response as {
    Amount?: unknown;
    CheckoutRequestID?: unknown;
    ExternalReference?: unknown;
    ResultCode?: unknown;
    Status?: unknown;
  };
  const externalReference = typeof callbackDetails?.ExternalReference === 'string'
    ? callbackDetails.ExternalReference
    : '';
  if (!/^OBT-[A-F0-9]{32}$/.test(externalReference)) {
    return NextResponse.json({ error: 'PayHero callback reference is invalid.' }, { status: 400 });
  }

  const database = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  try {
    const { data: attempt, error: attemptError } = await database
      .from('ticketing_payment_attempts')
      .select('order_id,amount_minor,status,provider_payload')
      .eq('provider', 'payhero')
      .eq('provider_reference', externalReference)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) {
      return NextResponse.json({ received: true, message: 'No matching ticket payment.' });
    }
    const expectedCallbackSecretHash = typeof attempt.provider_payload?.callback_secret_hash === 'string'
      ? attempt.provider_payload.callback_secret_hash
      : '';
    const callbackSecretHash = createHash('sha256').update(callbackSecret).digest('hex');
    if (!/^[0-9a-f]{64}$/.test(expectedCallbackSecretHash)
        || !timingSafeEqual(Buffer.from(callbackSecretHash, 'hex'), Buffer.from(expectedCallbackSecretHash, 'hex'))) {
      return NextResponse.json({ error: 'PayHero callback authentication failed.' }, { status: 401 });
    }
    if (attempt.status === 'succeeded') {
      const delivery = await sendTicketOrderNotifications(database, attempt.order_id);
      logTicketNotificationFailures('[TicketingPayHero] Duplicate callback notification retry.', delivery);
      if (delivery.email.status === 'failed' || delivery.whatsapp.status === 'failed'
          || delivery.email.value === 'busy' || delivery.whatsapp.value === 'busy') {
        return NextResponse.json({ error: 'Ticket notification delivery failed and will be retried.' }, { status: 503 });
      }
      return NextResponse.json({ received: true, message: 'Ticket payment already processed.' });
    }
    if (attempt.status === 'reconciliation_required') {
      return NextResponse.json({ received: true, message: 'Ticket payment awaits manual reconciliation.' });
    }

    const storedReference = typeof attempt.provider_payload?.payhero_reference === 'string'
      ? attempt.provider_payload.payhero_reference
      : '';
    const storedCheckoutRequestId = typeof attempt.provider_payload?.checkout_request_id === 'string'
      ? attempt.provider_payload.checkout_request_id
      : '';
    if (!storedReference || !storedCheckoutRequestId) {
      console.error('[TicketingPayHero] Callback arrived before its transaction references were saved.', externalReference);
      return NextResponse.json({ error: 'PayHero transaction details are not ready for verification.' }, { status: 503 });
    }

    const transaction = await verifyPayHeroTicketTransaction(storedReference);
    if (transaction.reference !== storedReference
        || (transaction.CheckoutRequestID && transaction.CheckoutRequestID !== storedCheckoutRequestId)
        || (transaction.external_reference && transaction.external_reference !== externalReference)) {
      throw new Error('PayHero verification returned a different ticket payment reference.');
    }

    const { data: order, error: orderError } = await database
      .from('ticketing_orders')
      .select('id,total_minor')
      .eq('id', attempt.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error('The ticket order for this PayHero payment could not be found.');

    const transactionStatus = transaction.status?.toUpperCase() || '';
    if (transactionStatus === 'QUEUED' || transactionStatus === 'PENDING') {
      return NextResponse.json({ received: true, message: 'PayHero is still processing the M-Pesa payment.' }, { status: 202 });
    }
    if (transactionStatus === 'FAILED') {
      const { data: failure, error: failureError } = await database.rpc('ticketing_fail_payhero_checkout', {
        p_payment_reference: externalReference
      });
      if (failureError) throw failureError;
      if (!failure || !['payment_failed', 'paid', 'reconciliation_required'].includes(failure.status)) {
        throw new Error('PayHero ticket payment failure returned an invalid status.');
      }
      return NextResponse.json({ received: true, message: 'Failed ticket payment recorded.' });
    }

    if (attempt.status === 'failed' && transactionStatus === 'SUCCESS' && transaction.success === true) {
      const { error: reviewError } = await database.rpc('ticketing_flag_payment_for_review', {
        p_payment_reference: externalReference,
        p_reason: 'provider_status_mismatch'
      });
      if (reviewError) throw reviewError;
      return NextResponse.json({ received: true, message: 'Payment requires manual reconciliation.' });
    }

    if (transactionStatus !== 'SUCCESS' || transaction.success !== true) {
      return NextResponse.json({ received: true, message: 'PayHero payment status is not final yet.' }, { status: 202 });
    }

    // PayHero's documented status response confirms the transaction reference but omits its amount.
    const callbackStatusMatches = callbackRecord.status === true
      && callbackDetails.ResultCode === 0
      && typeof callbackDetails.Status === 'string'
      && callbackDetails.Status.toLowerCase() === 'success'
      && callbackDetails.CheckoutRequestID === storedCheckoutRequestId;
    const callbackAmount = typeof callbackDetails.Amount === 'number' ? callbackDetails.Amount : Number.NaN;
    const callbackAmountMatches = Number.isFinite(callbackAmount)
      && callbackAmount === Number(attempt.amount_minor) / 100
      && callbackAmount === Number(order.total_minor) / 100;
    const verifiedAmount = transaction.amount === undefined ? null : Number(transaction.amount);
    const transactionDetailsMatch = (verifiedAmount === null || verifiedAmount === callbackAmount)
      && (!transaction.currency || transaction.currency.toUpperCase() === 'KES')
      && Number(attempt.amount_minor) === Number(order.total_minor);
    if (!callbackStatusMatches || !callbackAmountMatches || !transactionDetailsMatch) {
      const { error: reviewError } = await database.rpc('ticketing_flag_payment_for_review', {
        p_payment_reference: externalReference,
        p_reason: !callbackStatusMatches ? 'provider_status_mismatch' : 'transaction_details_mismatch'
      });
      if (reviewError) throw reviewError;
      console.error('[TicketingPayHero] Verified callback requires manual payment review.', externalReference);
      return NextResponse.json({ received: true, message: 'Payment requires manual reconciliation.' });
    }

    const { data: orderItems, error: itemsError } = await database
      .from('ticketing_order_items')
      .select('quantity')
      .eq('order_id', order.id);
    if (itemsError) throw itemsError;
    const quantity = (orderItems || []).reduce((total, item) => total + Number(item.quantity), 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error('Ticket order quantity is outside the supported range.');
    }

    const credentials = createTicketCredentials(quantity);
    const { data: confirmation, error: confirmationError } = await database.rpc('ticketing_confirm_payhero_checkout', {
      p_payment_reference: externalReference,
      p_amount_minor: Number(attempt.amount_minor),
      p_currency: 'KES',
      p_credentials: credentials.map(({ credential_hash, credential_ciphertext }) => ({
        credential_hash,
        credential_ciphertext
      }))
    });
    if (confirmationError) throw confirmationError;
    const confirmationResult = confirmation as { status?: string } | null;
    if (!confirmationResult || !['paid', 'reconciliation_required'].includes(confirmationResult.status || '')) {
      throw new Error('PayHero ticket payment confirmation returned an invalid status.');
    }
    if (confirmationResult.status === 'paid') {
      const delivery = await sendTicketOrderNotifications(database, order.id);
      logTicketNotificationFailures('[TicketingPayHero] Confirmed order notification.', delivery);
      if (delivery.email.status === 'failed' || delivery.whatsapp.status === 'failed'
          || delivery.email.value === 'busy' || delivery.whatsapp.value === 'busy') {
        return NextResponse.json({ error: 'Ticket notification delivery failed and will be retried.' }, { status: 503 });
      }
    }
    return NextResponse.json({
      received: true,
      message: confirmationResult.status === 'paid'
        ? 'PayHero payment verified and tickets issued.'
        : 'Payment verified; order requires manual reconciliation.'
    });
  } catch (paymentError) {
    console.error('[TicketingPayHero] Could not verify and fulfill ticket payment:', paymentError);
    return NextResponse.json({ error: 'PayHero ticket payment confirmation failed.' }, { status: 503 });
  }
}
