'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Mail, RefreshCw, X } from 'lucide-react';

type Transfer = {
  id: string;
  ticketReference: string;
  replacementReference: string;
  eventTitle: string;
  ticketType: string;
  from_email: string;
  to_email: string;
  to_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
};

async function readResponse(response: Response) {
  const result = await response.json().catch(() => ({})) as { error?: string; transfers?: Transfer[]; emailSent?: boolean; replacementReference?: string | null };
  if (!response.ok) throw new Error(result.error || `Transfer request failed (${response.status}).`);
  return result;
}

export default function TicketingTransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [review, setReview] = useState<{ id: string; decision: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await readResponse(await fetch('/api/admin/ticketing/transfers', { cache: 'no-store' }));
      setTransfers(result.transfers || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) return;
    setBusyId(review.id);
    setError('');
    setNotice('');
    try {
      const result = await readResponse(await fetch('/api/admin/ticketing/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferId: review.id, decision: review.decision, reason })
      }));
      setNotice(review.decision === 'approve'
        ? result.emailSent
          ? 'Transfer approved, the old ticket was invalidated, and the recipient was sent a secure wallet link.'
          : `Transfer approved and the old ticket invalidated, but email delivery failed. ${result.replacementReference ? `Replacement reference: ${result.replacementReference}.` : ''}`
        : 'Transfer rejected. The original ticket remains active.');
      setReview(null);
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer review could not be recorded.');
    } finally {
      setBusyId('');
    }
  }

  async function resend(id: string) {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await readResponse(await fetch('/api/admin/ticketing/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferId: id, decision: 'resend' })
      }));
      setNotice('A one-time ticket access link has been emailed to the approved recipient.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transfer access email could not be resent.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0a12] px-4 py-7 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-amber-200/15 bg-gradient-to-br from-[#201913] via-[#151319] to-[#0e0d12] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href="/lord/ticketing" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white"><ArrowLeft size={14} /> Ticketing management</Link>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-amber-200">Owner-only controls</p>
              <h1 className="mt-1 text-3xl font-black">Transfer review</h1>
              <p className="mt-2 text-sm text-slate-300">Approvals revoke the original ticket and issue a replacement. Decisions are recorded in the Ticketing audit log.</p>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold hover:bg-white/5 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>
          </div>
        </header>
        {notice && <p role="status" className="rounded-xl border border-emerald-200/20 bg-emerald-950/20 p-4 text-sm text-emerald-100">{notice}</p>}
        {error && <p role="alert" className="rounded-xl border border-red-200/20 bg-red-950/20 p-4 text-sm text-red-100">{error}</p>}
        {loading && <p className="rounded-xl border border-white/10 bg-[#17121e] p-5 text-sm text-slate-300">Loading transfer requests…</p>}
        {!loading && !error && transfers.length === 0 && <p className="rounded-xl border border-white/10 bg-[#17121e] p-5 text-sm text-slate-400">No ticket transfer requests have been recorded.</p>}
        <div className="grid gap-4">
          {transfers.map(transfer => (
            <article key={transfer.id} className="rounded-2xl border border-white/10 bg-[#17121e] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-amber-200">{transfer.eventTitle} · {transfer.ticketType}</p>
                  <h2 className="mt-2 text-lg font-black">{transfer.ticketReference}</h2>
                  <p className="mt-1 text-xs text-slate-400">Requested {new Date(transfer.requested_at).toLocaleString('en-KE')}</p>
                </div>
                <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-black uppercase">{transfer.status}</span>
              </div>
              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                <p className="rounded-xl border border-white/5 bg-black/15 p-3"><span className="block text-[10px] font-bold uppercase text-slate-500">Current holder</span><span className="mt-1 block text-slate-200">{transfer.from_email}</span></p>
                <p className="rounded-xl border border-white/5 bg-black/15 p-3"><span className="block text-[10px] font-bold uppercase text-slate-500">Requested recipient</span><span className="mt-1 block text-slate-200">{transfer.to_name || 'Ticket holder'} · {transfer.to_email}</span></p>
              </div>
              {transfer.reviewed_at && <p className="mt-3 text-xs text-slate-500">Reviewed {new Date(transfer.reviewed_at).toLocaleString('en-KE')} by {transfer.reviewed_by_email || 'platform owner'}{transfer.reason ? ` · ${transfer.reason}` : ''}</p>}
              {transfer.status === 'approved' && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>Replacement ticket: {transfer.replacementReference || 'Not available'}</span><button type="button" disabled={busyId === transfer.id} onClick={() => void resend(transfer.id)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 font-bold text-white disabled:opacity-50"><Mail size={14} />Resend access link</button></div>}
              {transfer.status === 'pending' && review?.id === transfer.id ? (
                <form onSubmit={event => void submitReview(event)} className="mt-4 rounded-xl border border-amber-200/15 bg-black/15 p-4">
                  <p className="text-xs font-bold text-slate-200">Confirm {review.decision}. {review.decision === 'approve' ? 'The old ticket will be revoked and a replacement issued.' : 'The original ticket remains active.'}</p>
                  <label className="mt-3 block text-xs font-bold text-slate-300">Audit reason<textarea required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-white/10 bg-[#0d0a12] p-3 text-sm text-white" /></label>
                  <div className="mt-3 flex gap-2"><button disabled={busyId === transfer.id} className="min-h-10 rounded-lg bg-amber-300 px-4 text-xs font-black text-[#170d18] disabled:opacity-50">Confirm {review.decision}</button><button type="button" onClick={() => setReview(null)} className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold">Cancel</button></div>
                </form>
              ) : transfer.status === 'pending' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setReview({ id: transfer.id, decision: 'approve' }); setReason(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-300 px-4 text-xs font-black text-[#092014]"><Check size={14} />Approve</button>
                  <button type="button" onClick={() => { setReview({ id: transfer.id, decision: 'reject' }); setReason(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200/20 px-4 text-xs font-bold text-red-100"><X size={14} />Reject</button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
