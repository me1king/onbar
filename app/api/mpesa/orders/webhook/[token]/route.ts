import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { alertAllocatedMerchants } from '@/lib/merchantOrderAlerts.server';
import { getPublicBaseUrl } from '@/lib/utils';
import { verifyDarajaStkPayment } from '@/lib/darajaPayments.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CallbackPayload = {
  Body?: {
    stkCallback?: {
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{ Name?: string; Value?: string | number }>;
      };
    };
  };
};

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return digits;
}

function acknowledge(message: string) {
  return NextResponse.json({ ResultCode: 0, ResultDesc: message });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/i.test(token)) return acknowledge('Callback accepted.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Payment callback processing is not configured.' }, { status: 503 });
  }

  let payload: CallbackPayload;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 32_768) {
      return NextResponse.json({ error: 'M-Pesa callback is too large.' }, { status: 413 });
    }
    payload = JSON.parse(rawBody) as CallbackPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid M-Pesa callback.' }, { status: 400 });
  }

  const callback = payload.Body?.stkCallback;
  if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== 'number') {
    return NextResponse.json({ error: 'M-Pesa callback details are incomplete.' }, { status: 400 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: attempt, error: attemptError } = await database
    .from('daraja_order_payment_attempts')
    .select('id,order_id,external_reference,checkout_request_id,amount_ksh,phone_e164,status')
    .eq('callback_token_hash', tokenHash)
    .maybeSingle();
  if (attemptError) {
    console.error('[DarajaOrderCallback] Could not load payment attempt:', attemptError);
    return NextResponse.json({ error: 'Payment callback could not be processed.' }, { status: 503 });
  }
  if (!attempt) return acknowledge('No matching M-Pesa payment attempt.');
  if (attempt.status === 'paid') return acknowledge('Payment already recorded.');
  if (!['initializing', 'queued', 'unknown'].includes(attempt.status)
      || (attempt.checkout_request_id !== null
        && attempt.checkout_request_id !== callback.CheckoutRequestID)) {
    return acknowledge('Callback does not match an active payment.');
  }

  if (callback.ResultCode !== 0) {
    const { error } = await database.from('daraja_order_payment_attempts')
      .update({
        status: 'failed',
        checkout_request_id: callback.CheckoutRequestID,
        error_message: (callback.ResultDesc || 'M-Pesa payment was not completed.').slice(0, 1000),
        updated_at: new Date().toISOString()
      })
      .eq('id', attempt.id)
      .in('status', ['initializing', 'queued', 'unknown']);
    if (error) {
      console.error('[DarajaOrderCallback] Could not record failed payment:', error);
      return NextResponse.json({ error: 'M-Pesa payment status could not be saved.' }, { status: 503 });
    }
    const { error: orderUpdateError } = await database.from('orders')
      .update({ status: 'Payment Failed' })
      .eq('id', attempt.order_id)
      .eq('payment_method', 'Daraja')
      .eq('status', 'Pending');
    if (orderUpdateError) {
      console.error('[DarajaOrderCallback] Could not mark the order payment as failed:', orderUpdateError);
      return NextResponse.json({ error: 'M-Pesa failure was recorded, but the order status could not be updated.' }, { status: 503 });
    }
    return acknowledge('Payment failure recorded.');
  }

  const metadata = new Map((callback.CallbackMetadata?.Item || [])
    .filter((item): item is { Name: string; Value: string | number } =>
      typeof item.Name === 'string' && (typeof item.Value === 'string' || typeof item.Value === 'number'))
    .map(item => [item.Name, item.Value]));
  const amount = Number(metadata.get('Amount'));
  const receipt = metadata.get('MpesaReceiptNumber');
  const phone = metadata.get('PhoneNumber');
  if (amount !== Number(attempt.amount_ksh)
      || typeof receipt !== 'string' || !/^[A-Z0-9]{6,20}$/i.test(receipt)
      || (phone !== undefined
        && normalizedPhone(String(phone)) !== normalizedPhone(attempt.phone_e164))) {
    console.error('[DarajaOrderCallback] Callback metadata does not match the saved payment attempt.', attempt.id);
    await database.from('daraja_order_payment_attempts')
      .update({ status: 'review', updated_at: new Date().toISOString() })
      .eq('id', attempt.id)
      .neq('status', 'paid');
    return acknowledge('Payment details require reconciliation.');
  }

  const { data: order, error: orderError } = await database.from('orders')
    .select('id,total_price,payment_method,checkout_request_id,status,payment_verified_at')
    .eq('id', attempt.order_id)
    .maybeSingle();
  if (orderError || !order || order.payment_method !== 'Daraja'
      || order.checkout_request_id !== attempt.external_reference
      || Math.round(Number(order.total_price)) !== Number(attempt.amount_ksh)) {
    console.error('[DarajaOrderCallback] Callback does not match the saved order:', orderError || attempt.id);
    return acknowledge('Payment details require reconciliation.');
  }

  try {
    const verification = await verifyDarajaStkPayment(database, callback.CheckoutRequestID);
    if (!verification.paid) {
      console.warn('[DarajaOrderCallback] Safaricom query did not confirm payment:', verification.description);
      return NextResponse.json({ error: 'Safaricom has not confirmed this payment yet.' }, { status: 503 });
    }

    const amountKobo = Math.round(Number(order.total_price) * 100);
    const { error: confirmationError } = await database.from('payment_confirmations').upsert({
      order_id: order.id,
      provider: 'Daraja',
      reference: attempt.external_reference,
      amount_kobo: amountKobo,
      currency: 'KES',
      confirmation_source: 'webhook'
    }, { onConflict: 'reference', ignoreDuplicates: true });
    if (confirmationError) throw confirmationError;

    const { data: savedConfirmation, error: savedConfirmationError } = await database
      .from('payment_confirmations')
      .select('order_id,provider,amount_kobo,currency')
      .eq('reference', attempt.external_reference)
      .maybeSingle();
    if (savedConfirmationError) throw savedConfirmationError;
    if (!savedConfirmation
        || Number(savedConfirmation.order_id) !== Number(order.id)
        || savedConfirmation.provider !== 'Daraja'
        || Number(savedConfirmation.amount_kobo) !== amountKobo
        || savedConfirmation.currency !== 'KES') {
      throw new Error('The M-Pesa reference is already linked to different payment details.');
    }

    const { data: paidOrder, error: paidOrderError } = await database.from('orders')
      .update({ status: 'Paid', payment_verified_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('payment_method', 'Daraja')
      .eq('status', 'Pending')
      .select('id')
      .maybeSingle();
    if (paidOrderError) throw paidOrderError;
    if (!paidOrder && !(order.status === 'Paid' && order.payment_verified_at)) {
      await database.from('daraja_order_payment_attempts')
        .update({ status: 'review', updated_at: new Date().toISOString() })
        .eq('id', attempt.id);
      return acknowledge('Verified payment requires order reconciliation.');
    }

    const { error: attemptUpdateError } = await database.from('daraja_order_payment_attempts')
      .update({
        status: 'paid',
        checkout_request_id: callback.CheckoutRequestID,
        mpesa_receipt: receipt,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', attempt.id)
      .neq('status', 'paid');
    if (attemptUpdateError) throw attemptUpdateError;

    try {
      const notificationSecret = process.env.INTERNAL_API_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
      if (!notificationSecret) {
        console.error('[DarajaOrderCallback] Payment is verified, but customer notification is not configured.');
      } else {
        const notificationResponse = await fetch(new URL('/api/admin/notify-customer', getPublicBaseUrl()), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${notificationSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId: order.id, status: 'Paid' }),
        cache: 'no-store'
      });
        if (!notificationResponse.ok) {
          console.error('[DarajaOrderCallback] Payment is verified, but customer notification failed:', notificationResponse.status);
        }
      }
    } catch (notificationError) {
      console.error('[DarajaOrderCallback] Payment is verified, but customer notification failed:', notificationError);
    }
    try {
      await alertAllocatedMerchants(database, Number(order.id));
    } catch (alertError) {
      console.error('[DarajaOrderCallback] Payment is verified, but merchant notifications failed:', alertError);
    }

    return acknowledge('M-Pesa payment verified and order confirmed.');
  } catch (error) {
    console.error('[DarajaOrderCallback] Could not verify and confirm the M-Pesa payment:', error);
    return NextResponse.json({ error: 'M-Pesa payment confirmation failed.' }, { status: 503 });
  }
}
