'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Loader2, RefreshCw, ShieldCheck, UserPlus, UserRoundX } from 'lucide-react';

type TicketEvent = { id: string; title: string; status: string; starts_at: string; ends_at: string };
type GateAssignment = {
  id: string;
  event_id: string;
  user_id: string;
  role: string;
  gate_name: string | null;
  active: boolean;
  created_at: string;
  email: string;
};
type StaffData = { events: TicketEvent[]; assignments: GateAssignment[] };

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#17121e] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/15';

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export default function TicketingGateStaffPage() {
  const [data, setData] = useState<StaffData>({ events: [], assignments: [] });
  const [eventId, setEventId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await readResponse<StaffData>(await fetch('/api/admin/ticketing/staff', { cache: 'no-store' }));
      setData(result);
      setEventId(current => result.events.some(event => event.id === current) ? current : result.events[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gate staff could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await readResponse(await fetch('/api/admin/ticketing/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          eventId,
          email: formData.get('email'),
          gateName: formData.get('gateName')
        })
      }));
      form.reset();
      setNotice('Gate access assigned. Staff can sign into the isolated scanner with that verified account.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gate access could not be assigned.');
    } finally {
      setWorking(false);
    }
  }

  async function revoke(assignment: GateAssignment) {
    if (!window.confirm(`Revoke ${assignment.email}'s gate access for this event?`)) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await readResponse(await fetch('/api/admin/ticketing/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', assignmentId: assignment.id })
      }));
      setNotice('Gate access revoked. The scanner will reject any new requests for this event.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gate access could not be revoked.');
    } finally {
      setWorking(false);
    }
  }

  const selectedEvent = data.events.find(event => event.id === eventId);
  const visibleAssignments = data.assignments.filter(item => !eventId || item.event_id === eventId);

  return (
    <main className="min-h-screen bg-[#0b0a0f] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin/ticketing" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft size={15} /> Ticketing control centre
            </Link>
            <div className="mt-5 flex items-center gap-3">
              <div className="rounded-2xl border border-amber-200/15 bg-amber-200/5 p-3 text-amber-200"><ShieldCheck size={22} /></div>
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Isolated gate operations</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Scanner staff access</h1></div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Assign verified Supabase accounts to one event and gate at a time. Access is checked again by the check-in database function for every scan.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || working} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-bold text-slate-200 hover:bg-white/[0.07] disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </header>

        {error && <p role="alert" className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-200">{notice}</p>}

        <section className="rounded-2xl border border-white/10 bg-[#111016] p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2"><UserPlus size={17} className="text-amber-200" /><h2 className="font-black">Assign event gate staff</h2></div>
          <form onSubmit={assign} className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-300 md:col-span-2">Event
              <select required value={eventId} onChange={event => setEventId(event.target.value)} className={inputClass}>
                <option value="">Choose event</option>
                {data.events.map(event => <option key={event.id} value={event.id}>{event.title} · {event.status}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-300">Verified staff account email
              <input required name="email" type="email" autoComplete="email" maxLength={320} className={inputClass} placeholder="gate.staff@example.com" />
            </label>
            <label className="text-xs font-bold text-slate-300">Gate name
              <input name="gateName" maxLength={120} className={inputClass} placeholder="Main entrance" />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={!eventId || working} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-200 px-5 text-sm font-black text-[#171018] hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
                {working ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />} Assign scanner access
              </button>
              <p className="mt-3 text-xs leading-5 text-slate-500">Create the staff member’s Supabase Auth account and have them verify its email first. Do not share an admin login. Staff sign into <span className="font-bold text-slate-300">/scanner</span> with their own account.</p>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111016] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-black">Event assignments</h2><p className="mt-1 text-xs text-slate-500">{selectedEvent ? `${selectedEvent.title} · ${formatDate(selectedEvent.starts_at)}` : 'Choose an event to filter assignments.'}</p></div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{visibleAssignments.length} staff</span>
          </div>
          {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading assignments</div>
            : visibleAssignments.length ? <div className="divide-y divide-white/5">
              {visibleAssignments.map(assignment => {
                const event = data.events.find(item => item.id === assignment.event_id);
                return <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div><p className="text-sm font-bold">{assignment.email}</p><p className="mt-1 text-xs text-slate-400">{event?.title || 'Event unavailable'} · {assignment.gate_name || 'Gate not named'} · {assignment.active ? 'Active' : 'Revoked'}</p></div>
                  {assignment.active && <button type="button" onClick={() => void revoke(assignment)} disabled={working} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-300/15 px-3 text-xs font-bold text-red-200 hover:bg-red-300/5 disabled:opacity-50"><UserRoundX size={14} /> Revoke</button>}
                </div>;
              })}
            </div>
            : <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">{data.events.length ? 'No staff are assigned to this event yet.' : 'Create an event draft before assigning gate staff.'}</p>}
        </section>

        <p className="text-xs leading-5 text-slate-500">The scanner requires a live connection. Do not admit a guest based on a screenshot or an offline scan result. Checkout and ticket issuance are implemented, but the complete sandbox payment-to-wallet-to-gate flow has not yet been rehearsed. Assign staff to an event and verify a sandbox ticket before relying on gate admission.</p>
      </div>
    </main>
  );
}
