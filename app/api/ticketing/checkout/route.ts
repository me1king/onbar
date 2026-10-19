import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  assertTicketCredentialEncryptionKey,
  hashTicketAccessToken,
  createTicketCredentials
} from '@/lib/ticketing/credentials.server';
import { initializePaystackTicketCheckout } from '@/lib/ticketing/paystack.server';
import { encryptTicketWalletToken, normalizeTicketPhoneNumber } from '@/lib/ticketing/whatsapp.server';
import { logTicketNotificationFailures, sendTicketOrderNotifications } from '@/lib/ticketing/notifications.server';
import { getPublicBaseUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;

type CheckoutResult = {
  order_id: string;
  order_reference: string;
  amount_minor: number;
  currency: string;
  payment_reference: string;
  provider: 'paystack' | 'complimentary';
  authorization_url: string | null;
  status: string;
};

function mapCheckoutError(code?: string) {
  if (code === 'P0002') return { status: 409, message: 'This event or ticket option is not currently available.' };
  if (code === 'P0001') return { status: 409, message: 'There are not enough tickets available for that quantity.' };
  if (code === '22023') return { status: 400, message: 'Check the ticket quantity and buyer details, then try again.' };
  return null;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Ticketing checkout is not configured.' }, { status: 503 });
  }
  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
    return NextResponse.json({ error: 'Ticketing payment processing is not configured.' }, { status: 503 });
  }
  try {
    assertTicketCredentialEncryptionKey();
  } catch (configurationError) {
    console.error('[TicketingCheckout] Ticket credential encryption is not configured:', configurationError);
    return NextResponse.json({ error: 'Secure ticket delivery is not configured.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid checkout request is required.' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const ticketTypeId = typeof body.ticketTypeId === 'string' ? body.ticketTypeId : '';
  const quantity = typeof body.quantity === 'number' ? body.quantity : Number.NaN;
  const buyerEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const buyerName = typeof body.name === 'string' ? body.name.trim() : '';
  const buyerPhone = typeof body.phone === 'string' ? normalizeTicketPhoneNumber(body.phone) : null;
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
  if (!uuidPattern.test(eventId) || !uuidPattern.test(ticketTypeId)
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 20
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) || buyerEmail.length > 320
      || buyerName.length > 160 || !buyerPhone || body.whatsappConsent !== true
      || !tokenPattern.test(idempotencyKey) || !tokenPattern.test(accessToken)) {
    return NextResponse.json({ error: 'Enter a valid name, email, WhatsApp number and ticket quantity, and agree to receive your ticket link.' }, { status: 400 });
  }

  const paymentReference = `OBT-${randomBytes(16).toString('hex').toUpperCase()}`;
  const { data, error } = await database.rpc('ticketing_create_checkout', {
    p_event_id: eventId,
    p_ticket_type_id: ticketTypeId,
    p_quantity: quantity,
    p_buyer_email: buyerEmail,
    p_buyer_name: buyerName,
    p_idempotency_key: idempotencyKey,
    p_access_token_hash: hashTicketAccessToken(accessToken),
    p_payment_reference: paymentReference
  });

  if (error) {
    const mapped = mapCheckoutError(error.code);
    if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    console.error('[TicketingCheckout] Could not create checkout:', error);
    return NextResponse.json({
      error: 'Checkout could not be prepared. Confirm the Ticketing commerce migration is installed.'
    }, { status: 503 });
  }

  const checkout = data as CheckoutResult | null;
  if (!checkout?.order_id || !checkout.payment_reference
      || !Number.isSafeInteger(Number(checkout.amount_minor))
      || checkout.currency !== 'KES'
      || !['paystack', 'complimentary'].includes(checkout.provider)) {
    console.error('[TicketingCheckout] Checkout RPC returned an invalid response.');
    return NextResponse.json({ error: 'Checkout could not be verified.' }, { status: 503 });
  }

  const { error: contactError } = await database.from('ticketing_orders').update({
    buyer_phone: buyerPhone,
    access_token_ciphertext: encryptTicketWalletToken(accessToken)
  }).eq('id', checkout.order_id).eq('access_token_hash', hashTicketAccessToken(accessToken));
  if (contactError) {
    console.error('[TicketingCheckout] Could not save ticket-message contact details:', contactError);
    return NextResponse.json({
      error: 'Checkout was prepared but secure ticket-message details could not be saved. Retry this checkout.'
    }, { status: 503 });
  }

  const walletUrl = new URL('/tickets/confirmation', getPublicBaseUrl());
  walletUrl.searchParams.set('order', checkout.order_id);
  walletUrl.searchParams.set('token', accessToken);

  if (checkout.status === 'paid') {
    const delivery = await sendTicketOrderNotifications(database, checkout.order_id);
    logTicketNotificationFailures('[TicketingCheckout] Ticket is already issued.', delivery);
    return NextResponse.json({
      authorizationUrl: walletUrl.toString(),
      orderReference: checkout.order_reference,
      orderId: checkout.order_id,
      emailSent: delivery.email.status === 'sent' && ['sent', 'already_sent'].includes(delivery.email.value),
      whatsappSent: delivery.whatsapp.status === 'sent' && ['sent', 'already_sent'].includes(delivery.whatsapp.value)
    });
  }
  if (checkout.status === 'reconciliation_required') {
    return NextResponse.json({
      error: 'This payment needs manual review. Contact ONLINE BAR support and quote the order reference.',
      orderReference: checkout.order_reference
    }, { status: 409 });
  }

  if (checkout.provider === 'complimentary') {
    try {
      const credentials = createTicketCredentials(quantity);
      const { data: confirmation, error: confirmationError } = await database.rpc('ticketing_confirm_checkout', {
        p_payment_reference: checkout.payment_reference,
        p_amount_minor: 0,
        p_currency: 'KES',
        p_credentials: credentials.map(({ credential_hash, credential_ciphertext }) => ({
          credential_hash,
          credential_ciphertext
        }))
      });
      if (confirmationError) throw confirmationError;
      const result = confirmation as { status?: string } | null;
      if (result?.status !== 'paid') {
        return NextResponse.json({
          error: 'Payment is being reconciled. Contact ONLINE BAR support before trying again.',
          orderReference: checkout.order_reference
        }, { status: 202 });
      }
      const delivery = await sendTicketOrderNotifications(database, checkout.order_id);
      logTicketNotificationFailures('[TicketingCheckout] Complimentary tickets are issued.', delivery);
      return NextResponse.json({
        authorizationUrl: walletUrl.toString(),
        orderReference: checkout.order_reference,
        orderId: checkout.order_id,
        emailSent: delivery.email.status === 'sent' && ['sent', 'already_sent'].includes(delivery.email.value),
        whatsappSent: delivery.whatsapp.status === 'sent' && ['sent', 'already_sent'].includes(delivery.whatsapp.value)
      });
    } catch (confirmationError) {
      console.error('[TicketingCheckout] Could not issue complimentary tickets:', confirmationError);
      return NextResponse.json({ error: 'Free tickets could not be issued. Please retry this checkout.' }, { status: 503 });
    }
  }

  if (checkout.authorization_url) {
    return NextResponse.json({
      authorizationUrl: checkout.authorization_url,
      orderReference: checkout.order_reference,
      orderId: checkout.order_id
    });
  }

  try {
    const callbackUrl = new URL('/tickets/confirmation', getPublicBaseUrl());
    callbackUrl.searchParams.set('order', checkout.order_id);
    callbackUrl.searchParams.set('token', accessToken);
    const authorizationUrl = await initializePaystackTicketCheckout({
      email: buyerEmail,
      amountMinor: Number(checkout.amount_minor),
      reference: checkout.payment_reference,
      callbackUrl: callbackUrl.toString(),
      orderId: checkout.order_id
    });
    const { data: saved, error: saveError } = await database.rpc('ticketing_save_checkout_url', {
      p_payment_reference: checkout.payment_reference,
      p_authorization_url: authorizationUrl
    });
    if (saveError || saved !== true) {
      console.error('[TicketingCheckout] Could not save the Paystack checkout URL:', saveError);
      return NextResponse.json({
        error: 'Payment checkout was prepared but could not be saved safely. Retry this checkout shortly.'
      }, { status: 503 });
    }
    return NextResponse.json({
      authorizationUrl,
      orderReference: checkout.order_reference,
      orderId: checkout.order_id
    });
  } catch (checkoutError) {
    console.error('[TicketingCheckout] Paystack could not initialize checkout:', checkoutError);
    return NextResponse.json({
      error: 'Paystack could not start payment. Your reservation will expire automatically; do not retry a payment prompt that you already approved.'
    }, { status: 503 });
  }
}
