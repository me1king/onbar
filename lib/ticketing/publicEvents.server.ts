import 'server-only';

import { createServerSupabaseClient } from '@/lib/serverSupabase';

export type PublicTicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  min_per_order: number;
  max_per_order: number;
  capacity: number;
  remaining: number;
  benefits: string[];
  sales_start_at: string | null;
  sales_end_at: string | null;
  status: string;
  wave_number: number | null;
  admission_type: string;
  wave_label: string;
  activation_mode: 'scheduled' | 'previous_sold_out' | 'manual';
  wave_theme: 'obsidian-gold' | 'crimson-black' | 'electric-violet';
  wave_manual_open: boolean;
  wave_open: boolean;
};

export type PublicTicketEvent = {
  id: string;
  title: string;
  slug: string;
  description: string;
  venue_name: string;
  venue_address: string;
  city: string;
  timezone: string;
  starts_at: string;
  ends_at: string;
  doors_open_at: string | null;
  age_limit: number | null;
  cover_image_url: string | null;
  cancellation_policy: string;
  ticket_types: PublicTicketType[];
};

type PublicEventRow = Omit<PublicTicketEvent, 'ticket_types'> & { organizer_id: string };

type PublicEventsResult =
  | { ok: true; events: PublicTicketEvent[] }
  | { ok: false; message: string };

const eventFields = [
  'id', 'organizer_id', 'title', 'slug', 'description', 'venue_name', 'venue_address',
  'city', 'timezone', 'starts_at', 'ends_at', 'doors_open_at', 'age_limit',
  'cover_image_url', 'cancellation_policy'
].join(',');

const tierFields = [
  'id', 'event_id', 'name', 'description', 'price_minor', 'currency',
  'min_per_order', 'max_per_order', 'capacity', 'benefits', 'sales_start_at', 'sales_end_at',
  'status', 'wave_number', 'admission_type', 'wave_label', 'activation_mode', 'wave_theme', 'wave_manual_open'
].join(',');

function isMissingTicketingSchema(error: { code?: string }) {
  return error.code === '42P01' || error.code === 'PGRST205';
}

async function getPublicEvents(): Promise<PublicEventsResult> {
  const database = createServerSupabaseClient();
  if (!database) {
    return { ok: false, message: 'Ticket listings are temporarily unavailable. Please check back soon.' };
  }

  const organizerResult = await database.from('ticketing_organizers')
    .select('id')
    .eq('status', 'approved')
    .limit(100);
  if (organizerResult.error) {
    if (!isMissingTicketingSchema(organizerResult.error)) {
      console.error('[PublicTicketing] Could not load approved organizers:', organizerResult.error);
    }
    return {
      ok: false,
      message: isMissingTicketingSchema(organizerResult.error)
        ? 'Ticket listings are being prepared. Please check back soon.'
        : 'Ticket listings could not be loaded right now. Please try again later.'
    };
  }

  if (!organizerResult.data?.length) return { ok: true, events: [] };
  const organizerIds = organizerResult.data.map(organizer => organizer.id);
  const eventResult = await database.from('ticketing_events')
    .select(eventFields)
    .in('organizer_id', organizerIds)
    .eq('status', 'on_sale')
    .order('starts_at', { ascending: true })
    .limit(50);
  if (eventResult.error) {
    if (!isMissingTicketingSchema(eventResult.error)) {
      console.error('[PublicTicketing] Could not load events on sale:', eventResult.error);
    }
    return {
      ok: false,
      message: isMissingTicketingSchema(eventResult.error)
        ? 'Ticket listings are being prepared. Please check back soon.'
        : 'Ticket listings could not be loaded right now. Please try again later.'
    };
  }

  const rows = (eventResult.data || []) as unknown as PublicEventRow[];
  if (!rows.length) return { ok: true, events: [] };

  const ticketTypesResult = await database.from('ticketing_ticket_types')
    .select(tierFields)
    .in('event_id', rows.map(event => event.id))
    .order('price_minor', { ascending: true });
  if (ticketTypesResult.error) {
    if (/wave_number|admission_type|wave_label|activation_mode|wave_theme|wave_manual_open/i.test(ticketTypesResult.error.message || '')) {
      return { ok: false, message: 'Ticket releases are being prepared. Apply supabase/TICKETING_WAVES_MIGRATION.sql in the Online Bar Supabase project.' };
    }
    console.error('[PublicTicketing] Could not load active ticket tiers:', ticketTypesResult.error);
    return { ok: false, message: 'Ticket options could not be loaded right now. Please try again later.' };
  }

  const allTicketTypes = (ticketTypesResult.data || []) as unknown as PublicTicketType[];
  const availabilityResult = rows.length
    ? await database.rpc('ticketing_public_wave_availability', { p_event_ids: rows.map(event => event.id) })
    : { data: [], error: null };
  if (availabilityResult.error) {
    if (availabilityResult.error.code === 'PGRST202'
      || /ticketing_public_wave_availability/i.test(availabilityResult.error.message || '')) {
      return { ok: false, message: 'Ticket availability is being prepared. Apply supabase/TICKETING_WAVES_MIGRATION.sql in the Online Bar Supabase project.' };
    }
    console.error('[PublicTicketing] Could not load ticket availability:', availabilityResult.error);
    return { ok: false, message: 'Ticket availability could not be loaded right now. Please try again later.' };
  }

  const availabilityRows = availabilityResult.data as unknown as Array<{
    ticket_type_id: string;
    remaining: number;
    wave_open: boolean;
  }> | null;
  if (!Array.isArray(availabilityRows) || availabilityRows.some(availability =>
    typeof availability.ticket_type_id !== 'string'
    || !Number.isSafeInteger(availability.remaining)
    || typeof availability.wave_open !== 'boolean')) {
    console.error('[PublicTicketing] Availability query returned an invalid response shape.');
    return { ok: false, message: 'Ticket availability could not be loaded right now. Please try again later.' };
  }
  const availabilityByType = new Map(availabilityRows.map(availability => [
    availability.ticket_type_id,
    availability
  ]));
  const activeTicketTypes = allTicketTypes.filter(ticketType => ticketType.status === 'active');
  if (activeTicketTypes.some(ticketType => !availabilityByType.has(ticketType.id))) {
    console.error('[PublicTicketing] Availability response omitted an active ticket type.');
    return { ok: false, message: 'Ticket availability could not be loaded right now. Please try again later.' };
  }

  const typesByEvent = new Map<string, PublicTicketType[]>();
  const now = Date.now();
  for (const ticketType of activeTicketTypes) {
    const availability = availabilityByType.get(ticketType.id);
    if (!availability) continue;
    const waveOpen = availability.wave_open
      && (!ticketType.sales_start_at || new Date(ticketType.sales_start_at).getTime() <= now)
      && (!ticketType.sales_end_at || new Date(ticketType.sales_end_at).getTime() > now);
    typesByEvent.set(ticketType.event_id, [
      ...(typesByEvent.get(ticketType.event_id) || []),
      { ...ticketType, remaining: availability.remaining, wave_open: waveOpen }
    ]);
  }

  const events = rows
    .map(event => ({
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      venue_name: event.venue_name,
      venue_address: event.venue_address,
      city: event.city,
      timezone: event.timezone,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      doors_open_at: event.doors_open_at,
      age_limit: event.age_limit,
      cover_image_url: event.cover_image_url,
      cancellation_policy: event.cancellation_policy,
      ticket_types: typesByEvent.get(event.id) || []
    }))
    .filter(event => event.ticket_types.length > 0 && new Date(event.ends_at).getTime() > now);

  return { ok: true, events };
}

export async function getPublicTicketEvents() {
  return getPublicEvents();
}

export async function getPublicTicketEvent(slug: string) {
  const result = await getPublicEvents();
  if (!result.ok) return result;
  return { ok: true as const, event: result.events.find(event => event.slug === slug) || null };
}
