import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import {
  getCheckoutRecoveryDatabase,
  isValidCheckoutEmail,
  normalizeCheckoutRecoveryItems
} from '@/lib/checkoutRecovery.server';

export const dynamic = 'force-dynamic';

interface RecoveryRequest {
  sessionId?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  cartItems?: unknown;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin checkout request required.' }, { status: 403 });
  }

  let body: RecoveryRequest;
  try {
    body = await request.json() as RecoveryRequest;
  } catch {
    return NextResponse.json({ error: 'A valid checkout recovery record is required.' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim().slice(0, 120) : '';
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim().toLowerCase() : '';
  const cartItems = normalizeCheckoutRecoveryItems(body.cartItems);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(sessionId)
    || !isValidCheckoutEmail(customerEmail)
    || !cartItems) {
    return NextResponse.json({ error: 'The checkout recovery details are invalid.' }, { status: 400 });
  }

  const database = getCheckoutRecoveryDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Checkout recovery is not configured on the server.' }, { status: 503 });
  }

  const { data: subscription, error: consentError } = await database
    .from('newsletter_subscribers')
    .select('email')
    .eq('email', customerEmail)
    .eq('is_active', true)
    .not('consented_at', 'is', null)
    .is('unsubscribed_at', null)
    .maybeSingle();
  if (consentError) {
    console.error('[CheckoutRecovery] Could not verify email marketing consent:', consentError);
    return NextResponse.json({ error: 'Email consent could not be verified. Your checkout is unaffected.' }, { status: 503 });
  }
  if (!subscription) {
    return NextResponse.json({ saved: false, reason: 'consent_required' });
  }

  const { data: existing, error: existingError } = await database
    .from('checkout_recovery_sessions')
    .select('id, status')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (existingError) {
    console.error('[CheckoutRecovery] Could not inspect the existing checkout session:', existingError);
    return NextResponse.json({ error: 'The recovery queue is unavailable. Your checkout is unaffected.' }, { status: 503 });
  }
  if (existing && ['sending', 'sent', 'converted', 'opted_out', 'suppressed', 'expired'].includes(existing.status)) {
    return NextResponse.json({ saved: true });
  }

  const { data: products, error: productsError } = await database
    .from('products')
    .select('id,stock,variant_stock,status,hide_product,is_available_now')
    .in('id', [...new Set(cartItems.map(item => item.id))]);
  if (productsError) {
    console.error('[CheckoutRecovery] Could not snapshot product availability:', productsError);
    return NextResponse.json({ error: 'Product availability could not be saved for recovery. Your checkout is unaffected.' }, { status: 503 });
  }
  const productsById = new Map((products || []).map(product => [product.id, product]));
  const snapshotItems = [];
  for (const item of cartItems) {
    const product = productsById.get(item.id);
    if (!product || product.hide_product === true
      || (typeof product.status === 'string' && ['draft', 'hidden', 'inactive', 'archived', 'deleted'].includes(product.status.toLowerCase()))
      || product.is_available_now === false) {
      if (existing) {
        const { error: suppressError } = await database
          .from('checkout_recovery_sessions')
          .update({ status: 'suppressed', suppression_reason: 'stock_or_availability_changed', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (suppressError) console.error('[CheckoutRecovery] Could not suppress an unavailable checkout:', suppressError);
      }
      return NextResponse.json({ saved: false, reason: 'unavailable' });
    }
    const variants = typeof product.variant_stock === 'object' && product.variant_stock !== null
      && !Array.isArray(product.variant_stock)
      ? product.variant_stock as Record<string, unknown>
      : {};
    const stock = Number(variants[item.size || 'Standard'] ?? product.stock ?? 0);
    if (!Number.isSafeInteger(stock) || stock < item.quantity) {
      if (existing) {
        const { error: suppressError } = await database
          .from('checkout_recovery_sessions')
          .update({ status: 'suppressed', suppression_reason: 'stock_or_availability_changed', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (suppressError) console.error('[CheckoutRecovery] Could not suppress a checkout with insufficient stock:', suppressError);
      }
      return NextResponse.json({ saved: false, reason: 'unavailable' });
    }
    snapshotItems.push({ ...item, stock_snapshot: stock });
  }

  const timestamp = new Date().toISOString();
  const totalPrice = snapshotItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const { error: saveError } = await database
    .from('checkout_recovery_sessions')
    .upsert({
      session_id: sessionId,
      customer_name: customerName || 'there',
      customer_email: customerEmail,
      cart_items: snapshotItems,
      total_price: totalPrice,
      status: 'active',
      suppression_reason: null,
      consented_at: timestamp,
      last_activity_at: timestamp,
      recovery_token_hash: null,
      recovery_token_expires_at: null,
      failure_reason: null,
      updated_at: timestamp
    }, { onConflict: 'session_id' });
  if (saveError) {
    console.error('[CheckoutRecovery] Could not save the consented checkout session:', saveError);
    return NextResponse.json({ error: 'The recovery session could not be saved. Your checkout is unaffected.' }, { status: 503 });
  }

  return NextResponse.json({ saved: true });
}
