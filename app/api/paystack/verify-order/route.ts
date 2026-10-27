import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordVerifiedPaystackPayment } from '@/lib/paystackServer';
import { getPaystackSecretKey } from '@/lib/ticketing/paystack.server';

export const dynamic = 'force-dynamic';

type PaystackVerification = {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
  };
};

export async function POST(request: Request) {
  let secretKey: string;
  try {
    secretKey = getPaystackSecretKey();
  } catch (configurationError) {
    console.error('[PaystackVerify] Payment provider configuration is invalid:', configurationError);
    return NextResponse.json({ error: 'Server-side payment verification is not configured.' }, { status: 503 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server-side payment verification is not configured.' }, { status: 503 });
  }

  let body: { reference?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid Paystack transaction reference is required.' }, { status: 400 });
  }
  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!reference || reference.length > 120 || !/^[A-Za-z0-9_-]+$/.test(reference)) {
    return NextResponse.json({ error: 'A valid Paystack transaction reference is required.' }, { status: 400 });
  }

  try {
    const providerResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` }, cache: 'no-store' }
    );
    const verification = await providerResponse.json() as PaystackVerification;
    const transaction = verification.data;
    if (!providerResponse.ok || verification.status !== true || transaction?.status !== 'success') {
      return NextResponse.json({ error: 'Paystack has not confirmed a successful transaction.' }, { status: 409 });
    }
    if (transaction.reference !== reference || transaction.currency !== 'KES' || !Number.isFinite(transaction.amount)) {
      return NextResponse.json({ error: 'The Paystack transaction reference, currency, or amount is invalid.' }, { status: 409 });
    }

    const database = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: order, error: orderError } = await database
      .from('orders')
      .select('id, total_price, payment_method, status, payment_verified_at')
      .eq('checkout_request_id', reference)
      .maybeSingle();
    if (orderError) {
      console.error('[PaystackVerify] Could not load matching order:', orderError);
      return NextResponse.json({ error: 'The matching order could not be verified.' }, { status: 503 });
    }
    if (!order || order.payment_method !== 'Paystack') {
      return NextResponse.json({ error: 'No Paystack order matches this transaction.' }, { status: 404 });
    }

    const expectedAmount = Math.round(Number(order.total_price) * 100);
    if (!Number.isFinite(expectedAmount) || transaction.amount !== expectedAmount) {
      return NextResponse.json({ error: 'The confirmed Paystack amount does not match the order total.' }, { status: 409 });
    }
    try {
      await recordVerifiedPaystackPayment(database, {
        orderId: order.id,
        reference,
        amountKobo: transaction.amount,
        source: 'server_verification'
      });
    } catch (error) {
      console.error('[PaystackVerify] Could not record server-verified payment:', error);
      return NextResponse.json({ error: 'Payment was verified, but its confirmation record could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentStatus: order.status === 'Paid' && order.payment_verified_at ? 'confirmed' : 'awaiting_signed_webhook'
    });
  } catch (error) {
    console.error('[PaystackVerify] Payment verification failed:', error);
    return NextResponse.json({ error: 'Paystack could not be reached to verify this transaction.' }, { status: 503 });
  }
}
