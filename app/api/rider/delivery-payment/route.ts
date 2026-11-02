import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';
import {
  initializeRiderMpesaPrompt,
  initializeRiderQrCheckout
} from '@/lib/riderDeliveryPayments.server';

export const dynamic = 'force-dynamic';

function createRiderDatabase(url: string, serviceKey: string) {
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

type RiderDatabase = ReturnType<typeof createRiderDatabase>;

type PaymentAttempt = {
  id: number;
  provider: 'daraja' | 'paystack' | 'manual';
  payment_method: 'mpesa' | 'qr' | 'cash';
  status: 'pending' | 'paid' | 'failed';
  amount_ksh: number;
  checkout_request_id: string | null;
  authorization_url: string | null;
  error_message: string | null;
};

function isCashOrder(method: string) {
  return ['cash', 'cash on delivery', 'cod'].includes(method.trim().toLowerCase());
}

function sendError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function loadRiderOrder(database: RiderDatabase, orderId: number, riderPhone: string) {
  const { data: rider, error: riderError } = await database.from('rider_status')
    .select('verification_status')
    .eq('rider_phone', riderPhone)
    .maybeSingle();
  if (riderError) throw new Error('Rider authorization could not be verified.');
  if (!rider || rider.verification_status !== 'Verified') {
    throw new Error('Only verified riders can collect delivery payments.');
  }

  const { data: order, error: orderError } = await database.from('orders')
    .select('id,status,rider_phone,payment_method,total_price,customer_email,customer_phone,rider_handover_verified_at,payment_verified_at')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw new Error('The delivery order could not be loaded.');
  if (!order || order.rider_phone !== riderPhone) {
    throw new Error('This order is not assigned to your rider account.');
  }
  if (order.status !== 'Out for Delivery') {
    throw new Error('Doorstep payment is available only while the order is out for delivery.');
  }
  if (!order.rider_handover_verified_at) {
    throw new Error('Verify the customer’s handover code before taking payment.');
  }
  return order;
}

async function latestAttempt(database: RiderDatabase, orderId: number) {
  const { data, error } = await database.from('rider_delivery_payment_attempts')
    .select('id,provider,payment_method,status,amount_ksh,checkout_request_id,authorization_url,error_message')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('The current payment status could not be checked.');
  return data as PaymentAttempt | null;
}

function asPaymentResponse(attempt: PaymentAttempt | null) {
  return {
    status: attempt?.status === 'paid' || attempt?.status === 'pending' ? attempt.status : 'unpaid',
    paymentMethod: attempt?.payment_method || null,
    amountKsh: attempt?.amount_ksh || null,
    checkoutUrl: attempt?.payment_method === 'qr' ? attempt.authorization_url : null,
    message: attempt?.status === 'failed' ? attempt.error_message || 'The previous payment attempt failed. Choose a method to try again.' : null
  };
}

async function writePaymentAudit(
  database: RiderDatabase,
  orderId: number,
  riderPhone: string,
  status: string,
  metadata: Record<string, unknown>
) {
  const { error } = await database.from('delivery_events').insert({
    order_id: orderId,
    from_status: 'Out for Delivery',
    to_status: status,
    actor_type: 'rider',
    actor_id: riderPhone,
    metadata
  });
  if (error) {
    console.error('[RiderPayment] Payment saved but audit event failed:', error);
    return 'Payment was saved, but its audit event could not be recorded.';
  }
  return null;
}

export async function GET(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return sendError('Rider session expired. Sign in again.', 401);

  const orderId = Number(new URL(request.url).searchParams.get('orderId'));
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return sendError('A valid delivery order is required.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return sendError('Rider payment tracking is not configured on the server.', 503);
  const database = createRiderDatabase(url, serviceKey);

  try {
    const order = await loadRiderOrder(database, orderId, session.phone);
    if (order.payment_method?.trim().toLowerCase() === 'paystack' && order.payment_verified_at) {
      return NextResponse.json({
        status: 'paid',
        paymentMethod: 'Paystack',
        amountKsh: Math.round(Number(order.total_price))
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(asPaymentResponse(await latestAttempt(database, orderId)), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return sendError(error instanceof Error ? error.message : 'Payment status could not be loaded.', 503);
  }
}

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return sendError('Rider session expired. Sign in again.', 401);

  let body: { orderId?: unknown; method?: unknown; customerIdVerified?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return sendError('Choose a valid delivery payment method.');
  }
  const orderId = Number(body.orderId);
  const method = typeof body.method === 'string' ? body.method : '';
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !['cash', 'mpesa', 'qr'].includes(method)) {
    return sendError('Choose a valid delivery payment method.');
  }
  if (body.customerIdVerified !== true) {
    return sendError('Check the customer’s photo ID before taking payment.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return sendError('Rider payment collection is not configured on the server.', 503);
  const database = createRiderDatabase(url, serviceKey);

  let order: Awaited<ReturnType<typeof loadRiderOrder>>;
  try {
    order = await loadRiderOrder(database, orderId, session.phone);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The delivery order could not be verified.';
    return sendError(message, message.includes('Only verified') ? 403 : 409);
  }

  if (order.payment_method?.trim().toLowerCase() === 'paystack' && order.payment_verified_at) {
    return sendError('This order is already paid online.', 409);
  }
  if (!isCashOrder(order.payment_method || '')) {
    return sendError('Doorstep payment is available only for cash-on-delivery orders.', 409);
  }

  const amountKsh = Number(order.total_price);
  if (!Number.isSafeInteger(amountKsh) || amountKsh <= 0) {
    return sendError('The order total must be a positive whole-KSh amount for doorstep payment.', 409);
  }

  let current: PaymentAttempt | null;
  try {
    current = await latestAttempt(database, orderId);
  } catch {
    return sendError('The current payment status could not be checked.', 503);
  }
  if (current?.status === 'paid') {
    return NextResponse.json(asPaymentResponse(current), { headers: { 'Cache-Control': 'no-store' } });
  }
  if (current?.status === 'pending') {
    return current.payment_method === method
      ? NextResponse.json(asPaymentResponse(current), { headers: { 'Cache-Control': 'no-store' } })
      : sendError('A payment is already in progress. Wait for its result before choosing another method.', 409);
  }

  if (method === 'cash') {
    const reference = `CASH-${orderId}-${randomUUID()}`;
    const { error: insertError } = await database.from('rider_delivery_payment_attempts').insert({
      order_id: orderId,
      rider_phone: session.phone,
      provider: 'manual',
      payment_method: 'cash',
      status: 'paid',
      amount_ksh: amountKsh,
      provider_reference: reference
    });
    if (insertError) {
      console.error('[RiderPayment] Could not record cash collection:', insertError);
      return sendError(/rider_delivery_payment_attempts|schema cache/i.test(insertError.message)
        ? 'Doorstep payments are not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql.'
        : 'Cash collection could not be recorded. Refresh the payment status before retrying.', 503);
    }
    const warning = await writePaymentAudit(database, orderId, session.phone, 'Cash collected', {
      amount_ksh: amountKsh,
      payment_method: 'cash',
      reference
    });
    return NextResponse.json({ status: 'paid', paymentMethod: 'cash', amountKsh, warning }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const attemptId = randomUUID();
  const provider = method === 'mpesa' ? 'daraja' : 'paystack';
  const providerReference = `${method === 'mpesa' ? 'MPESA' : 'QR'}-RIDER-${orderId}-${attemptId}`;
  const callbackToken = method === 'mpesa' ? randomUUID() : null;
  const { data: insertedAttempt, error: insertError } = await database.from('rider_delivery_payment_attempts')
    .insert({
      order_id: orderId,
      rider_phone: session.phone,
      provider,
      payment_method: method,
      status: 'pending',
      amount_ksh: amountKsh,
      provider_reference: providerReference,
      callback_token: callbackToken
    })
    .select('id')
    .single();
  if (insertError || !insertedAttempt) {
    console.error('[RiderPayment] Could not create payment attempt:', insertError);
    return sendError(/rider_delivery_payment_attempts|schema cache/i.test(insertError?.message || '')
      ? 'Doorstep payments are not installed. Apply supabase/RIDER_DOORSTEP_PAYMENT_MIGRATION.sql.'
      : 'A payment attempt could not be started. Refresh the payment status before retrying.', 503);
  }

  try {
    if (method === 'mpesa') {
      if (!callbackToken) throw new Error('The M-Pesa callback could not be secured.');
      const payment = await initializeRiderMpesaPrompt({
        orderId,
        amountKsh,
        phone: order.customer_phone || '',
        callbackToken
      });
      const { error: updateError } = await database.from('rider_delivery_payment_attempts')
        .update({
          checkout_request_id: payment.checkoutRequestId,
          updated_at: new Date().toISOString()
        })
        .eq('id', insertedAttempt.id);
      if (updateError) throw new Error('The M-Pesa prompt started, but its payment reference could not be saved.');
      const warning = await writePaymentAudit(database, orderId, session.phone, 'M-Pesa prompt started', {
        amount_ksh: amountKsh,
        checkout_request_id: payment.checkoutRequestId
      });
      return NextResponse.json({
        status: 'pending',
        paymentMethod: 'mpesa',
        amountKsh,
        warning
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const authorizationUrl = await initializeRiderQrCheckout({
      email: order.customer_email || '',
      amountMinor: amountKsh * 100,
      reference: providerReference,
      orderId
    });
    const { error: updateError } = await database.from('rider_delivery_payment_attempts')
      .update({
        authorization_url: authorizationUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', insertedAttempt.id);
    if (updateError) throw new Error('The payment page was created, but its checkout details could not be saved.');
    const warning = await writePaymentAudit(database, orderId, session.phone, 'Scan-to-pay checkout started', {
      amount_ksh: amountKsh,
      reference: providerReference
    });
    return NextResponse.json({
      status: 'pending',
      paymentMethod: 'qr',
      amountKsh,
      checkoutUrl: authorizationUrl,
      warning
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The payment request could not be started.';
    const { error: updateError } = await database.from('rider_delivery_payment_attempts')
      .update({
        status: 'failed',
        error_message: message.slice(0, 1000),
        updated_at: new Date().toISOString()
      })
      .eq('id', insertedAttempt.id)
      .eq('status', 'pending');
    if (updateError) console.error('[RiderPayment] Could not record failed payment attempt:', updateError);
    console.error('[RiderPayment] Provider payment initialization failed:', message);
    return sendError(message, 503);
  }
}
