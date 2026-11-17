import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import {
  createCheckoutRecoveryToken,
  escapeRecoveryHtml,
  getCheckoutRecoveryDatabase,
  isValidCheckoutEmail,
  normalizeCheckoutRecoveryItems,
  renderRecoveryMessage
} from '@/lib/checkoutRecovery.server';
import { createMarketingUnsubscribeToken } from '@/lib/marketingUnsubscribe';
import { getTransactionalEmailConfig, sendTransactionalEmail, withTransactionalEmailSenderName } from '@/lib/jmsurfMail.server';
import { getPublicBaseUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ABANDONMENT_QUIET_PERIOD_MS = 60 * 60 * 1000;
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface RecoverySessionRow {
  id: string;
  session_id: string;
  customer_name: string;
  customer_email: string;
  cart_items: unknown;
  total_price: number;
  status: string;
  suppression_reason: string | null;
  consented_at: string;
  last_activity_at: string;
  sent_at: string | null;
  send_attempts: number;
  recovered_order_id: number | null;
  recovered_revenue: number | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type RecoveryAdminAccess =
  | { database: NonNullable<ReturnType<typeof getCheckoutRecoveryDatabase>>; response?: never }
  | { database: null; response: NextResponse };

async function getAuthorizedDatabase(request?: Request) {
  if (request && !isSameOriginRequest(request)) {
    return { database: null, response: NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 }) } satisfies RecoveryAdminAccess;
  }
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_marketing')) {
    return { database: null, response: NextResponse.json({ error: 'Marketing permission required.' }, { status: 403 }) } satisfies RecoveryAdminAccess;
  }
  const database = getCheckoutRecoveryDatabase();
  if (!database) {
    return { database: null, response: NextResponse.json({ error: 'Checkout recovery database access is not configured.' }, { status: 503 }) } satisfies RecoveryAdminAccess;
  }
  return { database } satisfies RecoveryAdminAccess;
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if (!access.database) return access.response;
  const { database } = access;

  const { data: rows, error } = await database
    .from('checkout_recovery_sessions')
    .select('id,session_id,customer_name,customer_email,cart_items,total_price,status,suppression_reason,consented_at,last_activity_at,sent_at,send_attempts,recovered_order_id,recovered_revenue,failure_reason,created_at,updated_at')
    .order('last_activity_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[CheckoutRecoveryAdmin] Could not load recovery sessions:', error);
    return NextResponse.json({ error: 'Could not load abandoned checkouts. Apply ABANDONED_CHECKOUT_EMAIL_RECOVERY_MIGRATION.sql.' }, { status: 503 });
  }

  const sessions = (rows || []) as RecoverySessionRow[];
  const emails = [...new Set(sessions.map(row => row.customer_email.toLowerCase()))];
  const sessionIds = [...new Set(sessions.map(row => row.session_id))];
  const productIds = [...new Set(sessions.flatMap(row => {
    const items = normalizeCheckoutRecoveryItems(row.cart_items);
    return items ? items.map(item => item.id) : [];
  }))];
  const [subscriptionsResult, ordersResult] = await Promise.all([
    emails.length
      ? database.from('newsletter_subscribers')
          .select('email')
          .in('email', emails)
          .eq('is_active', true)
          .not('consented_at', 'is', null)
          .is('unsubscribed_at', null)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? database.from('orders')
          .select('id,session_id,total_price,created_at')
          .in('session_id', sessionIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (subscriptionsResult.error || ordersResult.error) {
    console.error('[CheckoutRecoveryAdmin] Could not verify consent or purchase suppression:', subscriptionsResult.error || ordersResult.error);
    return NextResponse.json({ error: 'Consent and purchase suppression could not be verified.' }, { status: 503 });
  }

  const productChunks = [];
  for (let offset = 0; offset < productIds.length; offset += 500) {
    productChunks.push(productIds.slice(offset, offset + 500));
  }
  const productResults = await Promise.all(productChunks.map(productChunk => database.from('products')
    .select('id,stock,variant_stock,status,hide_product,is_available_now')
    .in('id', productChunk)));
  const productError = productResults.find(result => result.error)?.error;
  if (productError) {
    console.error('[CheckoutRecoveryAdmin] Could not verify product availability:', productError);
    return NextResponse.json({ error: 'Product availability could not be verified.' }, { status: 503 });
  }

  const activeEmails = new Set((subscriptionsResult.data || []).map(item => item.email.toLowerCase()));
  const productsById = new Map(productResults.flatMap(result => result.data || []).map(product => [product.id, product]));
  const orderBySession = new Map<string, { id: number; total_price: number; created_at: string }>();
  for (const order of ordersResult.data || []) {
    if (!order.session_id) continue;
    const existing = orderBySession.get(order.session_id);
    if (!existing || Date.parse(order.created_at) > Date.parse(existing.created_at)) {
      orderBySession.set(order.session_id, order);
    }
  }

  const now = Date.now();
  const output = [];
  for (const row of sessions) {
    const lastActivity = Date.parse(row.last_activity_at);
    const linkedOrder = row.recovered_order_id
      ? (ordersResult.data || []).find(order => order.id === row.recovered_order_id)
      : null;
    const sameSessionOrder = orderBySession.get(row.session_id);
    let status = row.status;
    let suppressionReason = row.suppression_reason;
    let recoveredOrderId = row.recovered_order_id;
    let recoveredRevenue = row.recovered_revenue;
    let failureReason = row.failure_reason;
    const updates: Record<string, unknown> = {};
    const items = normalizeCheckoutRecoveryItems(row.cart_items);
    const stockChanged = Boolean(items?.some(item => {
      const product = productsById.get(item.id);
      if (!product || product.hide_product === true
        || (typeof product.status === 'string' && ['draft', 'hidden', 'inactive', 'archived', 'deleted'].includes(product.status.toLowerCase()))
        || product.is_available_now === false) return true;
      const variants = isRecord(product.variant_stock) ? product.variant_stock : {};
      const stock = Number(variants[item.size || 'Standard'] ?? product.stock ?? 0);
      return !Number.isSafeInteger(stock)
        || stock < item.quantity
        || (item.stock_snapshot !== undefined && stock !== item.stock_snapshot);
    }));

    if (status !== 'converted' && sameSessionOrder
      && Date.parse(sameSessionOrder.created_at) >= Date.parse(row.created_at)) {
      status = 'suppressed';
      suppressionReason = 'order_placed';
      updates.status = status;
      updates.suppression_reason = suppressionReason;
      updates.updated_at = new Date().toISOString();
    } else if (stockChanged && ['active', 'abandoned', 'failed'].includes(status)) {
      status = 'suppressed';
      suppressionReason = 'stock_or_availability_changed';
      updates.status = status;
      updates.suppression_reason = suppressionReason;
      updates.updated_at = new Date().toISOString();
    } else if (!activeEmails.has(row.customer_email.toLowerCase())
      && ['active', 'abandoned', 'sent', 'failed'].includes(status)) {
      status = 'opted_out';
      updates.status = status;
      updates.updated_at = new Date().toISOString();
    } else if (status === 'sending' && now - Date.parse(row.updated_at) > 20 * 60 * 1000) {
      status = 'failed';
      failureReason = 'The previous send attempt did not finish. You can retry after verifying provider delivery.';
      updates.status = status;
      updates.failure_reason = failureReason;
      updates.updated_at = new Date().toISOString();
    } else if (['active', 'abandoned', 'failed'].includes(status) && now - lastActivity > SESSION_RETENTION_MS) {
      status = 'expired';
      updates.status = status;
      updates.updated_at = new Date().toISOString();
    } else if (status === 'active' && now - lastActivity >= ABANDONMENT_QUIET_PERIOD_MS) {
      status = 'abandoned';
      updates.status = status;
      updates.updated_at = new Date().toISOString();
    }

    if (status === 'converted' && linkedOrder) {
      recoveredOrderId = linkedOrder.id;
      recoveredRevenue = Number(linkedOrder.total_price);
    }

    if (Object.keys(updates).length) {
      const { error: updateError } = await database
        .from('checkout_recovery_sessions')
        .update(updates)
        .eq('id', row.id);
      if (updateError) {
        console.error('[CheckoutRecoveryAdmin] Could not update recovery session status:', updateError);
        return NextResponse.json({ error: 'A recovery status could not be updated. Please refresh and try again.' }, { status: 503 });
      }
    }

    output.push({
      ...row,
      status,
      suppression_reason: suppressionReason,
      recovered_order_id: recoveredOrderId,
      recovered_revenue: recoveredRevenue,
      failure_reason: failureReason,
      consent_active: activeEmails.has(row.customer_email.toLowerCase())
    });
  }

  return NextResponse.json({ sessions: output }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  const access = await getAuthorizedDatabase(request);
  if (!access.database) return access.response;
  const { database } = access;

  let body: { id?: unknown; subject?: unknown; message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid recovery message is required.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const subjectTemplate = typeof body.subject === 'string' ? body.subject.trim().replace(/[\r\n]+/g, ' ') : '';
  const messageTemplate = typeof body.message === 'string' ? body.message.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !subjectTemplate || subjectTemplate.length > 180
    || !messageTemplate || messageTemplate.length > 2000) {
    return NextResponse.json({ error: 'The subject, message, or checkout record is invalid.' }, { status: 400 });
  }

  const { data: row, error: rowError } = await database
    .from('checkout_recovery_sessions')
    .select('id,session_id,customer_name,customer_email,cart_items,total_price,status,last_activity_at,send_attempts,created_at')
    .eq('id', id)
    .maybeSingle();
  if (rowError) {
    console.error('[CheckoutRecoveryAdmin] Could not load recovery session:', rowError);
    return NextResponse.json({ error: 'The checkout recovery record could not be loaded.' }, { status: 503 });
  }
  if (!row) return NextResponse.json({ error: 'This checkout recovery record no longer exists.' }, { status: 404 });
  if (!['abandoned', 'failed'].includes(row.status)) {
    return NextResponse.json({ error: 'This checkout is not ready to send. Refresh the queue before trying again.' }, { status: 409 });
  }
  if (Date.now() - Date.parse(row.last_activity_at) < ABANDONMENT_QUIET_PERIOD_MS) {
    return NextResponse.json({ error: 'This checkout has been active too recently to contact.' }, { status: 409 });
  }

  const email = String(row.customer_email).trim().toLowerCase();
  if (!isValidCheckoutEmail(email)) {
    return NextResponse.json({ error: 'This checkout has no valid email address.' }, { status: 409 });
  }
  const { data: consent, error: consentError } = await database
    .from('newsletter_subscribers')
    .select('email')
    .eq('email', email)
    .eq('is_active', true)
    .not('consented_at', 'is', null)
    .is('unsubscribed_at', null)
    .maybeSingle();
  if (consentError) {
    console.error('[CheckoutRecoveryAdmin] Could not verify current marketing consent:', consentError);
    return NextResponse.json({ error: 'Current marketing consent could not be verified.' }, { status: 503 });
  }
  if (!consent) {
    const { error: optOutError } = await database
      .from('checkout_recovery_sessions')
      .update({ status: 'opted_out', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['abandoned', 'failed']);
    if (optOutError) console.error('[CheckoutRecoveryAdmin] Could not mark opted-out session:', optOutError);
    return NextResponse.json({ error: 'This customer no longer has active email-marketing consent.' }, { status: 409 });
  }

  const items = normalizeCheckoutRecoveryItems(row.cart_items);
  if (!items) {
    return NextResponse.json({ error: 'The saved cart is invalid and cannot be sent safely.' }, { status: 409 });
  }
  const productIds = [...new Set(items.map(item => item.id))];
  const { data: products, error: productsError } = await database
    .from('products')
    .select('id,stock,variant_stock,status,hide_product,is_available_now')
    .in('id', productIds);
  if (productsError) {
    console.error('[CheckoutRecoveryAdmin] Could not verify current product availability:', productsError);
    return NextResponse.json({ error: 'Product availability could not be verified. No message was sent.' }, { status: 503 });
  }
  const productsById = new Map((products || []).map(product => [product.id, product]));
  const unavailable = items.some(item => {
    const product = productsById.get(item.id);
    if (!product || product.hide_product === true
      || (typeof product.status === 'string' && ['draft', 'hidden', 'inactive', 'archived', 'deleted'].includes(product.status.toLowerCase()))
      || product.is_available_now === false) return true;
    const variants = isRecord(product.variant_stock) ? product.variant_stock : {};
    const sizeStock = variants[item.size || 'Standard'];
    const stock = Number(sizeStock ?? product.stock ?? 0);
    return !Number.isSafeInteger(stock)
      || stock < item.quantity
      || (item.stock_snapshot !== undefined && stock !== item.stock_snapshot);
  });
  if (unavailable) {
    const { error: suppressError } = await database
      .from('checkout_recovery_sessions')
      .update({
        status: 'suppressed',
        suppression_reason: 'stock_or_availability_changed',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .in('status', ['abandoned', 'failed']);
    if (suppressError) console.error('[CheckoutRecoveryAdmin] Could not suppress unavailable cart:', suppressError);
    return NextResponse.json({ error: 'A cart item is no longer available in the requested quantity. No reminder was sent.' }, { status: 409 });
  }

  const { data: existingOrder, error: orderError } = await database
    .from('orders')
    .select('id')
    .eq('session_id', row.session_id)
    .gte('created_at', row.created_at)
    .limit(1)
    .maybeSingle();
  if (orderError) {
    console.error('[CheckoutRecoveryAdmin] Could not verify purchase suppression:', orderError);
    return NextResponse.json({ error: 'A recent purchase could not be checked. No message was sent.' }, { status: 503 });
  }
  if (existingOrder) {
    const { error: suppressError } = await database
      .from('checkout_recovery_sessions')
      .update({
        status: 'suppressed',
        suppression_reason: 'order_placed',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .in('status', ['abandoned', 'failed']);
    if (suppressError) console.error('[CheckoutRecoveryAdmin] Could not suppress a purchased checkout:', suppressError);
    return NextResponse.json({ error: 'An order has already been placed for this checkout. No reminder was sent.' }, { status: 409 });
  }

  const config = getTransactionalEmailConfig();
  if (!config.configured) {
    return NextResponse.json({ error: 'Email is not configured. Set JMSURF_MAIL_KEY and JMSURF_FROM_EMAIL, or RESEND_API_KEY and RESEND_FROM_EMAIL.' }, { status: 503 });
  }

  const { token, hash } = createCheckoutRecoveryToken();
  const timestamp = new Date().toISOString();
  const { data: claimed, error: claimError } = await database
    .from('checkout_recovery_sessions')
    .update({
      status: 'sending',
      send_attempts: Number(row.send_attempts || 0) + 1,
      recovery_token_hash: hash,
      recovery_token_expires_at: new Date(Date.now() + RECOVERY_LINK_LIFETIME_MS).toISOString(),
      failure_reason: null,
      updated_at: timestamp
    })
    .eq('id', id)
    .eq('status', row.status)
    .select('id')
    .maybeSingle();
  if (claimError) {
    console.error('[CheckoutRecoveryAdmin] Could not reserve the recovery send:', claimError);
    return NextResponse.json({ error: 'The recovery send could not be reserved safely.' }, { status: 503 });
  }
  if (!claimed) return NextResponse.json({ error: 'Another admin action changed this checkout. Refresh the queue.' }, { status: 409 });

  const [sendStateResult, latestConsentResult, latestOrderResult] = await Promise.all([
    database.from('checkout_recovery_sessions').select('status').eq('id', id).maybeSingle(),
    database.from('newsletter_subscribers')
      .select('email')
      .eq('email', email)
      .eq('is_active', true)
      .not('consented_at', 'is', null)
      .is('unsubscribed_at', null)
      .maybeSingle(),
    database.from('orders')
      .select('id')
      .eq('session_id', row.session_id)
      .gte('created_at', row.created_at)
      .limit(1)
      .maybeSingle()
  ]);
  if (sendStateResult.error || latestConsentResult.error || latestOrderResult.error) {
    console.error('[CheckoutRecoveryAdmin] Could not repeat send-suppression checks:', sendStateResult.error || latestConsentResult.error || latestOrderResult.error);
    const { error: releaseError } = await database.from('checkout_recovery_sessions')
      .update({ status: row.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'sending');
    if (releaseError) console.error('[CheckoutRecoveryAdmin] Could not release the reserved recovery send:', releaseError);
    return NextResponse.json({ error: 'Consent and purchase suppression could not be rechecked. No message was sent.' }, { status: 503 });
  }
  if (sendStateResult.data?.status !== 'sending') {
    return NextResponse.json({ error: 'This checkout was suppressed before the email could be sent.' }, { status: 409 });
  }
  if (!latestConsentResult.data) {
    const { error: optOutUpdateError } = await database.from('checkout_recovery_sessions')
      .update({
        status: 'opted_out',
        recovery_token_hash: null,
        recovery_token_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'sending');
    if (optOutUpdateError) console.error('[CheckoutRecoveryAdmin] Could not mark the session as opted out:', optOutUpdateError);
    return NextResponse.json({ error: 'This customer no longer has active marketing consent.' }, { status: 409 });
  }
  if (latestOrderResult.data) {
    const { error: orderSuppressionError } = await database.from('checkout_recovery_sessions')
      .update({
        status: 'suppressed',
        suppression_reason: 'order_placed',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'sending');
    if (orderSuppressionError) console.error('[CheckoutRecoveryAdmin] Could not suppress a checkout with a new order:', orderSuppressionError);
    return NextResponse.json({ error: 'An order was placed before sending. No reminder was sent.' }, { status: 409 });
  }

  const origin = getPublicBaseUrl();
  const checkoutUrl = `${origin}/checkout?recover=${encodeURIComponent(token)}`;
  const firstName = String(row.customer_name || 'there').trim().split(/\s+/)[0] || 'there';
  const itemNames = items.map(item => `${item.quantity} × ${item.name}`).join(', ');
  const message = renderRecoveryMessage(messageTemplate, { firstName, items: itemNames, checkoutUrl });
  const subject = renderRecoveryMessage(subjectTemplate, { firstName, items: itemNames, checkoutUrl });
  const unsubscribeUrl = `${origin}/newsletter/unsubscribe?token=${encodeURIComponent(createMarketingUnsubscribeToken(email))}`;
  const htmlMessage = escapeRecoveryHtml(message).replace(/\r?\n/g, '<br>');
  const safeFirstName = escapeRecoveryHtml(firstName);
  const safeItemNames = escapeRecoveryHtml(itemNames);
  const safeCheckoutUrl = escapeRecoveryHtml(checkoutUrl);
  const safeUnsubscribeUrl = escapeRecoveryHtml(unsubscribeUrl);

  try {
    await sendTransactionalEmail({
      from: withTransactionalEmailSenderName(config.from, 'Online Bar'),
      to: email,
      subject,
      idempotencyKey: `abandoned-checkout-${id}-reminder-1`,
      text: `${message}\n\nYou received this because you opted in to Online Bar marketing emails. Unsubscribe: ${unsubscribeUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#172033;">
        <h2 style="color:#e18a00;">Hi ${safeFirstName}, your cart is saved.</h2>
        <p>${htmlMessage}</p>
        <p style="color:#667085;font-size:14px;">Saved items: ${safeItemNames}</p>
        <p><a href="${safeCheckoutUrl}" style="display:inline-block;background:#161616;color:#fff;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:700;">RETURN TO CHECKOUT</a></p>
        <hr style="border:0;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#667085;">You received this because you opted in to Online Bar marketing emails. <a href="${safeUnsubscribeUrl}">Unsubscribe</a></p>
      </div>`
    });
  } catch (sendError) {
    console.error('[CheckoutRecoveryAdmin] Recovery email could not be sent:', sendError);
    const { error: failureUpdateError } = await database
      .from('checkout_recovery_sessions')
      .update({
        status: 'failed',
        recovery_token_hash: null,
        recovery_token_expires_at: null,
        failure_reason: sendError instanceof Error ? sendError.message.slice(0, 500) : 'The email provider rejected the message.',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'sending');
    if (failureUpdateError) console.error('[CheckoutRecoveryAdmin] Could not record recovery email failure:', failureUpdateError);
    return NextResponse.json({ error: 'The recovery email could not be sent. Review the provider configuration and retry.' }, { status: 502 });
  }

  const { error: sentUpdateError } = await database
    .from('checkout_recovery_sessions')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      failure_reason: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('status', 'sending');
  if (sentUpdateError) {
    console.error('[CheckoutRecoveryAdmin] Email sent, but its queue status could not be updated:', sentUpdateError);
    return NextResponse.json({ sent: true, warning: 'The email was sent, but the queue status could not be refreshed. Do not send it again.' }, { status: 200 });
  }

  return NextResponse.json({ sent: true });
}
