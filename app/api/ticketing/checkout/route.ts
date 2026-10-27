import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  assertTicketCredentialEncryptionKey,
  hashTicketAccessToken,
  createTicketCredentials
} from '@/lib/ticketing/credentials.server';
import {
  assertPaystackTicketPaymentConfiguration,
  initializePaystackTicketCheckout
} from '@/lib/ticketing/paystack.server';
import {
  assertPayHeroTicketPaymentConfiguration,
  initializePayHeroTicketCheckout
} from '@/lib/ticketing/payhero.server';
import { encryptTicketWalletToken } from '@/lib/ticketing/whatsapp.server';
import { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';
import { logTicketNotificationFailures, sendTicketOrderNotifications } from '@/lib/ticketing/notifications.server';
import { defaultTicketTheme, isTicketThemeId } from '@/lib/ticketing/theme';
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
  provider: 'paystack' | 'payhero' | 'complimentary';
  authorization_url: string | null;
  payhero_reference?: string | null;
  checkout_request_id?: string | null;
  initialization_status?: string | null;
  status: string;
};

function mapCheckoutError(code?: string, message?: string) {
  if (code === 'P0002') return { status: 409, message: 'This event or ticket option is not currently available.' };
  if (code === 'P0001') return { status: 409, message: 'There are not enough tickets available for that quantity.' };
  if (code === '22023' && message?.includes('whole KES')) {
    return { status: 400, message: 'PayHero M-Pesa ticket payments must be a whole KES amount. Please contact the event organizer to correct this ticket price.' };
  }
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
  if (body.emailTheme !== undefined && !isTicketThemeId(body.emailTheme)) {
    return NextResponse.json({ error: 'Choose one of the available ticket email colors.' }, { status: 400 });
  }
  const buyerEmailTheme = isTicketThemeId(body.emailTheme) ? body.emailTheme : defaultTicketTheme;
  const promotionCode = typeof body.promotionCode === 'string' ? body.promotionCode.trim().toUpperCase() : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
  if (!uuidPattern.test(eventId) || !uuidPattern.test(ticketTypeId)) {
    return NextResponse.json({ error: 'This ticket option is invalid. Refresh the page and choose a ticket again.' }, { status: 400 });
  }
  if (!buyerName || buyerName.length > 160) {
    return NextResponse.json({ error: 'Enter your name to continue.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) || buyerEmail.length > 320) {
    return NextResponse.json({ error: 'Enter a valid email address to continue.' }, { status: 400 });
  }
  if (!buyerPhone || !/^\+254[17]\d{8}$/.test(buyerPhone)) {
    return NextResponse.json({ error: 'Enter a valid Kenyan M-Pesa number, such as 0712345678 or +254712345678.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return NextResponse.json({ error: 'Choose a valid ticket quantity.' }, { status: 400 });
  }
  if (body.whatsappConsent !== true) {
    return NextResponse.json({ error: 'Please agree to receive your ticket wallet link by WhatsApp.' }, { status: 400 });
  }
  if (!tokenPattern.test(idempotencyKey) || !tokenPattern.test(accessToken)) {
    return NextResponse.json({ error: 'Checkout security verification failed. Refresh the page and try again.' }, { status: 400 });
  }
  if (promotionCode.length > 40 || (promotionCode !== '' && !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(promotionCode))) {
    return NextResponse.json({ error: 'Enter a valid promo code.' }, { status: 400 });
  }

  const paymentReference = `OBT-${randomBytes(16).toString('hex').toUpperCase()}`;
  const checkoutRpc = promotionCode
    ? 'ticketing_create_checkout_with_promotion'
    : 'ticketing_create_checkout';
  const { data, error } = await database.rpc(checkoutRpc, {
    p_event_id: eventId,
    p_ticket_type_id: ticketTypeId,
    p_quantity: quantity,
    p_buyer_email: buyerEmail,
    p_buyer_name: buyerName,
    p_idempotency_key: idempotencyKey,
    p_access_token_hash: hashTicketAccessToken(accessToken),
    p_payment_reference: paymentReference,
    ...(promotionCode ? { p_promotion_code: promotionCode } : {})
  });

  if (error) {
    if (error.code === 'P2001') return NextResponse.json({ error: 'This promo code is invalid or unavailable for this event.' }, { status: 400 });
    if (error.code === 'P2002') return NextResponse.json({ error: 'This promo code has reached its redemption limit.' }, { status: 409 });
    if (error.code === 'P2003') return NextResponse.json({ error: 'This checkout was already started with a different promo code. Start checkout again.' }, { status: 409 });
    const mapped = mapCheckoutError(error.code, error.message);
    if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    console.error('[TicketingCheckout] Could not create checkout:', error);
    if (error.code === 'PGRST202') {
      const requiredMigration = promotionCode
        ? 'TICKETING_PROMOTIONS_MIGRATION.sql'
        : 'TICKETING_COMMERCE_MIGRATION.sql';
      return NextResponse.json({
        error: `Ticket checkout is temporarily unavailable. The ticketing database setup needs attention (${requiredMigration}). Please contact support.`
      }, { status: 503 });
    }
    if (error.code === '42883') {
      const requiredMigrations = promotionCode
        ? 'TICKETING_COMMERCE_MIGRATION.sql and TICKETING_PROMOTIONS_MIGRATION.sql'
        : 'TICKETING_COMMERCE_MIGRATION.sql';
      return NextResponse.json({
        error: `Ticket checkout is temporarily unavailable. The ticketing database setup needs attention (${requiredMigrations}). Please contact support.`
      }, { status: 503 });
    }
    return NextResponse.json({
      error: 'Checkout could not be prepared. Please contact support and quote the event and time of your attempt.'
    }, { status: 503 });
  }

  const checkout = data as CheckoutResult | null;
  if (!checkout?.order_id || !checkout.payment_reference
      || !Number.isSafeInteger(Number(checkout.amount_minor))
      || checkout.currency !== 'KES'
      || !['paystack', 'payhero', 'complimentary'].includes(checkout.provider)) {
    console.error('[TicketingCheckout] Checkout RPC returned an invalid response.');
    return NextResponse.json({ error: 'Checkout could not be verified.' }, { status: 503 });
  }
  if (checkout.provider === 'paystack') {
    try {
      assertPaystackTicketPaymentConfiguration();
    } catch (configurationError) {
      console.error('[TicketingCheckout] Paystack configuration is not production-ready:', configurationError);
      const { error: releaseError } = await database.rpc('ticketing_fail_checkout', {
        p_payment_reference: checkout.payment_reference
      });
      if (releaseError) {
        console.error('[TicketingCheckout] Payment configuration is invalid and the reservation could not be released:', releaseError);
      }
      return NextResponse.json({
        error: process.env.NODE_ENV === 'production'
          ? 'Ticket payment is not available yet. The owner must configure matching live Paystack keys in the production checkout environment.'
          : 'Ticketing payment processing is not configured.'
      }, { status: 503 });
    }
  }

  const { error: contactError } = await database.from('ticketing_orders').update({
    buyer_phone: buyerPhone,
    access_token_ciphertext: encryptTicketWalletToken(accessToken),
    ...(checkout.status === 'paid' ? {} : { buyer_email_theme: buyerEmailTheme })
  }).eq('id', checkout.order_id).eq('access_token_hash', hashTicketAccessToken(accessToken));
  if (contactError) {
    console.error('[TicketingCheckout] Could not save ticket checkout preferences:', contactError);
    return NextResponse.json({
      error: contactError.code === '42703' || contactError.code === 'PGRST204'
        ? 'Ticket checkout needs the latest email-color preference database migration. Please contact support while this setup is completed.'
        : 'Checkout was prepared but secure ticket delivery preferences could not be saved. Retry this checkout.'
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

  if (checkout.provider === 'payhero') {
    if (checkout.payhero_reference) {
      return NextResponse.json({
        authorizationUrl: walletUrl.toString(),
        orderReference: checkout.order_reference,
        orderId: checkout.order_id
      });
    }
    if (checkout.initialization_status) {
      return NextResponse.json({
        authorizationUrl: walletUrl.toString(),
        orderReference: checkout.order_reference,
        orderId: checkout.order_id
      });
    }

    try {
      assertPayHeroTicketPaymentConfiguration();
    } catch (configurationError) {
      console.error('[TicketingCheckout] PayHero configuration is missing:', configurationError);
      return NextResponse.json({
        error: 'Ticketing M-Pesa payment is not configured. Contact ONLINE BAR support.',
        orderReference: checkout.order_reference
      }, { status: 503 });
    }

    const { data: claimed, error: claimError } = await database.rpc('ticketing_claim_payhero_initialization', {
      p_payment_reference: checkout.payment_reference
    });
    if (claimError) {
      console.error('[TicketingCheckout] Could not claim PayHero initialization:', claimError);
      return NextResponse.json({
        error: 'The M-Pesa request could not be safely started. Contact ONLINE BAR support and quote the order reference.',
        orderReference: checkout.order_reference
      }, { status: 503 });
    }
    if (claimed !== true) {
      return NextResponse.json({
        authorizationUrl: walletUrl.toString(),
        orderReference: checkout.order_reference,
        orderId: checkout.order_id
      });
    }

    try {
      const callbackUrl = new URL('/api/payhero/ticketing/webhook', getPublicBaseUrl());
      const callbackSecret = randomBytes(32).toString('hex');
      callbackUrl.searchParams.set('key', callbackSecret);
      const payment = await initializePayHeroTicketCheckout({
        amountMinor: Number(checkout.amount_minor),
        phone: buyerPhone,
        customerName: buyerName,
        externalReference: checkout.payment_reference,
        callbackUrl: callbackUrl.toString()
      });
      const { data: saved, error: saveError } = await database.rpc('ticketing_save_payhero_reference', {
        p_payment_reference: checkout.payment_reference,
        p_payhero_reference: payment.reference,
        p_checkout_request_id: payment.checkoutRequestId,
        p_callback_secret_hash: createHash('sha256').update(callbackSecret).digest('hex')
      });
      if (saveError || saved !== true) {
        console.error('[TicketingCheckout] Could not save the PayHero transaction reference:', saveError);
        return NextResponse.json({
          error: 'The M-Pesa request may already be on your phone. Do not start or approve another request; contact ONLINE BAR support and quote the order reference.',
          orderReference: checkout.order_reference
        }, { status: 503 });
      }
      return NextResponse.json({
        authorizationUrl: walletUrl.toString(),
        orderReference: checkout.order_reference,
        orderId: checkout.order_id
      });
    } catch (checkoutError) {
      console.error('[TicketingCheckout] PayHero could not initialize ticket payment:', checkoutError);
      return NextResponse.json({
        error: 'PayHero could not confirm whether the M-Pesa request started. Check your phone before retrying; do not approve a duplicate prompt.',
        orderReference: checkout.order_reference
      }, { status: 503 });
    }
  }

  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
    return NextResponse.json({ error: 'Paystack is not configured for this existing ticket payment. Contact support before retrying.' }, { status: 503 });
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
