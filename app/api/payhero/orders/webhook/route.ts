import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { alertAllocatedMerchants } from '@/lib/merchantOrderAlerts.server';
import { getPublicBaseUrl } from '@/lib/utils';
import { verifyPayHeroOrderPayment } from '@/lib/payheroOrders.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isCallbackSecretValid(suppliedSecret: string, storedHash: string) {
  if (!/^[0-9a-f]{64}$/.test(suppliedSecret) || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const suppliedHash = createHash('sha256').update(suppliedSecret).digest('hex');
  return timingSafeEqual(Buffer.from(suppliedHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

async function notifyCustomer(orderId: number) {
  const secret = process.env.INTERNAL_API_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (!secret) {
    console.error('[PayHeroOrderWebhook] Payment is verified, but customer notification is not configured.');
    return;
  }
  const response = await fetch(new URL('/api/admin/notify-customer', getPublicBaseUrl()), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ orderId, status: 'Paid' }),
    cache: 'no-store'
  });
  if (!response.ok) {
    console.error('[PayHeroOrderWebhook] Payment is verified, but customer notification failed:', response.status);
  }
}

export async function POST(request: Request) {
  const callbackSecret = new URL(request.url).searchParams.get('key') || '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server-side PayHero order processing is not configured.' }, { status: 503 });
  }

  let callback: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 32_768) {
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
  const details = callbackRecord.response as {
    Amount?: unknown;
    CheckoutRequestID?: unknown;
    ExternalReference?: unknown;
    ResultCode?: unknown;
    Status?: unknown;
  };
  const externalReference = typeof details.ExternalReference === 'string' ? details.ExternalReference : '';
  const checkoutRequestId = typeof details.CheckoutRequestID === 'string' ? details.CheckoutRequestID : '';
  if (!/^OB-[0-9a-f-]{36}$/i.test(externalReference) || !checkoutRequestId) {
    return NextResponse.json({ error: 'PayHero callback references are invalid.' }, { status: 400 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  try {
    const { data: attempt, error: attemptError } = await database
      .from('payhero_order_payment_attempts')
      .select('order_id,external_reference,payhero_reference,checkout_request_id,callback_secret_hash,amount_kobo,status')
      .eq('external_reference', externalReference)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return NextResponse.json({ received: true, message: 'No matching drink order payment.' });
    if (!isCallbackSecretValid(callbackSecret, attempt.callback_secret_hash)) {
      return NextResponse.json({ error: 'PayHero callback authentication failed.' }, { status: 401 });
    }
    if (attempt.status === 'paid') {
      await notifyCustomer(Number(attempt.order_id));
      try {
        await alertAllocatedMerchants(database, Number(attempt.order_id));
      } catch (alertError) {
        console.error('[PayHeroOrderWebhook] Could not retry merchant order alerts:', alertError);
      }
      return NextResponse.json({ received: true, message: 'Drink order payment was already confirmed.' });
    }
    if (!attempt.payhero_reference || !attempt.checkout_request_id) {
      console.error('[PayHeroOrderWebhook] Callback arrived before PayHero references were saved:', externalReference);
      return NextResponse.json({ error: 'PayHero payment details are not ready for verification.' }, { status: 503 });
    }
    if (checkoutRequestId !== attempt.checkout_request_id) {
      return NextResponse.json({ error: 'PayHero callback does not match the saved payment request.' }, { status: 409 });
    }

    const { data: order, error: orderError } = await database
      .from('orders')
      .select('id,total_price,payment_method,checkout_request_id,status,payment_verified_at')
      .eq('id', attempt.order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.payment_method !== 'PayHero' || order.checkout_request_id !== externalReference) {
      throw new Error('The PayHero callback does not match a pending drink order.');
    }

    const transaction = await verifyPayHeroOrderPayment(attempt.payhero_reference);
    if (transaction.reference !== attempt.payhero_reference
        || (transaction.CheckoutRequestID && transaction.CheckoutRequestID !== attempt.checkout_request_id)
        || (transaction.external_reference && transaction.external_reference !== externalReference)) {
      throw new Error('PayHero transaction verification returned a different payment reference.');
    }
    const transactionStatus = transaction.status?.toUpperCase() || '';
    if (transactionStatus === 'QUEUED' || transactionStatus === 'PENDING') {
      return NextResponse.json({ received: true, message: 'PayHero is still processing the M-Pesa payment.' }, { status: 202 });
    }
    if (transactionStatus === 'FAILED') {
      const { error: attemptUpdateError } = await database.from('payhero_order_payment_attempts')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('external_reference', externalReference)
        .eq('status', 'queued');
      if (attemptUpdateError) throw attemptUpdateError;
      const { error: orderUpdateError } = await database.from('orders')
        .update({ status: 'Payment Failed', updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('payment_method', 'PayHero')
        .eq('status', 'Pending');
      if (orderUpdateError) throw orderUpdateError;
      return NextResponse.json({ received: true, message: 'Failed M-Pesa payment recorded.' });
    }

    const callbackAmountKsh = Number(details.Amount);
    const expectedAmountKsh = Number(order.total_price);
    const expectedAmountKobo = Math.round(expectedAmountKsh * 100);
    const callbackConfirmsSuccess = callbackRecord.status === true
      && details.ResultCode === 0
      && typeof details.Status === 'string'
      && details.Status.toLowerCase() === 'success'
      && Number.isSafeInteger(callbackAmountKsh)
      && callbackAmountKsh === expectedAmountKsh
      && Number.isSafeInteger(expectedAmountKobo)
      && expectedAmountKobo === Number(attempt.amount_kobo);
    const transactionAmount = transaction.amount === undefined ? null : Number(transaction.amount);
    const transactionMatches = transaction.success === true
      && transactionStatus === 'SUCCESS'
      && Number.isSafeInteger(expectedAmountKobo)
      && Number(attempt.amount_kobo) === expectedAmountKobo
      && (transactionAmount === null || transactionAmount === callbackAmountKsh)
      && (!transaction.currency || transaction.currency.toUpperCase() === 'KES');
    if (!callbackConfirmsSuccess || !transactionMatches) {
      const { error: reviewUpdateError } = await database.from('payhero_order_payment_attempts')
        .update({ status: 'review', updated_at: new Date().toISOString() })
        .eq('external_reference', externalReference)
        .neq('status', 'paid');
      if (reviewUpdateError) throw reviewUpdateError;
      console.error('[PayHeroOrderWebhook] Payment details require reconciliation:', externalReference);
      return NextResponse.json({ received: true, message: 'Payment details require manual reconciliation.' });
    }

    const { error: confirmationError } = await database.from('payment_confirmations').upsert({
      order_id: order.id,
      provider: 'PayHero',
      reference: externalReference,
      amount_kobo: expectedAmountKobo,
      currency: 'KES',
      confirmation_source: 'webhook'
    }, { onConflict: 'reference', ignoreDuplicates: true });
    if (confirmationError) throw confirmationError;

    const { data: savedConfirmation, error: savedConfirmationError } = await database
      .from('payment_confirmations')
      .select('order_id,provider,amount_kobo,currency')
      .eq('reference', externalReference)
      .maybeSingle();
    if (savedConfirmationError) throw savedConfirmationError;
    if (!savedConfirmation
        || Number(savedConfirmation.order_id) !== Number(order.id)
        || savedConfirmation.provider !== 'PayHero'
        || Number(savedConfirmation.amount_kobo) !== expectedAmountKobo
        || savedConfirmation.currency !== 'KES') {
      throw new Error('The PayHero reference is already linked to different payment details.');
    }

    const { data: paidOrder, error: paidOrderError } = await database.from('orders')
      .update({ status: 'Paid', payment_verified_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('payment_method', 'PayHero')
      .eq('status', 'Pending')
      .select('id')
      .maybeSingle();
    if (paidOrderError) throw paidOrderError;
    if (!paidOrder && !(order.status === 'Paid' && order.payment_verified_at)) {
      const { error: reviewUpdateError } = await database.from('payhero_order_payment_attempts')
        .update({ status: 'review', updated_at: new Date().toISOString() })
        .eq('external_reference', externalReference);
      if (reviewUpdateError) throw reviewUpdateError;
      return NextResponse.json({ received: true, message: 'Verified payment requires order reconciliation.' });
    }

    const { error: attemptUpdateError } = await database.from('payhero_order_payment_attempts')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('external_reference', externalReference);
    if (attemptUpdateError) throw attemptUpdateError;

    await notifyCustomer(Number(order.id));
    try {
      const alerts = await alertAllocatedMerchants(database, Number(order.id));
      if (alerts.applications === 0) {
        console.warn('[PayHeroOrderWebhook] Payment confirmed; no merchant was allocated:', order.id);
      }
    } catch (alertError) {
      console.error('[PayHeroOrderWebhook] Payment is confirmed, but merchant alerts could not be dispatched:', alertError);
    }

    return NextResponse.json({ received: true, message: 'PayHero drink payment verified and order confirmed.' });
  } catch (error) {
    console.error('[PayHeroOrderWebhook] Could not verify and confirm the drink payment:', error);
    return NextResponse.json({ error: 'PayHero drink payment confirmation failed.' }, { status: 503 });
  }
}
