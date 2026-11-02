import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderMpesaPrompt } from '@/lib/riderDeliveryPayments.server';

export const dynamic = 'force-dynamic';

type MpesaCallbackBody = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Callback accepted.' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Payment callback processing is not configured.' }, { status: 503 });
  }

  let payload: MpesaCallbackBody;
  try {
    payload = await request.json() as MpesaCallbackBody;
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
  const { data: attempt, error: attemptError } = await database
    .from('rider_delivery_payment_attempts')
    .select('id,order_id,rider_phone,amount_ksh,status,checkout_request_id,provider_reference')
    .eq('callback_token', token)
    .eq('provider', 'daraja')
    .maybeSingle();
  if (attemptError) {
    console.error('[RiderMpesaCallback] Could not load payment attempt:', attemptError);
    return NextResponse.json({ error: 'Payment callback could not be processed.' }, { status: 503 });
  }
  if (!attempt) return NextResponse.json({ ResultCode: 0, ResultDesc: 'Callback accepted.' });
  if (attempt.status === 'paid') {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Payment already recorded.' });
  }
  if (attempt.status !== 'pending'
      || (attempt.checkout_request_id !== null
        && attempt.checkout_request_id !== callback.CheckoutRequestID)) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Callback does not match an active payment.' });
  }

  if (callback.ResultCode !== 0) {
    let failureUpdate = database.from('rider_delivery_payment_attempts')
      .update({
        status: 'failed',
        checkout_request_id: callback.CheckoutRequestID,
        error_message: (callback.ResultDesc || 'M-Pesa payment was not completed.').slice(0, 1000),
        updated_at: new Date().toISOString()
      })
      .eq('id', attempt.id)
      .eq('status', 'pending');
    failureUpdate = attempt.checkout_request_id === null
      ? failureUpdate.is('checkout_request_id', null)
      : failureUpdate.eq('checkout_request_id', callback.CheckoutRequestID);
    const { error: failureError } = await failureUpdate;
    if (failureError) {
      console.error('[RiderMpesaCallback] Could not record failed payment:', failureError);
      return NextResponse.json({ error: 'M-Pesa payment status could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Payment failure recorded.' });
  }

  const metadata = new Map((callback.CallbackMetadata?.Item || [])
    .filter((item): item is { Name: string; Value: string | number } =>
      typeof item.Name === 'string' && (typeof item.Value === 'string' || typeof item.Value === 'number'))
    .map(item => [item.Name, item.Value]));
  const paidAmount = Number(metadata.get('Amount'));
  const receiptNumber = metadata.get('MpesaReceiptNumber');
  const paidPhone = metadata.get('PhoneNumber');
  if (paidAmount !== Number(attempt.amount_ksh)
      || typeof receiptNumber !== 'string' || !receiptNumber.trim()
      || (paidPhone !== undefined && !/^254[17]\d{8}$/.test(normalizedPhone(String(paidPhone))))) {
    console.error('[RiderMpesaCallback] Payment metadata did not match a valid M-Pesa receipt.', attempt.provider_reference);
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Payment details require reconciliation.' });
  }

  const { data: order, error: orderError } = await database.from('orders')
    .select('customer_phone,total_price,rider_phone,status')
    .eq('id', attempt.order_id)
    .maybeSingle();
  if (orderError || !order) {
    console.error('[RiderMpesaCallback] Could not verify order details:', orderError);
    return NextResponse.json({ error: 'M-Pesa order details could not be verified.' }, { status: 503 });
  }
  if (order.rider_phone !== attempt.rider_phone
      || !['Out for Delivery', 'Delivered'].includes(order.status)
      || Math.round(Number(order.total_price)) !== paidAmount
      || (paidPhone !== undefined
        && normalizedPhone(String(paidPhone)) !== normalizedPhone(order.customer_phone || ''))) {
    console.error('[RiderMpesaCallback] M-Pesa transaction does not match the delivery order.', attempt.provider_reference);
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Payment details require reconciliation.' });
  }

  try {
    const verification = await verifyRiderMpesaPrompt(callback.CheckoutRequestID);
    if (!verification.paid) {
      console.error('[RiderMpesaCallback] Safaricom query did not confirm the successful callback:', verification.description);
      return NextResponse.json({ error: 'Safaricom has not confirmed this payment yet.' }, { status: 503 });
    }
  } catch (error) {
    console.error('[RiderMpesaCallback] Safaricom could not verify the transaction:', error);
    return NextResponse.json({ error: 'Safaricom payment verification is temporarily unavailable.' }, { status: 503 });
  }

  let paymentUpdate = database.from('rider_delivery_payment_attempts')
    .update({
      status: 'paid',
      checkout_request_id: callback.CheckoutRequestID,
      receipt_number: receiptNumber,
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', attempt.id)
    .eq('status', 'pending');
  paymentUpdate = attempt.checkout_request_id === null
    ? paymentUpdate.is('checkout_request_id', null)
    : paymentUpdate.eq('checkout_request_id', callback.CheckoutRequestID);
  const { data: savedAttempt, error: saveError } = await paymentUpdate
    .select('id')
    .maybeSingle();
  if (saveError) {
    console.error('[RiderMpesaCallback] Could not record verified payment:', saveError);
    return NextResponse.json({ error: 'Verified payment could not be recorded.' }, { status: 503 });
  }
  if (!savedAttempt) {
    const { data: currentAttempt, error: currentError } = await database.from('rider_delivery_payment_attempts')
      .select('status')
      .eq('id', attempt.id)
      .maybeSingle();
    if (currentError || currentAttempt?.status !== 'paid') {
      console.error('[RiderMpesaCallback] Verified payment could not claim the active attempt:', currentError);
      return NextResponse.json({ error: 'Payment was received but could not be recorded against this order.' }, { status: 503 });
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Payment already recorded.' });
  }
  const { error: auditError } = await database.from('delivery_events').insert({
    order_id: attempt.order_id,
    from_status: 'Out for Delivery',
    to_status: 'M-Pesa payment confirmed',
    actor_type: 'payment',
    actor_id: 'Safaricom',
    metadata: {
      amount_ksh: paidAmount,
      receipt_number: receiptNumber,
      checkout_request_id: callback.CheckoutRequestID
    }
  });
  if (auditError) {
    console.error('[RiderMpesaCallback] Verified payment was saved but audit logging failed:', auditError);
    return NextResponse.json({ error: 'Payment was confirmed, but its audit record could not be saved.' }, { status: 503 });
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Payment confirmed.' });
}
