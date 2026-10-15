'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
  Wallet
} from 'lucide-react';

type TicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  capacity: number;
  min_per_order: number;
  max_per_order: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  status: string;
};

type TicketEvent = {
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
  age_limit: number | null;
  capacity: number | null;
  status: string;
  created_at: string;
  ticket_types: TicketType[];
};

type DashboardData = {
  events: TicketEvent[];
  totals: { events: number; tickets: number; orders: number };
};

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100';
const labelClass = 'block text-xs font-bold text-slate-600';

function money(minor: number, currency = 'KES') {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}

function eventDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date to be confirmed' : date.toLocaleString('en-KE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

async function readResponse(response: Response) {
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || `Ticketing request failed (${response.status}).`);
  return result;
}

function EventForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(formData: FormData) {
    setSaving(true);
    setError('');
    try {
      await readResponse(await fetch('/api/admin/ticketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_event',
          title: formData.get('title'),
          description: formData.get('description'),
          venueName: formData.get('venueName'),
          venueAddress: formData.get('venueAddress'),
          city: formData.get('city'),
          startsAt: formData.get('startsAt'),
          endsAt: formData.get('endsAt'),
          doorsOpenAt: formData.get('doorsOpenAt'),
          capacity: formData.get('capacity'),
          ageLimit: formData.get('ageLimit'),
          cancellationPolicy: formData.get('cancellationPolicy')
        })
      }));
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The event could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={submit} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-950">Create an event draft</h2>
          <p className="mt-1 text-sm text-slate-500">Drafts are private and cannot accept ticket sales.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-white">Close</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>Event name<input className={inputClass} name="title" required minLength={3} maxLength={160} placeholder="Midnight Society KE" /></label>
        <label className={labelClass}>Venue<input className={inputClass} name="venueName" required minLength={2} maxLength={180} placeholder="Venue name" /></label>
        <label className={labelClass}>City<input className={inputClass} name="city" required minLength={2} maxLength={100} defaultValue="Nairobi" /></label>
        <label className={`${labelClass} sm:col-span-2`}>Venue address<input className={inputClass} name="venueAddress" maxLength={500} placeholder="Street, area, directions" /></label>
        <label className={labelClass}>Event starts<input className={inputClass} name="startsAt" type="datetime-local" required /></label>
        <label className={labelClass}>Event ends<input className={inputClass} name="endsAt" type="datetime-local" required /></label>
        <label className={labelClass}>Doors open (optional)<input className={inputClass} name="doorsOpenAt" type="datetime-local" /></label>
        <label className={labelClass}>Capacity (optional)<input className={inputClass} name="capacity" type="number" min="1" max="1000000" placeholder="Set venue limit" /></label>
        <label className={labelClass}>Minimum age (optional)<input className={inputClass} name="ageLimit" type="number" min="0" max="120" placeholder="No restriction" /></label>
        <label className={`${labelClass} sm:col-span-2`}>Event description<textarea className={`${inputClass} min-h-24 py-3`} name="description" maxLength={10000} placeholder="Tell guests what the event is about." /></label>
        <label className={`${labelClass} sm:col-span-2`}>Cancellation policy<textarea className={`${inputClass} min-h-20 py-3`} name="cancellationPolicy" maxLength={5000} placeholder="Add the event refund and cancellation terms before publishing." /></label>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">
          <CheckCircle2 size={16} /> {saving ? 'Saving draft…' : 'Save event draft'}
        </button>
        <p className="self-center text-xs text-slate-500">Publishing and ticket sales remain disabled until checkout and payment verification are connected.</p>
      </div>
    </form>
  );
}

function TierForm({ event, onCreated, onCancel }: { event: TicketEvent; onCreated: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(formData: FormData) {
    setSaving(true);
    setError('');
    try {
      await readResponse(await fetch('/api/admin/ticketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_ticket_type',
          eventId: event.id,
          name: formData.get('name'),
          description: formData.get('description'),
          price: formData.get('price'),
          capacity: formData.get('capacity'),
          minPerOrder: formData.get('minPerOrder'),
          maxPerOrder: formData.get('maxPerOrder'),
          salesStartAt: formData.get('salesStartAt'),
          salesEndAt: formData.get('salesEndAt')
        })
      }));
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The ticket tier could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={submit} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-slate-900">Add ticket tier</h4>
        <button type="button" onClick={onCancel} className="text-xs font-bold text-slate-500">Cancel</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelClass}>Tier name<input className={inputClass} name="name" required maxLength={100} placeholder="Early Bird" /></label>
        <label className={labelClass}>Price (KES)<input className={inputClass} name="price" required type="number" min="0" max="999999999" step="0.01" placeholder="2500.00" /></label>
        <label className={labelClass}>Allocation<input className={inputClass} name="capacity" required type="number" min="1" max="1000000" placeholder="100" /></label>
        <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>Description<input className={inputClass} name="description" maxLength={2000} placeholder="What's included with this tier?" /></label>
        <label className={labelClass}>Minimum per order<input className={inputClass} name="minPerOrder" required type="number" min="1" max="100" defaultValue="1" /></label>
        <label className={labelClass}>Maximum per order<input className={inputClass} name="maxPerOrder" required type="number" min="1" max="100" defaultValue="10" /></label>
        <label className={labelClass}>Sales open<input className={inputClass} name="salesStartAt" type="datetime-local" /></label>
        <label className={labelClass}>Sales close<input className={inputClass} name="salesEndAt" type="datetime-local" /></label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button disabled={saving} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50">
        <Plus size={15} /> {saving ? 'Saving tier…' : 'Save ticket tier'}
      </button>
    </form>
  );
}

function EventCard({ event, onRefresh }: { event: TicketEvent; onRefresh: () => void }) {
  const [addingTier, setAddingTier] = useState(false);
  const allocated = event.ticket_types.reduce((total, tier) => total + tier.capacity, 0);
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">{statusLabel(event.status)}</span>
              {event.age_limit !== null && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/80">{event.age_limit}+</span>}
            </div>
            <h3 className="text-xl font-black tracking-tight sm:text-2xl">{event.title}</h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/70"><MapPin size={14} />{event.venue_name} · {event.city}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-white/60"><CalendarDays size={13} />{eventDate(event.starts_at)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-right">
            <p className="text-2xl font-black">{event.ticket_types.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Ticket tiers</p>
          </div>
        </div>
        {event.description && <p className="mt-4 max-w-3xl text-sm leading-6 text-white/75">{event.description}</p>}
      </div>
      <div className="p-5 sm:p-6">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Event capacity</p><p className="mt-1 text-sm font-black text-slate-900">{event.capacity ? event.capacity.toLocaleString('en-KE') : 'Not set'}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Tier allocation</p><p className="mt-1 text-sm font-black text-slate-900">{allocated.toLocaleString('en-KE')}{event.capacity ? ` / ${event.capacity.toLocaleString('en-KE')}` : ''}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Event ends</p><p className="mt-1 text-sm font-black text-slate-900">{eventDate(event.ends_at)}</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-900">Ticket tiers</h4>
            <p className="mt-1 text-xs text-slate-500">Price snapshots and allocations are isolated from Online Bar product inventory.</p>
          </div>
          {event.status === 'draft' || event.status === 'scheduled' ? (
            <button type="button" onClick={() => setAddingTier(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-800 hover:bg-slate-50">
              <Plus size={14} /> Add tier
            </button>
          ) : <span className="text-xs font-semibold text-slate-500">Tiers locked for this event state</span>}
        </div>
        {event.ticket_types.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {event.ticket_types.map(tier => (
              <div key={tier.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-800"><Ticket size={15} /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{tier.name}</p><p className="mt-1 text-xs text-slate-500">{tier.description || 'No tier description'} · {tier.min_per_order}–{tier.max_per_order} per order</p></div>
                </div>
                <div className="text-right"><p className="text-sm font-black text-slate-950">{money(tier.price_minor, tier.currency)}</p><p className="mt-1 text-xs text-slate-500">{tier.capacity.toLocaleString('en-KE')} allocated · {statusLabel(tier.status)}</p></div>
              </div>
            ))}
          </div>
        ) : <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No ticket tiers yet. Add tiers before moving this event toward review.</p>}
        {addingTier && <TierForm event={event} onCancel={() => setAddingTier(false)} onCreated={() => { setAddingTier(false); onRefresh(); }} />}
      </div>
    </article>
  );
}

export default function TicketingPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await readResponse(await fetch('/api/admin/ticketing', { cache: 'no-store' })) as DashboardData);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'Ticketing could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.events || [];
    return (data?.events || []).filter(event => `${event.title} ${event.venue_name} ${event.city}`.toLowerCase().includes(normalized));
  }, [data, query]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-lg sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-200/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200"><Ticket size={13} /> Online Bar · Ticketing</div>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Event command centre</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Build and organize event drafts and ticket tiers in an isolated ticketing workspace. Ticketing records do not modify drink orders, product stock or existing payouts.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
              <button type="button" onClick={() => setAddingEvent(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-slate-950 hover:bg-amber-300"><Plus size={16} /> New event</button>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric icon={CalendarDays} label="Events in system" value={data?.totals.events} />
            <Metric icon={Ticket} label="Tickets issued" value={data?.totals.tickets} />
            <Metric icon={Wallet} label="Orders recorded" value={data?.totals.orders} />
          </div>
        </header>

        <section role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-700" />
          <div><p className="text-sm font-black">Sales are deliberately disabled</p><p className="mt-1 text-xs leading-5 text-amber-900">Payment provider verification, customer checkout, ticket issuance and gate scanning are not live yet. Events stay private drafts; this module will not claim a payment or issue a ticket without verified server-side payment.</p></div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Feature icon={ShieldCheck} title="Separate ticket records" body="Dedicated event, tier, reservation, payment, ticket, refund and check-in tables." />
          <Feature icon={Clock3} title="Safe checkout foundation" body="Short-lived reservations are designed to lock inventory and use an idempotency key." />
          <Feature icon={Users} title="Scoped access" body="Ticket administration is visible to platform owners and admins only." />
        </section>

        {addingEvent && <EventForm onCancel={() => setAddingEvent(false)} onCreated={() => { setAddingEvent(false); void load(); }} />}

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-xl font-black tracking-tight text-slate-950">Events</h2><p className="mt-1 text-sm text-slate-500">Create event drafts, then add ticket tiers and allocations.</p></div>
            <label className="relative block w-full sm:w-72"><span className="sr-only">Search events</span><input value={query} onChange={event => setQuery(event.target.value)} className={inputClass} placeholder="Search events, venues or cities" /></label>
          </div>
          {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => void load()} className="ml-2 font-black underline">Try again</button></div>}
          {loading && !data && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading ticketing workspace…</div>}
          {!loading && !error && visibleEvents.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <CalendarDays className="mx-auto text-amber-500" size={30} />
              <h3 className="mt-3 text-lg font-black text-slate-900">{query ? 'No matching events' : 'Start with an event draft'}</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{query ? 'Try another event name, venue or city.' : 'Create the first event, add ticket tiers and allocation, then complete payment and safety setup before opening sales.'}</p>
              {!query && <button type="button" onClick={() => setAddingEvent(true)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800"><Plus size={16} /> Create event draft</button>}
            </div>
          )}
          {visibleEvents.map(event => <EventCard key={event.id} event={event} onRefresh={() => void load()} />)}
        </section>

        <footer className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={19} /><div><p className="text-sm font-black text-slate-900">Release gate</p><p className="mt-1 text-xs leading-5 text-slate-500">Do not publish or accept customer payments until server-verified provider callbacks, atomic reservation expiry, idempotent ticket issuance, customer ownership checks, refund reconciliation and online gate validation are implemented and tested.</p></div><ArrowUpRight className="ml-auto hidden text-slate-300 sm:block" size={16} /></div>
        </footer>
      </div>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Ticket; label: string; value?: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between text-slate-300"><p className="text-[10px] font-black uppercase tracking-[0.15em]">{label}</p><Icon size={16} className="text-amber-300" /></div><p className="mt-2 text-2xl font-black">{value === undefined ? '—' : value.toLocaleString('en-KE')}</p></div>;
}

function Feature({ icon: Icon, title, body }: { icon: typeof Ticket; title: string; body: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-amber-700"><Icon size={16} /><h3 className="text-xs font-black uppercase tracking-wide text-slate-800">{title}</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">{body}</p></article>;
}
