import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid promo code request is required.' }, { status: 400 });
  }
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const ticketTypeId = typeof body.ticketTypeId === 'string' ? body.ticketTypeId : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const quantity = typeof body.quantity === 'number' ? body.quantity : Number.NaN;
  if (!uuidPattern.test(eventId) || !uuidPattern.test(ticketTypeId)
    || !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
    return NextResponse.json({ error: 'Enter a valid promo code and ticket quantity.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing checkout is not configured.' }, { status: 503 });

  const [promotionResult, eventResult, typeResult] = await Promise.all([
    database.from('ticketing_promotions')
      .select('id,code,discount_type,discount_value,currency,max_redemptions,starts_at,ends_at')
      .eq('event_id', eventId)
      .eq('code', code)
      .eq('active', true)
      .maybeSingle(),
    database.from('ticketing_events').select('service_fee_minor').eq('id', eventId).eq('status', 'on_sale').maybeSingle(),
    database.from('ticketing_ticket_types')
      .select('id,price_minor,currency,min_per_order,max_per_order,status')
      .eq('id', ticketTypeId).eq('event_id', eventId).maybeSingle()
  ]);
  if (promotionResult.error || eventResult.error || typeResult.error) {
    console.error('[TicketingPromotions] Could not validate promo code:', promotionResult.error || eventResult.error || typeResult.error);
    return NextResponse.json({ error: 'Promo code could not be checked. Please try again.' }, { status: 503 });
  }
  const promotion = promotionResult.data;
  const event = eventResult.data;
  const ticketType = typeResult.data;
  const now = Date.now();
  if (!promotion || !event || !ticketType || ticketType.status !== 'active'
    || ticketType.currency !== 'KES' || promotion.currency !== ticketType.currency
    || quantity < ticketType.min_per_order || quantity > ticketType.max_per_order
    || (promotion.starts_at && new Date(promotion.starts_at).getTime() > now)
    || (promotion.ends_at && new Date(promotion.ends_at).getTime() <= now)) {
    return NextResponse.json({ error: 'This promo code is invalid or unavailable for this event.' }, { status: 400 });
  }

  if (promotion.max_redemptions !== null) {
    const { count, error } = await database.from('ticketing_promotion_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', promotion.id)
      .or(`status.eq.redeemed,and(status.eq.reserved,expires_at.gt.${new Date().toISOString()})`);
    if (error) {
      console.error('[TicketingPromotions] Could not check promo availability:', error);
      return NextResponse.json({ error: 'Promo availability could not be checked. Please try again.' }, { status: 503 });
    }
    if ((count || 0) >= promotion.max_redemptions) {
      return NextResponse.json({ error: 'This promo code has reached its redemption limit.' }, { status: 400 });
    }
  }

  const subtotalMinor = Number(ticketType.price_minor) * quantity;
  const feesMinor = Number(event.service_fee_minor) * quantity;
  const discountMinor = promotion.discount_type === 'percentage'
    ? Math.floor(subtotalMinor * Number(promotion.discount_value) / 100)
    : Math.min(Number(promotion.discount_value), subtotalMinor);
  return NextResponse.json({
    code: promotion.code,
    discountMinor,
    subtotalMinor,
    feesMinor,
    totalMinor: subtotalMinor + feesMinor - discountMinor,
    currency: ticketType.currency
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
