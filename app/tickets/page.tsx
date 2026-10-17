import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarDays, ChevronRight, Clock3, Ghost, MapPin, ShieldCheck, Ticket } from 'lucide-react';
import { getPublicTicketEvents, type PublicTicketEvent } from '@/lib/ticketing/publicEvents.server';
import TicketingBrand from '@/app/tickets/TicketingBrand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Halloween Tickets | ONLINE BAR',
  description: 'Find your next after-dark event with ONLINE BAR Ticketing.'
};

function formatEventDate(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date to be announced';
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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

function EventCard({ event }: { event: PublicTicketEvent }) {
  const availableTicketTypes = event.ticket_types.filter(ticketType => ticketType.wave_open && ticketType.remaining > 0);
  const lowestPrice = availableTicketTypes.length
    ? Math.min(...availableTicketTypes.map(ticketType => ticketType.price_minor))
    : null;

  return (
    <article className="ticket-theme-panel group overflow-hidden rounded-3xl border shadow-lg shadow-slate-900/5 transition duration-300 hover:-translate-y-1 hover:border-orange-300 hover:shadow-orange-900/10">
      <div className="ticket-theme-hero relative isolate min-h-56 overflow-hidden border-b p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 -z-10 h-56 w-56 rounded-full bg-orange-200/45 blur-[70px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/4 -z-10 h-48 w-48 rounded-full bg-violet-200/35 blur-[70px]" />
        <div className="flex items-start justify-between gap-3">
          <span className="ticket-theme-accent-soft inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]"><Ghost size={13} /> After dark</span>
          {event.age_limit !== null && <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[10px] font-black text-slate-700">{event.age_limit}+</span>}
        </div>
        <div className="absolute bottom-6 left-6 right-6">
          <p className="ticket-theme-accent text-[10px] font-black uppercase tracking-[0.18em]">{event.city}</p>
          <h2 className="ticket-theme-text mt-2 max-w-xl text-2xl font-black tracking-tight sm:text-3xl">{event.title}</h2>
          <p className="ticket-theme-copy mt-2 flex items-center gap-2 text-xs"><MapPin size={13} />{event.venue_name}</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="ticket-theme-copy flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-2"><CalendarDays size={14} className="ticket-theme-accent" />{formatEventDate(event.starts_at, event.timezone)}</span>
          {event.doors_open_at && <span className="inline-flex items-center gap-2"><Clock3 size={14} className="ticket-theme-accent" />Doors {formatEventDate(event.doors_open_at, event.timezone)}</span>}
        </div>
        <p className="ticket-theme-copy mt-4 line-clamp-3 text-sm leading-6">{event.description || 'Get ready for a night out. Event details and ticket options are available here.'}</p>
        {event.ticket_types.some(ticketType => ticketType.wave_number !== null) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {event.ticket_types.filter(ticketType => ticketType.wave_number !== null).map(ticketType => (
            <span key={ticketType.id} className="ticket-theme-accent-soft rounded-full border px-3 py-1 text-[9px] font-bold">
              {ticketType.wave_label} · {ticketType.admission_type}
            </span>
          ))}
        </div>
        )}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4" style={{ borderColor: 'var(--ticket-border)' }}>
        <div>
          <p className="ticket-theme-muted text-[9px] font-black uppercase tracking-[0.15em]">{lowestPrice === null ? 'Next release' : 'Tickets from'}</p>
          <p className="ticket-theme-accent mt-1 text-lg font-black">{lowestPrice === null ? 'No wave open' : formatPrice(lowestPrice, event.ticket_types[0]?.currency || 'KES')}</p>
        </div>
          <Link href={`/tickets/${encodeURIComponent(event.slug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-400 px-4 text-xs font-black text-[#170d18] transition hover:bg-orange-300">
            Event & tickets <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function TicketDiscoveryPage() {
  const result = await getPublicTicketEvents();

  return (
    <>
    <TicketingBrand />
    <main className="ticket-theme-page relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-24 h-[28rem] w-[28rem] rounded-full bg-orange-200/35 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-[38rem] h-[28rem] w-[28rem] rounded-full bg-violet-200/25 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl space-y-8">
        <header className="ticket-theme-hero relative isolate overflow-hidden rounded-[2rem] border p-6 shadow-xl shadow-slate-900/5 sm:p-10 lg:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 -z-10 h-96 w-96 rounded-full bg-orange-100/80 blur-[100px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-1/3 -z-10 h-80 w-80 rounded-full bg-violet-100/70 blur-[90px]" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="ticket-theme-accent-soft inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em]"><Ghost size={14} /> Midnight Society KE · Official events</div>
              <p className="ticket-theme-accent mt-6 text-[10px] font-black uppercase tracking-[0.25em]">The night is yours</p>
              <h1 className="ticket-theme-text mt-2 text-4xl font-black leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">Find your<br />after-dark<span className="ticket-theme-accent">.</span></h1>
              <p className="ticket-theme-copy mt-5 max-w-xl text-sm leading-6 sm:text-base">Discover events worth staying up for. Choose your night, check the details, and find ticket options in one spooky little corner of ONLINE BAR.</p>
            </div>
            <div className="ticket-theme-panel-muted w-fit rounded-2xl border p-4">
              <div className="flex items-center gap-3"><span className="ticket-theme-accent-soft rounded-xl border p-2.5"><Ticket size={20} /></span><div><p className="ticket-theme-text text-xl font-black">{result.ok ? result.events.length : '—'}</p><p className="ticket-theme-muted text-[9px] font-black uppercase tracking-[0.15em]">Events on sale</p></div></div>
            </div>
          </div>
        </header>

        <section role="status" className="ticket-theme-accent-soft flex items-start gap-3 rounded-2xl border p-4">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div><p className="ticket-theme-text text-sm font-black">Official tickets, verified before entry</p><p className="ticket-theme-copy mt-1 text-xs leading-5">Buy with card or M-Pesa mobile money through Paystack. Your tickets are issued only after payment confirmation is independently verified.</p></div>
        </section>

        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="ticket-theme-accent text-[10px] font-black uppercase tracking-[0.2em]">Enter if you dare</p><h2 className="ticket-theme-text mt-1 text-2xl font-black tracking-tight sm:text-3xl">Events on the list</h2></div>
            <span className="ticket-theme-muted text-xs">Official ONLINE BAR Ticketing listings</span>
          </div>
          {!result.ok ? (
            <div role="alert" className="ticket-theme-panel rounded-2xl border p-7 text-sm leading-6 shadow-sm">{result.message}</div>
          ) : result.events.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{result.events.map(event => <EventCard key={event.id} event={event} />)}</div>
          ) : (
            <div className="ticket-theme-panel rounded-3xl border border-dashed px-6 py-14 text-center shadow-sm">
              <span className="ticket-theme-accent-soft mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border"><Ghost size={25} /></span>
              <h3 className="ticket-theme-text mt-4 text-xl font-black">No events on sale just yet</h3>
              <p className="ticket-theme-copy mx-auto mt-2 max-w-md text-sm leading-6">The crypt is quiet for now. Approved events will appear here when they are officially opened for sale.</p>
            </div>
          )}
        </section>

        <footer className="ticket-theme-muted flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-[10px]" style={{ borderColor: 'var(--ticket-border)' }}>
          <span>ONLINE BAR Ticketing · Your night. Your ticket. No tricks.</span>
          <Link href="/" className="ticket-theme-accent font-bold transition hover:opacity-75">Back to Online Bar</Link>
        </footer>
      </div>
    </main>
    </>
  );
}
