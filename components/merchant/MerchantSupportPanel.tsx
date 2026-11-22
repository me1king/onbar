'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { useSettings } from '@/lib/useSettings';

type MerchantTicket = {
  id: string;
  subject: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
};

const ticketCategories = [
  'Merchant operations',
  'Payments and statements',
  'Catalog and stock',
  'Safety and compliance',
  'Other'
];

export default function MerchantSupportPanel({
  applicationId,
  applicationName,
  accessToken
}: {
  applicationId: string;
  applicationName: string;
  accessToken: string;
}) {
  const { settings } = useSettings();
  const [tickets, setTickets] = useState<MerchantTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(ticketCategories[0]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const supportEmail = settings.contact.email.trim();
  const supportEmailConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
  const supportEmailHref = useMemo(() => {
    const subject = `Merchant support: ${applicationName}`;
    const body = `Hello OnBar support,\n\nI need help with ${applicationName}.\n\n`;
    return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [applicationName, supportEmail]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/merchant/support?applicationId=${encodeURIComponent(applicationId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const result = await response.json() as { tickets?: MerchantTicket[]; error?: string };
      if (!response.ok || !result.tickets) throw new Error(result.error || 'Support history could not be loaded.');
      setTickets(result.tickets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Support history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, applicationId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setStatusMessage('');
    try {
      const response = await fetch('/api/merchant/support', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, subject, category, message })
      });
      const result = await response.json() as { ticket?: MerchantTicket; error?: string; notificationWarning?: string };
      if (!response.ok || !result.ticket) throw new Error(result.error || 'Support request could not be saved.');
      setTickets(current => [result.ticket!, ...current]);
      setSubject('');
      setMessage('');
      setStatusMessage(result.notificationWarning
        ? `Support request #${result.ticket.id} saved. ${result.notificationWarning}`
        : `Support request #${result.ticket.id} saved. A confirmation email was sent; replies will appear in this history.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Support request could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  return <section className="space-y-5 text-zinc-100">
    <header>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{applicationName}</p>
      <h2 className="mt-2 text-2xl font-black text-white">Merchant support</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Send a request to OnBar and keep its status and replies in one place.</p>
    </header>
    {supportEmailConfigured && <a
      href={supportEmailHref}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white"
    >
      <Mail size={16} aria-hidden="true" /> Email OnBar support
    </a>}
    <p className="text-xs leading-5 text-zinc-500">The email shortcut opens your email app. To keep the request and replies in this ticket history, use the form below.</p>
    <form onSubmit={event => void submitTicket(event)} className="grid gap-4 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5 sm:grid-cols-2">
      <label className="text-xs font-bold text-zinc-300">Topic
        <select value={category} onChange={event => setCategory(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#111214] px-3 text-sm text-white">
          {ticketCategories.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-zinc-300">Subject
        <input required minLength={3} maxLength={120} value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-[#111214] px-3 text-sm text-white" />
      </label>
      <label className="text-xs font-bold text-zinc-300 sm:col-span-2">What do you need help with?
        <textarea required minLength={10} maxLength={3000} rows={4} value={message} onChange={event => setMessage(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111214] p-3 text-sm text-white" />
      </label>
      {error && <p role="alert" className="text-sm text-rose-300 sm:col-span-2">{error}</p>}
      {statusMessage && <p role="status" className="text-sm text-emerald-300 sm:col-span-2">{statusMessage}</p>}
      <button type="submit" disabled={working} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-xs font-black uppercase text-zinc-950 disabled:opacity-50 sm:col-span-2">
        <Send size={14} aria-hidden="true" /> {working ? 'Saving request…' : 'Save support request'}
      </button>
    </form>
    <section aria-labelledby="merchant-support-history" className="rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
      <h3 id="merchant-support-history" className="font-black text-white">Ticket history</h3>
      {loading && <p role="status" className="mt-4 text-sm text-zinc-400">Loading support history…</p>}
      {!loading && !tickets.length && <p className="mt-4 text-sm text-zinc-400">No support requests for this business yet.</p>}
      <div className="mt-4 space-y-3">
        {tickets.map(ticket => <article key={ticket.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h4 className="font-bold text-white">{ticket.subject || 'Support request'}</h4><p className="mt-1 text-xs text-zinc-400">{ticket.category || 'General'} · {new Date(ticket.created_at).toLocaleString('en-KE')}</p></div>
            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase text-amber-200">{ticket.status || 'Open'}</span>
          </div>
          {ticket.admin_response && <p className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm leading-6 text-emerald-100"><strong>OnBar reply:</strong> {ticket.admin_response}</p>}
        </article>)}
      </div>
    </section>
  </section>;
}
