import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { session: null, response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return { session: null, response: NextResponse.json({ error: 'Ticket promotions are restricted to platform admins.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { session: null, response: NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 }) };
  return { session, database, response: null };
}

function parseDate(value: unknown) {
  if (value === null || value === '') return { valid: true, date: null as string | null };
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return { valid: false, date: null };
  const date = new Date(value);
  return { valid: !Number.isNaN(date.getTime()), date: Number.isNaN(date.getTime()) ? null : date.toISOString() };
}

export async function GET(request: Request) {
  const { database, response } = await authorize();
  if (response) return response;
  const eventId = new URL(request.url).searchParams.get('eventId') || '';
  if (!uuidPattern.test(eventId)) return NextResponse.json({ error: 'Select a valid event.' }, { status: 400 });

  const { data, error } = await database!
    .from('ticketing_promotions')
    .select('id,event_id,code,discount_type,discount_value,currency,max_redemptions,starts_at,ends_at,active,created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[TicketingPromotions] Could not load promotions:', error);
    return NextResponse.json({ error: 'Promotions could not be loaded. Apply TICKETING_PROMOTIONS_MIGRATION.sql.' }, { status: 503 });
  }

  const ids = (data || []).map(promotion => promotion.id);
  const redemptionResult = ids.length
    ? await database!.from('ticketing_promotion_redemptions').select('promotion_id,status,expires_at').in('promotion_id', ids)
    : { data: [], error: null };
  if (redemptionResult.error) {
    console.error('[TicketingPromotions] Could not load redemption counts:', redemptionResult.error);
    return NextResponse.json({ error: 'Promotion redemption data could not be loaded.' }, { status: 503 });
  }
  const counts = new Map<string, number>();
  for (const redemption of redemptionResult.data || []) {
    if (redemption.status === 'redeemed'
      || (redemption.status === 'reserved' && new Date(redemption.expires_at).getTime() > Date.now())) {
      counts.set(redemption.promotion_id, (counts.get(redemption.promotion_id) || 0) + 1);
    }
  }
  return NextResponse.json({
    promotions: (data || []).map(promotion => ({ ...promotion, redemptions: counts.get(promotion.id) || 0 }))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const { session, database, response } = await authorize();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid promotion request is required.' }, { status: 400 });
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const action = body.action;
  if (!uuidPattern.test(eventId)) return NextResponse.json({ error: 'Select a valid event.' }, { status: 400 });

  if (action === 'set_active') {
    const promotionId = typeof body.promotionId === 'string' ? body.promotionId : '';
    if (!uuidPattern.test(promotionId) || typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'Select a valid promotion and status.' }, { status: 400 });
    }
    const { data, error } = await database!.from('ticketing_promotions')
      .update({ active: body.active })
      .eq('id', promotionId)
      .eq('event_id', eventId)
      .select('id,event_id,code,active')
      .maybeSingle();
    if (error || !data) {
      console.error('[TicketingPromotions] Could not update promotion:', error);
      return NextResponse.json({ error: 'The promotion could not be updated.' }, { status: 503 });
    }
    const { error: auditError } = await database!.from('ticketing_audit_logs').insert({
      actor_email: session!.email || '',
      action: body.active ? 'promotion.activated' : 'promotion.paused',
      entity_type: 'promotion',
      entity_id: promotionId,
      after_state: { active: body.active, code: data.code }
    });
    if (auditError) {
      console.error('[TicketingPromotions] Promotion changed, but audit logging failed:', auditError);
      return NextResponse.json({ error: 'Promotion status changed, but its audit entry could not be saved. Contact support.' }, { status: 503 });
    }
    return NextResponse.json({ promotion: data });
  }

  if (action !== 'create') return NextResponse.json({ error: 'Choose a supported promotion action.' }, { status: 400 });
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const discountType = body.discountType === 'percentage' || body.discountType === 'fixed' ? body.discountType : null;
  const discountValue = typeof body.discountValue === 'number' ? body.discountValue : Number.NaN;
  const maxRedemptions = body.maxRedemptions === '' || body.maxRedemptions === null || body.maxRedemptions === undefined
    ? null : Number(body.maxRedemptions);
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  const startsAtValue = startsAt.date;
  const endsAtValue = endsAt.date;
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)
    || !discountType
    || !Number.isSafeInteger(discountValue) || discountValue < 1
    || (discountType === 'percentage' && discountValue > 100)
    || (discountType === 'fixed' && discountValue > 100_000_000)
    || (maxRedemptions !== null && (!Number.isSafeInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1_000_000))
    || !startsAt.valid || !endsAt.valid
    || (startsAtValue && endsAtValue && startsAtValue >= endsAtValue)
    || typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Enter a valid code, discount, redemption limit and optional date range.' }, { status: 400 });
  }

  const eventResult = await database!.from('ticketing_events').select('id').eq('id', eventId).maybeSingle();
  if (eventResult.error || !eventResult.data) {
    if (eventResult.error) console.error('[TicketingPromotions] Could not verify event:', eventResult.error);
    return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
  }
  const { data, error } = await database!.from('ticketing_promotions').insert({
    event_id: eventId,
    code,
    discount_type: discountType,
    discount_value: discountValue,
    currency: 'KES',
    max_redemptions: maxRedemptions,
    starts_at: startsAtValue,
    ends_at: endsAtValue,
    active: body.active
  }).select('id,event_id,code,discount_type,discount_value,currency,max_redemptions,starts_at,ends_at,active').single();
  if (error || !data) {
    console.error('[TicketingPromotions] Could not create promotion:', error);
    return NextResponse.json({
      error: error?.code === '23505' ? 'That promo code already exists for this event.' : 'The promotion could not be created.'
    }, { status: error?.code === '23505' ? 409 : 503 });
  }

  const { error: auditError } = await database!.from('ticketing_audit_logs').insert({
    actor_email: session!.email || '',
    action: 'promotion.created',
    entity_type: 'promotion',
    entity_id: data.id,
    after_state: { code, discount_type: discountType, discount_value: discountValue, active: body.active }
  });
  if (auditError) {
    console.error('[TicketingPromotions] Promotion created, but audit logging failed:', auditError);
    return NextResponse.json({ error: 'Promotion created, but its audit entry could not be saved. Contact support.' }, { status: 503 });
  }
  return NextResponse.json({ promotion: data }, { status: 201 });
}
