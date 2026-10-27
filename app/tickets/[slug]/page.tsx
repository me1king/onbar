import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock3, Ghost, MapPin, Navigation, ShieldAlert, ShieldCheck, Ticket } from 'lucide-react';
import { getPublicTicketEvent } from '@/lib/ticketing/publicEvents.server';
import TicketCheckoutButton from '@/app/tickets/TicketCheckoutButton';
import TicketingBrand from '@/app/tickets/TicketingBrand';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicTicketEvent(slug);
  return {
    title: result.ok && result.event ? `${result.event.title} | Apex Market Tickets` : 'Event Tickets | Apex Market',
    description: result.ok && result.event
      ? `${result.event.title} tickets on Apex Market. Ticketing built by Online Bar in collaboration with the Apex Market team.`
      : 'Explore verified event tickets on Apex Market, built by Online Bar in collaboration with the Apex Market team.'
  };
}

function formatEventDate(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date to be announced';
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  }).format(date);
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: currency.trim(),
    maximumFractionDigits: 2
  }).format(amount / 100);
}

export default async function TicketEventPage({ params }: PageProps) {
  const { slug } = await params;
  const result = await getPublicTicketEvent(slug);
  if (result.ok && !result.event) notFound();

  if (!result.ok) {
    return (
      <>
      <TicketingBrand />
      <main className="ticket-theme-page min-h-[70vh] px-4 py-16 sm:px-6">
        <div className="ticket-theme-panel mx-auto max-w-3xl rounded-3xl border p-8 text-center shadow-sm">
          <Ghost className="ticket-theme-accent mx-auto" size={30} />
          <h1 className="ticket-theme-text mt-4 text-2xl font-black">The event details are resting in the crypt</h1>
          <p className="ticket-theme-copy mt-2 text-sm">{result.message}</p>
          <Link href="/tickets" className="ticket-theme-accent-strong mt-6 inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-black">Back to events</Link>
        </div>
      </main>
      </>
    );
  }

  const { event } = result;
  if (!event) notFound();

  const now = Date.now();
  const venueQuery = event.venue_latitude !== null && event.venue_longitude !== null
    ? `${event.venue_latitude},${event.venue_longitude}`
    : `${event.venue_name}, ${event.venue_address}, ${event.city}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueQuery)}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venueQuery)}`;
  const transitUrl = `${directionsUrl}&travelmode=transit`;
  return (
    <>
    <TicketingBrand />
    <main className="ticket-theme-page relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="ticket-theme-glow pointer-events-none absolute -left-36 top-24 h-96 w-96 rounded-full opacity-15 blur-[110px]" />
      <div aria-hidden="true" className="ticket-theme-glow pointer-events-none absolute -right-32 top-[34rem] h-96 w-96 rounded-full opacity-10 blur-[110px]" />
      <div className="relative mx-auto max-w-6xl space-y-6">
        <Link href="/tickets" className="ticket-theme-accent inline-flex items-center gap-2 text-xs font-bold transition hover:opacity-75"><ArrowLeft size={14} /> All events</Link>
        {event.cover_image_url && (
          <div
            role="img"
            aria-label={`${event.title} event cover`}
            className="ticket-theme-panel h-56 overflow-hidden rounded-[2rem] border bg-cover bg-center shadow-xl shadow-slate-900/5 sm:h-80"
            style={{ backgroundImage: `url(${JSON.stringify(event.cover_image_url)})` }}
          />
        )}
        <header className="ticket-theme-hero relative isolate overflow-hidden rounded-[2rem] border p-6 shadow-xl shadow-slate-900/5 sm:p-10 lg:p-14">
          <div aria-hidden="true" className="ticket-theme-glow pointer-events-none absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full opacity-10 blur-[90px]" />
          <div aria-hidden="true" className="ticket-theme-glow pointer-events-none absolute -bottom-28 right-1/3 -z-10 h-72 w-72 rounded-full opacity-10 blur-[90px]" />
          <div className="relative max-w-4xl">
            <div className="ticket-theme-accent-soft inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em]"><Ghost size={14} /> Official Midnight Society KE event</div>
            <p className="ticket-theme-accent mt-7 text-[10px] font-black uppercase tracking-[0.2em]">{event.city} · After dark</p>
            <h1 className="ticket-theme-text mt-2 text-4xl font-black leading-[0.98] tracking-tight sm:text-6xl">{event.title}<span className="ticket-theme-accent">.</span></h1>
            <p className="ticket-theme-copy mt-5 max-w-2xl text-sm leading-6 sm:text-base">{event.description || 'The details are in. Get ready for an unforgettable night.'}</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <EventDetail icon={CalendarDays} title="When" value={formatEventDate(event.starts_at, event.timezone)} />
              <EventDetail icon={MapPin} title="Where" value={`${event.venue_name}${event.venue_address ? ` · ${event.venue_address}` : ''}`} />
              {event.doors_open_at && <EventDetail icon={Clock3} title="Doors open" value={formatEventDate(event.doors_open_at, event.timezone)} />}
              {event.age_limit !== null && <EventDetail icon={ShieldCheck} title="Age requirement" value={`${event.age_limit}+`} />}
            </div>
            <nav aria-label="Venue directions" className="mt-6 flex flex-wrap gap-2">
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="ticket-theme-panel ticket-theme-hover-accent inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition">
                <MapPin size={15} /> View on Google Maps
              </a>
              <a href={directionsUrl} target="_blank" rel="noreferrer" className="ticket-theme-panel ticket-theme-hover-accent inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition">
                <Navigation size={15} /> Get directions
              </a>
              <a href={transitUrl} target="_blank" rel="noreferrer" className="ticket-theme-panel ticket-theme-hover-accent inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition">
                <Navigation size={15} /> Find transport
              </a>
              <a href="#arrival-guide" className="ticket-theme-panel ticket-theme-hover-accent inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition">
                <MapPin size={15} /> Venue &amp; entry guide
              </a>
            </nav>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="ticket-theme-panel rounded-3xl border p-5 shadow-lg shadow-slate-900/5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="ticket-theme-accent text-[10px] font-black uppercase tracking-[0.18em]">Choose your haunt</p><h2 className="ticket-theme-text mt-1 text-2xl font-black">Ticket options</h2></div>
              <span className="ticket-theme-muted text-xs">{event.ticket_types.length} {event.ticket_types.length === 1 ? 'ticket type' : 'ticket types'}</span>
            </div>
            <div className="mt-5 space-y-3">
              {event.ticket_types.map(ticketType => {
                const soldOut = ticketType.remaining <= 0;
                const notOpen = !ticketType.wave_open
                  || Boolean(ticketType.sales_start_at && new Date(ticketType.sales_start_at).getTime() > now);
                const closed = Boolean(ticketType.sales_end_at && new Date(ticketType.sales_end_at).getTime() <= now);
                const schedule = soldOut
                  ? 'Sold out'
                  : closed
                    ? 'Sales window has ended'
                    : notOpen
                      ? ticketType.activation_mode === 'scheduled' && ticketType.sales_start_at
                        ? `Sales open ${formatEventDate(ticketType.sales_start_at, event.timezone)}`
                        : ticketType.activation_mode === 'previous_sold_out'
                          ? 'Opens when the previous wave sells out or closes'
                          : 'Awaiting owner activation'
                      : ticketType.wave_number !== null
                        ? `Wave open · ${ticketType.remaining.toLocaleString('en-KE')} remaining`
                        : 'Ticket option available';
                return (
                  <article key={ticketType.id} className="ticket-theme-panel-muted rounded-2xl border p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="ticket-theme-accent-soft rounded-xl border p-2.5"><Ticket size={17} /></span>
                        <div className="min-w-0">
                          {ticketType.wave_number !== null && <p className="ticket-theme-accent mb-1 text-[9px] font-black uppercase tracking-[0.16em]">{ticketType.wave_label} · {ticketType.admission_type}</p>}
                          <h3 className="ticket-theme-text font-black">{ticketType.name}</h3>
                          <p className="ticket-theme-copy mt-1 text-xs leading-5">{ticketType.description || 'Entry for one guest. Check the event details before the night.'}</p>
                          {ticketType.benefits.length > 0 && <p className="ticket-theme-accent mt-2 text-[10px] leading-5">{ticketType.benefits.join(' · ')}</p>}
                          <p className="ticket-theme-muted mt-2 text-[10px]">Limit: {ticketType.min_per_order}–{ticketType.max_per_order} per order{ticketType.wave_number !== null ? ` · ${ticketType.wave_theme.replaceAll('-', ' & ')}` : ''}</p>
                        </div>
                      </div>
                      <p className="ticket-theme-accent shrink-0 text-lg font-black">{formatPrice(ticketType.price_minor, ticketType.currency)}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--ticket-border)' }}>
                      <span className="text-[10px] font-semibold text-slate-500">{schedule}</span>
                      {soldOut || notOpen || closed ? (
                        <button type="button" disabled aria-disabled="true" className="ticket-theme-panel-muted ticket-theme-muted inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-xl border px-4 text-xs font-black">
                          {soldOut ? 'Sold out' : notOpen ? 'Not on sale yet' : 'Sales ended'}
                        </button>
                      ) : (
                        <TicketCheckoutButton
                          eventId={event.id}
                          ticketTypeId={ticketType.id}
                          minPerOrder={ticketType.min_per_order}
                          maxPerOrder={ticketType.max_per_order}
                          remaining={ticketType.remaining}
                          priceMinor={ticketType.price_minor}
                          feeMinor={event.service_fee_minor}
                          currency={ticketType.currency}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section role="status" className="ticket-theme-accent-soft rounded-3xl border p-5 sm:p-6">
              <div className="flex items-start gap-3"><span className="rounded-xl border border-current/15 bg-white/70 p-2"><ShieldAlert size={18} /></span><div><h2 className="ticket-theme-text text-sm font-black">Secure checkout</h2><p className="ticket-theme-copy mt-2 text-xs leading-5">Paid tickets use Paystack checkout. Tickets appear in your wallet only after payment is verified server-side.</p></div></div>
            </section>
            <section className="ticket-theme-panel rounded-3xl border p-5 sm:p-6">
              <h2 className="ticket-theme-text text-sm font-black">The real-ticket promise</h2>
              <ul className="ticket-theme-copy mt-3 space-y-3 text-xs leading-5">
                <li className="flex gap-2"><ShieldCheck size={15} className="ticket-theme-accent mt-0.5 shrink-0" />We will only issue a ticket after payment is verified server-side.</li>
                <li className="flex gap-2"><Ticket size={15} className="ticket-theme-accent mt-0.5 shrink-0" />A screenshot or payment message is not proof of a valid ticket.</li>
                <li className="flex gap-2"><MapPin size={15} className="ticket-theme-accent mt-0.5 shrink-0" />Venue: {event.venue_name}, {event.city}.</li>
              </ul>
            </section>
            <section id="arrival-guide" className="ticket-theme-panel scroll-mt-6 rounded-3xl border p-5 sm:p-6">
              <h2 className="ticket-theme-text text-sm font-black">Venue &amp; arrival guide</h2>
              <p className="ticket-theme-copy mt-2 text-xs">{event.venue_name} · {event.city}</p>
              <div className="ticket-theme-copy mt-4 space-y-4 text-xs leading-5">
                <div>
                  <h3 className="ticket-theme-text font-bold">Entrance</h3>
                  <p className="mt-1 whitespace-pre-wrap">{event.entrance_guide || 'Entrance details have not been published yet.'}</p>
                </div>
                <div>
                  <h3 className="ticket-theme-text font-bold">Parking</h3>
                  <p className="mt-1 whitespace-pre-wrap">{event.parking_guide || 'Parking information has not been published yet.'}</p>
                </div>
                <div>
                  <h3 className="ticket-theme-text font-bold">Public transport &amp; arrival</h3>
                  <p className="mt-1 whitespace-pre-wrap">{event.transport_guide || 'Transport and arrival guidance have not been published yet. Please check back before travelling.'}</p>
                </div>
              </div>
              <div className="ticket-theme-panel-muted ticket-theme-copy mt-4 rounded-xl border p-3 text-[10px]" style={{ borderColor: 'var(--ticket-border)' }}>
                {event.venue_latitude !== null && event.venue_longitude !== null
                  ? 'Directions use the venue pin set by the event organizer.'
                  : 'Directions use the venue address until the organizer adds a precise Google Maps pin.'}
              </div>
            </section>
            {event.cancellation_policy && (
              <section className="ticket-theme-panel rounded-3xl border p-5 sm:p-6">
                <h2 className="ticket-theme-text text-sm font-black">Cancellation policy</h2>
                <p className="ticket-theme-copy mt-2 whitespace-pre-wrap text-xs leading-5">{event.cancellation_policy}</p>
              </section>
            )}
          </aside>
        </div>
        <footer className="ticket-theme-muted border-t pt-5 text-center text-[10px]" style={{ borderColor: 'var(--ticket-border)' }}>ONLINE BAR Ticketing · No tricks, no fake confirmations.</footer>
      </div>
    </main>
    </>
  );
}

function EventDetail({ icon: Icon, title, value }: { icon: typeof Ticket; title: string; value: string }) {
  return (
    <div className="ticket-theme-panel-muted flex items-start gap-3 rounded-2xl border p-3.5">
      <Icon size={16} className="ticket-theme-accent mt-0.5 shrink-0" />
      <div><p className="ticket-theme-muted text-[9px] font-black uppercase tracking-[0.15em]">{title}</p><p className="ticket-theme-text mt-1 text-xs leading-5">{value}</p></div>
    </div>
  );
}
