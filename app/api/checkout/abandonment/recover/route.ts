import { NextResponse } from 'next/server';
import {
  getCheckoutRecoveryDatabase,
  hashCheckoutRecoveryToken,
  normalizeCheckoutRecoveryItems
} from '@/lib/checkoutRecovery.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (token.length < 32 || token.length > 200) {
    return NextResponse.json({ error: 'This recovery link is invalid or expired.' }, { status: 400 });
  }

  const database = getCheckoutRecoveryDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Checkout recovery is temporarily unavailable.' }, { status: 503 });
  }

  const { data: session, error } = await database
    .from('checkout_recovery_sessions')
    .select('id,session_id,cart_items,status,recovery_token_expires_at,created_at')
    .eq('recovery_token_hash', hashCheckoutRecoveryToken(token))
    .maybeSingle();
  if (error) {
    console.error('[CheckoutRecoveryLink] Could not load the recovery session:', error);
    return NextResponse.json({ error: 'This recovery link could not be verified.' }, { status: 503 });
  }
  if (!session || session.status !== 'sent'
    || !session.recovery_token_expires_at
    || Date.parse(session.recovery_token_expires_at) <= Date.now()) {
    return NextResponse.json({ error: 'This recovery link is invalid or expired.' }, { status: 404 });
  }

  const { data: order, error: orderError } = await database
    .from('orders')
    .select('id')
    .eq('session_id', session.session_id)
    .gte('created_at', session.created_at)
    .limit(1)
    .maybeSingle();
  if (orderError) {
    console.error('[CheckoutRecoveryLink] Could not verify whether an order was placed:', orderError);
    return NextResponse.json({ error: 'The recovery link could not be checked against recent orders.' }, { status: 503 });
  }
  if (order) {
    const { error: updateError } = await database
      .from('checkout_recovery_sessions')
      .update({
        status: 'suppressed',
        suppression_reason: 'order_placed',
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id)
      .eq('status', 'sent');
    if (updateError) console.error('[CheckoutRecoveryLink] Could not suppress a purchased checkout:', updateError);
    return NextResponse.json({ error: 'An order has already been placed for this checkout.' }, { status: 409 });
  }

  const cart = normalizeCheckoutRecoveryItems(session.cart_items);
  if (!cart) {
    return NextResponse.json({ error: 'The saved cart could not be restored.' }, { status: 409 });
  }
  const { data: products, error: productsError } = await database
    .from('products')
    .select('id,stock,variant_stock,status,hide_product,is_available_now')
    .in('id', [...new Set(cart.map(item => item.id))]);
  if (productsError) {
    console.error('[CheckoutRecoveryLink] Could not verify saved cart product availability:', productsError);
    return NextResponse.json({ error: 'Product availability could not be verified. Please refresh the shop and build a current cart.' }, { status: 503 });
  }
  const productsById = new Map((products || []).map(product => [product.id, product]));
  const unavailable = cart.some(item => {
    const product = productsById.get(item.id);
    if (!product || product.hide_product === true
      || (typeof product.status === 'string' && ['draft', 'hidden', 'inactive', 'archived', 'deleted'].includes(product.status.toLowerCase()))
      || product.is_available_now === false) return true;
    const variants = typeof product.variant_stock === 'object' && product.variant_stock !== null
      && !Array.isArray(product.variant_stock)
      ? product.variant_stock as Record<string, unknown>
      : {};
    const stock = Number(variants[item.size || 'Standard'] ?? product.stock ?? 0);
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
      .eq('id', session.id)
      .eq('status', 'sent');
    if (suppressError) console.error('[CheckoutRecoveryLink] Could not suppress a cart with changed stock:', suppressError);
    return NextResponse.json({ error: 'An item in this cart is no longer available. Please refresh the shop and build a current cart.' }, { status: 409 });
  }

  return NextResponse.json({ cart, recoverySessionId: session.id }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
