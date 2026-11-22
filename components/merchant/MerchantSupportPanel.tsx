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
  description: string | null;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: string | number;
    senderRole: string;
    senderName: string;
    body: string;
    createdAt: string;
  }>;
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
  const [workingTicketId, setWorkingTicketId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const supportEmail = settings.contact.email.trim();
  const supportEmailConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
  const supportEmailHref = useMemo(() => {
    const subject = `Merchant support: ${applicationName}`;
    const body = `Hello OnBar support,\n\nI need help with ${applicationName}.\n\n`;
    return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [applicationName, supportEmail]);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
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
      if (!silent) setLoading(false);
    }
  }, [accessToken, applicationId]);

  useEffect(() => {
    void loadTickets();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadTickets(true);
    }, 15_000);
    return () => window.clearInterval(timer);
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
      setTickets(current => [{
        ...result.ticket!,
        description: message,
        messages: [{
          id: `initial-${result.ticket!.id}`,
          senderRole: 'merchant',
          senderName: applicationName,
          body: message,
          createdAt: result.ticket!.created_at
        }]
      }, ...current]);
      setSubject('');
      setMessage('');
      setStatusMessage(result.notificationWarning
        ? `Support request #${result.ticket.id} saved. ${result.notificationWarning}`
        : `Support request #${result.ticket.id} sent. The OnBar team was notified; replies will appear here.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Support request could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  async function sendReply(ticketId: string) {
    const reply = (replyDrafts[ticketId] || '').trim();
    if (!reply || workingTicketId) return;
    setWorkingTicketId(ticketId);
    setError('');
    setStatusMessage('');
    try {
      const response = await fetch('/api/merchant/support', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply', applicationId, ticketId, message: reply })
      });
      const result = await response.json() as {
        message?: MerchantTicket['messages'][number];
        error?: string;
        notificationWarning?: string;
      };
      if (!response.ok || !result.message) throw new Error(result.error || 'Your message could not be sent.');
      setTickets(current => current.map(ticket => ticket.id === ticketId ? {
        ...ticket,
        status: 'Open',
        messages: [...ticket.messages, result.message!]
      } : ticket));
      setReplyDrafts(current => ({ ...current, [ticketId]: '' }));
      setStatusMessage(result.notificationWarning || 'Message sent to the OnBar team. You will see their reply here.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your message could not be sent.');
    } finally {
      setWorkingTicketId(null);
    }
  }

  return <section className="space-y-5 text-zinc-100">
    <header>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{applicationName}</p>
      <h2 className="mt-2 text-2xl font-black text-white">Merchant support</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Need anything from the OnBar admin team? Request catalog or pricing changes, product help, order or payment support, account updates, or anything else. Send it here and follow the replies in your ticket history.</p>
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
        <Send size={14} aria-hidden="true" /> {working ? 'Sending to OnBar…' : 'Send to OnBar team'}
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
          <div className="mt-4 space-y-3">
            {ticket.messages.map(message => <div
              key={message.id}
              className={`rounded-xl p-3 ${message.senderRole === 'admin' ? 'bg-emerald-950/60 text-emerald-100' : 'bg-black/30 text-zinc-200'}`}
            >
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                {message.senderRole === 'admin' ? 'OnBar team' : 'You'} · {new Date(message.createdAt).toLocaleString('en-KE')}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
            </div>)}
          </div>
          <form onSubmit={event => { event.preventDefault(); void sendReply(ticket.id); }} className="mt-4 space-y-2">
            <label htmlFor={`merchant-support-reply-${ticket.id}`} className="sr-only">Reply to {ticket.subject || 'support ticket'}</label>
            <textarea
              id={`merchant-support-reply-${ticket.id}`}
              value={replyDrafts[ticket.id] || ''}
              maxLength={4000}
              rows={2}
              onChange={event => setReplyDrafts(current => ({ ...current, [ticket.id]: event.target.value }))}
              placeholder="Send a follow-up message…"
              className="w-full rounded-lg border border-white/10 bg-[#111214] p-3 text-sm text-white"
            />
            <button type="submit" disabled={!replyDrafts[ticket.id]?.trim() || Boolean(workingTicketId)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50">
              <Send size={13} aria-hidden="true" /> {workingTicketId === ticket.id ? 'Sending…' : 'Send follow-up'}
            </button>
          </form>
        </article>)}
      </div>
    </section>
  </section>;
}
