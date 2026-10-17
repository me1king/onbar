import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const eventFields = 'id,organizer_id,title,slug,description,venue_name,venue_address,city,venue_latitude,venue_longitude,entrance_guide,parking_guide,transport_guide,timezone,starts_at,ends_at,doors_open_at,age_limit,capacity,service_fee_minor,status,cancellation_policy,cover_image_url,published_at,created_at,updated_at';
const ticketTypeFields = 'id,event_id,name,description,price_minor,currency,capacity,min_per_order,max_per_order,sales_start_at,sales_end_at,benefits,status,created_at,updated_at,wave_number,admission_type,wave_label,activation_mode,wave_theme,wave_manual_open';

async function authorize() {
  const session = await getAdminSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  }
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return { session: null, response: NextResponse.json({ error: 'Ticketing management is restricted to platform admins.' }, { status: 403 }) };
  }
  return { session, response: null };
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  const isLocalDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(normalized);
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  if (!isLocalDateTime && !hasTimezone) return null;
  const date = new Date(isLocalDateTime ? `${normalized}+03:00` : normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseMoney(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

function parseBenefits(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((benefit): benefit is string => typeof benefit === 'string')) return null;
  const benefits = value.map(benefit => benefit.trim()).filter(Boolean);
  return benefits.length <= 20 && benefits.every(benefit => benefit.length <= 200) ? benefits : null;
}

function missingMigration(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205'
    || (error.message || '').toLowerCase().includes('ticketing_');
}

export async function GET() {
  const { session, response } = await authorize();
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  const [eventsResult, eventCount, ticketCount, orderCount] = await Promise.all([
    database.from('ticketing_events').select(eventFields).order('starts_at', { ascending: true }).limit(100),
    database.from('ticketing_events').select('id', { count: 'exact', head: true }),
    database.from('ticketing_tickets').select('id', { count: 'exact', head: true }),
    database.from('ticketing_orders').select('id', { count: 'exact', head: true })
  ]);
  const queryError = eventsResult.error || eventCount.error || ticketCount.error || orderCount.error;
  if (queryError) {
    if (missingMigration(queryError)) {
      return NextResponse.json({
        error: 'Apply the documented Ticketing migrations, including TICKETING_SERVICE_FEE_ADMIN_MIGRATION.sql, to the shared Supabase project.'
      }, { status: 503 });
    }
    console.error('[TicketingAdmin] Could not load ticketing dashboard:', queryError);
    return NextResponse.json({ error: 'Ticketing dashboard data could not be loaded.' }, { status: 503 });
  }

  const events = eventsResult.data || [];
  const eventIds = events.map(event => event.id);
  const ticketTypesResult = eventIds.length
    ? await database.from('ticketing_ticket_types').select(ticketTypeFields).in('event_id', eventIds).order('created_at')
    : { data: [], error: null };
  if (ticketTypesResult.error) {
    if (missingMigration(ticketTypesResult.error)
      && /wave_number|admission_type|wave_label|activation_mode|wave_theme|wave_manual_open/i.test(ticketTypesResult.error.message || '')) {
      return NextResponse.json({ error: 'Apply supabase/TICKETING_WAVES_MIGRATION.sql after the Ticketing core, service-fee, security and live-operations migrations.' }, { status: 503 });
    }
    console.error('[TicketingAdmin] Could not load ticket tiers:', ticketTypesResult.error);
    return NextResponse.json({ error: 'Ticket tiers could not be loaded.' }, { status: 503 });
  }

  const typesByEvent = new Map<string, typeof ticketTypesResult.data>();
  for (const type of ticketTypesResult.data || []) {
    typesByEvent.set(type.event_id, [...(typesByEvent.get(type.event_id) || []), type]);
  }
  return NextResponse.json({
    events: events.map(event => ({ ...event, ticket_types: typesByEvent.get(event.id) || [] })),
    totals: {
      events: eventCount.count || 0,
      tickets: ticketCount.count || 0,
      orders: orderCount.count || 0
    },
    canPublish: session?.role.toLowerCase() === 'owner'
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const { session, response } = await authorize();
  if (response) return response;
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid ticketing request is required.' }, { status: 400 });
  }

  if (body.action === 'set_event_sales_status') {
    if (session?.role.toLowerCase() !== 'owner') {
      return NextResponse.json({ error: 'Only the platform owner can publish an event or pause public sales.' }, { status: 403 });
    }
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const status = body.status === 'on_sale' || body.status === 'scheduled' ? body.status : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) || !status) {
      return NextResponse.json({ error: 'Select a valid event and sales status.' }, { status: 400 });
    }

    if (status === 'on_sale' && process.env.NODE_ENV === 'production') {
      const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
      const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() || '';
      let encryptionKeyIsValid = false;
      try {
        encryptionKeyIsValid = Buffer.from(process.env.TICKETING_CREDENTIAL_ENCRYPTION_KEY?.trim() || '', 'base64').length === 32;
      } catch {
        encryptionKeyIsValid = false;
      }
      if (!secretKey.startsWith('sk_live_') || !publicKey.startsWith('pk_live_') || !encryptionKeyIsValid) {
        return NextResponse.json({
          error: 'Live sales require matching live Paystack credentials and a valid ticket-encryption key in the production environment.'
        }, { status: 503 });
      }
    }

    const { data, error } = await database.rpc('ticketing_set_event_sales_status', {
      p_event_id: eventId,
      p_status: status,
      p_actor_email: session.email || ''
    });
    if (error || !data) {
      if (error?.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
      if (error?.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
      console.error('[TicketingAdmin] Could not update event sales status:', error);
      return NextResponse.json({
        error: 'Event publication could not be completed. Apply supabase/TICKETING_EVENT_PUBLISHING_MIGRATION.sql and retry.'
      }, { status: 503 });
    }
    return NextResponse.json({ event: data });
  }

  if (body.action === 'update_event_venue') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const venueName = typeof body.venueName === 'string' ? body.venueName.trim() : '';
    const venueAddress = typeof body.venueAddress === 'string' ? body.venueAddress.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const parseCoordinate = (value: unknown) => {
      if (value === '' || value === null || value === undefined) return { valid: true, value: null };
      if (typeof value !== 'number' && typeof value !== 'string') return { valid: false, value: null };
      const normalized = typeof value === 'string' ? value.trim() : value;
      if (normalized === '') return { valid: false, value: null };
      const coordinate = typeof normalized === 'number' ? normalized : Number(normalized);
      return { valid: Number.isFinite(coordinate), value: coordinate };
    };
    const latitude = parseCoordinate(body.latitude);
    const longitude = parseCoordinate(body.longitude);
    const latitudeValue = latitude.value;
    const longitudeValue = longitude.value;
    const entranceGuide = typeof body.entranceGuide === 'string' ? body.entranceGuide.trim() : '';
    const parkingGuide = typeof body.parkingGuide === 'string' ? body.parkingGuide.trim() : '';
    const transportGuide = typeof body.transportGuide === 'string' ? body.transportGuide.trim() : '';

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || venueName.length < 2 || venueName.length > 180
      || venueAddress.length < 5 || venueAddress.length > 500
      || city.length < 2 || city.length > 100
      || !latitude.valid || !longitude.valid
      || ((latitudeValue === null) !== (longitudeValue === null))
      || (latitudeValue !== null && (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90))
      || (longitudeValue !== null && (!Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180))
      || entranceGuide.length > 2000 || parkingGuide.length > 2000 || transportGuide.length > 2000) {
      return NextResponse.json({
        error: 'Enter a valid venue, city, complete address, paired map coordinates, and arrival notes under 2,000 characters each.'
      }, { status: 400 });
    }

    const { data, error } = await database.rpc('ticketing_update_event_venue', {
      p_event_id: eventId,
      p_venue_name: venueName,
      p_venue_address: venueAddress,
      p_city: city,
      p_venue_latitude: latitudeValue,
      p_venue_longitude: longitudeValue,
      p_entrance_guide: entranceGuide,
      p_parking_guide: parkingGuide,
      p_transport_guide: transportGuide,
      p_actor_email: session.email || ''
    });
    if (error || !data) {
      if (error?.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
      console.error('[TicketingAdmin] Could not update event venue:', error);
      return NextResponse.json({
        error: 'Venue details could not be saved. Apply supabase/TICKETING_VENUE_LOCATION_MIGRATION.sql and retry.'
      }, { status: 503 });
    }
    return NextResponse.json({ event: data });
  }

  if (body.action === 'update_event_service_fee') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const serviceFeeMinor = parseMoney(body.serviceFee);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || serviceFeeMinor === null || serviceFeeMinor > 100_000_000) {
      return NextResponse.json({ error: 'Enter a valid event and per-ticket service fee.' }, { status: 400 });
    }

    const { data, error } = await database.rpc('ticketing_update_event_service_fee', {
      p_event_id: eventId,
      p_service_fee_minor: serviceFeeMinor,
      p_actor_email: session?.email || '',
      p_allow_on_sale: session?.role.toLowerCase() === 'owner'
    });
    if (error || !data) {
      if (error?.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
      if (error?.code === '22023') return NextResponse.json({ error: 'The service fee is invalid.' }, { status: 400 });
      if (error?.code === '42501') return NextResponse.json({ error: error.message }, { status: 403 });
      console.error('[TicketingAdmin] Could not update event service fee:', error);
      return NextResponse.json({ error: 'The service fee could not be updated.' }, { status: 503 });
    }
    return NextResponse.json({ event: data });
  }

  if (body.action === 'create_event') {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const venueName = typeof body.venueName === 'string' ? body.venueName.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);
    const doorsOpenAt = body.doorsOpenAt ? parseDate(body.doorsOpenAt) : null;
    const capacity = body.capacity === '' || body.capacity === null || body.capacity === undefined
      ? null : Number(body.capacity);
    const ageLimit = body.ageLimit === '' || body.ageLimit === null || body.ageLimit === undefined
      ? null : Number(body.ageLimit);
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const venueAddress = typeof body.venueAddress === 'string' ? body.venueAddress.trim() : '';
    const cancellationPolicy = typeof body.cancellationPolicy === 'string' ? body.cancellationPolicy.trim() : '';

    if (title.length < 3 || title.length > 160 || venueName.length < 2 || venueName.length > 180
      || city.length < 2 || city.length > 100 || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)
      || (body.doorsOpenAt && (!doorsOpenAt || new Date(doorsOpenAt) > new Date(startsAt)))
      || (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000))
      || (ageLimit !== null && (!Number.isSafeInteger(ageLimit) || ageLimit < 0 || ageLimit > 120))
      || description.length > 10_000 || venueAddress.length > 500 || cancellationPolicy.length > 5_000) {
      return NextResponse.json({ error: 'Enter a valid event title, venue, city and date range. End time must be after start time.' }, { status: 400 });
    }

    const organizerResult = await database.from('ticketing_organizers').select('id').eq('slug', 'online-bar').maybeSingle();
    if (organizerResult.error || !organizerResult.data) {
      console.error('[TicketingAdmin] Default organizer is unavailable:', organizerResult.error);
      return NextResponse.json({ error: 'The ONLINE BAR organizer record is unavailable. Apply the ticketing database migration.' }, { status: 503 });
    }

    const slug = `${slugify(title) || 'event'}-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await database.rpc('ticketing_create_event', {
      p_organizer_id: organizerResult.data.id,
      p_title: title,
      p_slug: slug,
      p_description: description,
      p_venue_name: venueName,
      p_venue_address: venueAddress,
      p_city: city,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_doors_open_at: doorsOpenAt,
      p_age_limit: ageLimit,
      p_capacity: capacity,
      p_cancellation_policy: cancellationPolicy,
      p_actor_email: session?.email || ''
    });
    if (error || !data) {
      console.error('[TicketingAdmin] Could not create draft event:', error);
      return NextResponse.json({ error: 'The draft event could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ event: { ...(data as Record<string, unknown>), ticket_types: [] } }, { status: 201 });
  }

  if (body.action === 'create_ticket_wave') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const admissionType = typeof body.admissionType === 'string' ? body.admissionType.trim() : '';
    const waveLabel = typeof body.waveLabel === 'string' ? body.waveLabel.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const waveNumber = Number(body.waveNumber);
    const priceMinor = parseMoney(body.price);
    const capacity = Number(body.capacity);
    const minPerOrder = Number(body.minPerOrder ?? 1);
    const maxPerOrder = Number(body.maxPerOrder ?? 10);
    const activationMode = body.activationMode;
    const waveTheme = body.waveTheme;
    const salesStartAt = body.salesStartAt ? parseDate(body.salesStartAt) : null;
    const salesEndAt = body.salesEndAt ? parseDate(body.salesEndAt) : null;
    const benefits = parseBenefits(body.benefits);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || !['General Admission', 'VIP', 'Group Package', 'Backstage / Exclusive'].includes(admissionType)
      || !Number.isInteger(waveNumber) || waveNumber < 1 || waveNumber > 3
      || waveLabel.length < 2 || waveLabel.length > 100 || description.length > 2_000
      || priceMinor === null || priceMinor < 1
      || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000
      || !Number.isSafeInteger(minPerOrder) || !Number.isSafeInteger(maxPerOrder)
      || minPerOrder < 1 || maxPerOrder < minPerOrder || maxPerOrder > 100
      || !['scheduled', 'previous_sold_out', 'manual'].includes(String(activationMode))
      || !['obsidian-gold', 'crimson-black', 'electric-violet'].includes(String(waveTheme))
      || (activationMode === 'scheduled' && !salesStartAt)
      || (body.salesStartAt && !salesStartAt) || (body.salesEndAt && !salesEndAt)
      || (salesStartAt && salesEndAt && new Date(salesEndAt) <= new Date(salesStartAt))
      || !benefits) {
      return NextResponse.json({ error: 'Enter a valid wave number, admission type, price, allocation, activation rule, theme and sale window.' }, { status: 400 });
    }

    const { data, error } = await database.rpc('ticketing_create_event_wave', {
      p_event_id: eventId,
      p_admission_type: admissionType,
      p_wave_number: waveNumber,
      p_wave_label: waveLabel,
      p_price_minor: priceMinor,
      p_capacity: capacity,
      p_min_per_order: minPerOrder,
      p_max_per_order: maxPerOrder,
      p_activation_mode: activationMode,
      p_wave_theme: waveTheme,
      p_sales_start_at: salesStartAt,
      p_sales_end_at: salesEndAt,
      p_description: description,
      p_benefits: benefits,
      p_actor_email: session.email || ''
    });
    if (error || !data) {
      if (error?.code === '23514') return NextResponse.json({ error: 'This wave allocation exceeds event capacity.' }, { status: 400 });
      if (error?.code === '23505') return NextResponse.json({ error: 'That admission type already has a ticket in this wave.' }, { status: 409 });
      if (error?.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
      if (error?.code === '22023') return NextResponse.json({ error: 'Wave configuration is invalid. Add earlier waves in sequence before choosing sell-out activation.' }, { status: 400 });
      console.error('[TicketingAdmin] Could not create ticket wave:', error);
      return NextResponse.json({ error: 'Ticket wave could not be saved. Confirm that TICKETING_WAVES_MIGRATION.sql has been applied.' }, { status: 503 });
    }
    return NextResponse.json({ ticketType: data }, { status: 201 });
  }

  if (body.action === 'update_ticket_wave') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const ticketTypeId = typeof body.ticketTypeId === 'string' ? body.ticketTypeId : '';
    const waveLabel = typeof body.waveLabel === 'string' ? body.waveLabel.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const priceMinor = parseMoney(body.price);
    const capacity = Number(body.capacity);
    const minPerOrder = Number(body.minPerOrder ?? 1);
    const maxPerOrder = Number(body.maxPerOrder ?? 10);
    const activationMode = body.activationMode;
    const waveTheme = body.waveTheme;
    const salesStartAt = body.salesStartAt ? parseDate(body.salesStartAt) : null;
    const salesEndAt = body.salesEndAt ? parseDate(body.salesEndAt) : null;
    const benefits = parseBenefits(body.benefits);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketTypeId)
      || waveLabel.length < 2 || waveLabel.length > 100 || description.length > 2_000
      || priceMinor === null || priceMinor < 1
      || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000
      || !Number.isSafeInteger(minPerOrder) || !Number.isSafeInteger(maxPerOrder)
      || minPerOrder < 1 || maxPerOrder < minPerOrder || maxPerOrder > 100
      || !['scheduled', 'previous_sold_out', 'manual'].includes(String(activationMode))
      || !['obsidian-gold', 'crimson-black', 'electric-violet'].includes(String(waveTheme))
      || (activationMode === 'scheduled' && !salesStartAt)
      || (body.salesStartAt && !salesStartAt) || (body.salesEndAt && !salesEndAt)
      || (salesStartAt && salesEndAt && new Date(salesEndAt) <= new Date(salesStartAt))
      || !benefits) {
      return NextResponse.json({ error: 'Enter a valid wave label, price, allocation, opening rule, theme and sale window.' }, { status: 400 });
    }

    const { data, error } = await database.rpc('ticketing_update_event_wave', {
      p_event_id: eventId,
      p_ticket_type_id: ticketTypeId,
      p_wave_label: waveLabel,
      p_price_minor: priceMinor,
      p_capacity: capacity,
      p_min_per_order: minPerOrder,
      p_max_per_order: maxPerOrder,
      p_activation_mode: activationMode,
      p_wave_theme: waveTheme,
      p_sales_start_at: salesStartAt,
      p_sales_end_at: salesEndAt,
      p_description: description,
      p_benefits: benefits,
      p_actor_email: session.email || ''
    });
    if (error || !data) {
      if (error?.code === '23514') return NextResponse.json({ error: 'This wave allocation exceeds event capacity.' }, { status: 400 });
      if (error?.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected event or wave was not found.' }, { status: 404 });
      if (error?.code === '22023') return NextResponse.json({ error: 'Wave configuration is invalid.' }, { status: 400 });
      console.error('[TicketingAdmin] Could not update ticket wave:', error);
      return NextResponse.json({ error: 'Ticket wave could not be updated. Confirm that TICKETING_WAVES_MIGRATION.sql has been applied.' }, { status: 503 });
    }
    return NextResponse.json({ ticketType: data });
  }

  if (body.action === 'set_ticket_wave_status') {
    if (session?.role.toLowerCase() !== 'owner') {
      return NextResponse.json({ error: 'Only the platform owner can pause or resume a release wave.' }, { status: 403 });
    }
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const ticketTypeId = typeof body.ticketTypeId === 'string' ? body.ticketTypeId : '';
    const status = body.status === 'active' || body.status === 'paused' ? body.status : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketTypeId)
      || !status) {
      return NextResponse.json({ error: 'Select a valid wave and status.' }, { status: 400 });
    }
    const { data, error } = await database.rpc('ticketing_set_wave_status', {
      p_event_id: eventId,
      p_ticket_type_id: ticketTypeId,
      p_status: status,
      p_actor_email: session?.email || ''
    });
    if (error || !data) {
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected wave was not found.' }, { status: 404 });
      console.error('[TicketingAdmin] Could not update ticket wave status:', error);
      return NextResponse.json({ error: 'Ticket wave status could not be updated. Confirm that TICKETING_WAVES_MIGRATION.sql has been applied.' }, { status: 503 });
    }
    return NextResponse.json({ ticketType: data });
  }

  if (body.action === 'set_manual_ticket_wave_open') {
    if (session?.role.toLowerCase() !== 'owner') {
      return NextResponse.json({ error: 'Only the platform owner can manually open a release wave.' }, { status: 403 });
    }
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const ticketTypeId = typeof body.ticketTypeId === 'string' ? body.ticketTypeId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketTypeId)
      || typeof body.open !== 'boolean') {
      return NextResponse.json({ error: 'Select a valid manually activated wave.' }, { status: 400 });
    }
    const { data, error } = await database.rpc('ticketing_set_manual_wave_open', {
      p_event_id: eventId,
      p_ticket_type_id: ticketTypeId,
      p_open: body.open,
      p_actor_email: session?.email || ''
    });
    if (error || !data) {
      if (error?.code === 'P0002') return NextResponse.json({ error: 'The selected wave was not found.' }, { status: 404 });
      if (error?.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
      console.error('[TicketingAdmin] Could not manually open ticket wave:', error);
      return NextResponse.json({ error: 'Manual wave activation could not be updated. Confirm that TICKETING_WAVES_MIGRATION.sql has been applied.' }, { status: 503 });
    }
    return NextResponse.json({ ticketType: data });
  }

  if (body.action === 'create_ticket_type') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const priceMinor = parseMoney(body.price);
    const capacity = Number(body.capacity);
    const minPerOrder = Number(body.minPerOrder ?? 1);
    const maxPerOrder = Number(body.maxPerOrder ?? 10);
    const salesStartAt = body.salesStartAt ? parseDate(body.salesStartAt) : null;
    const salesEndAt = body.salesEndAt ? parseDate(body.salesEndAt) : null;
    if (!/^[0-9a-f-]{36}$/i.test(eventId) || name.length < 2 || name.length > 100
      || description.length > 2_000 || priceMinor === null
      || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000
      || !Number.isSafeInteger(minPerOrder) || !Number.isSafeInteger(maxPerOrder)
      || minPerOrder < 1 || maxPerOrder < minPerOrder || maxPerOrder > 100
      || (body.salesStartAt && !salesStartAt) || (body.salesEndAt && !salesEndAt)
      || (salesStartAt && salesEndAt && new Date(salesEndAt) <= new Date(salesStartAt))) {
      return NextResponse.json({ error: 'Enter a valid tier name, price, capacity, order limit and sale window.' }, { status: 400 });
    }

    const { data, error } = await database.rpc('ticketing_create_ticket_type', {
      p_event_id: eventId,
      p_name: name,
      p_description: description,
      p_price_minor: priceMinor,
      p_capacity: capacity,
      p_min_per_order: minPerOrder,
      p_max_per_order: maxPerOrder,
      p_sales_start_at: salesStartAt,
      p_sales_end_at: salesEndAt,
      p_actor_email: session?.email || ''
    });
    if (error || !data) {
      console.error('[TicketingAdmin] Could not create ticket tier:', error);
      if (error?.code === '23514') {
        return NextResponse.json({ error: 'This tier exceeds the event capacity. Reduce its allocation before saving.' }, { status: 400 });
      }
      if (error?.code === 'P0001') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error?.code === 'P0002') {
        return NextResponse.json({ error: 'The selected event was not found.' }, { status: 404 });
      }
      return NextResponse.json({ error: 'The ticket tier could not be saved.' }, { status: 503 });
    }
    return NextResponse.json({ ticketType: data as Record<string, unknown> }, { status: 201 });
  }

  return NextResponse.json({ error: 'Choose a supported ticketing action.' }, { status: 400 });
}
