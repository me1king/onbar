'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, LoaderCircle, Mail, Send } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import {
  DEFAULT_WAITLIST_INVITATION_MESSAGE,
  DEFAULT_WAITLIST_INVITATION_SUBJECT,
  WAITLIST_INVITATION_DRAFT_STORAGE_KEY
} from '@/lib/waitlistInvitationDraft';

export default function WaitlistInvitationStudio() {
  const { role, permissions } = useAdmin();
  const [subject, setSubject] = useState(DEFAULT_WAITLIST_INVITATION_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_WAITLIST_INVITATION_MESSAGE);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const canSend = role === 'owner' || role === 'admin'
    || permissions.can_manage_communications === true
    || permissions.can_manage_customer_care === true;
  const ready = Boolean(subject.trim() && message.trim());
  const previewTicketUrl = 'https://onlinebar.co.ke/tickets';
  const previewMessage = `${message
    .replaceAll('{{name}}', 'Alex')
    .replaceAll('{{tickets_link}}', previewTicketUrl)}${message.includes('{{tickets_link}}') || message.includes(previewTicketUrl) ? '' : `\n\nGet your tickets: ${previewTicketUrl}`}\n\nWe’re sending this through Gmail for now while we finish setting up SMS and WhatsApp. Thanks for your patience.`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WAITLIST_INVITATION_DRAFT_STORAGE_KEY);
      if (saved) {
        const draft: unknown = JSON.parse(saved);
        if (typeof draft === 'object' && draft !== null
          && 'subject' in draft && typeof draft.subject === 'string'
          && 'message' in draft && typeof draft.message === 'string') {
          setSubject(draft.subject.slice(0, 200));
          setMessage(draft.message.slice(0, 5000)
            .replace(/\bADD DATE\b|\bADD TIME\b|ADD PRIVATE VENUE DETAILS/gi, '')
            .replace(/\n{3,}/g, '\n\n'));
        }
      }
    } catch (error) {
      console.error('[WaitlistInvitationStudio] Could not restore the saved draft:', error);
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      window.localStorage.setItem(WAITLIST_INVITATION_DRAFT_STORAGE_KEY, JSON.stringify({ subject, message }));
    } catch (error) {
      console.error('[WaitlistInvitationStudio] Could not save the invitation draft:', error);
    }
  }, [draftLoaded, message, subject]);

  async function sendInvitations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || sending) return;
    if (!window.confirm('Send the invitation to all New waitlist members with active consent for email, SMS and/or WhatsApp? Each person will only be contacted through channels they opted into.')) return;

    setSending(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_halloween_invitations',
          subject,
          message
        })
      });
      const data = await response.json() as { invited?: number; sent?: number; failed?: number; trackingFailed?: number; eligible?: number; error?: string };
      if (!response.ok && response.status !== 207) {
        throw new Error(data.error || 'The invitation campaign could not be sent.');
      }

      setResult({
        type: data.failed || data.trackingFailed ? 'error' : 'success',
        message: data.failed
          ? `Invited ${data.invited || 0} of ${data.eligible || 0} people (${data.sent || 0} messages sent across opted-in channels). ${data.failed} channel deliveries failed.${data.trackingFailed ? ` ${data.trackingFailed} delivery results could not be counted.` : ''}`
          : `Invited ${data.invited || 0} people with active channel consent; ${data.sent || 0} messages sent across email, SMS and WhatsApp.${data.trackingFailed ? ` ${data.trackingFailed} delivery results could not be counted.` : ''}`
      });
    } catch (error) {
      console.error('[WaitlistInvitationStudio] Could not send invitation campaign:', error);
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'The invitation campaign could not be sent.'
      });
    } finally {
      setSending(false);
    }
  }

  if (!canSend) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-rose-500" />
        <h1 className="mt-4 text-2xl font-black text-slate-950">Waitlist invitation access required</h1>
        <p className="mt-2 text-sm text-slate-600">Only authorized communications staff and administrators can send waitlist invitations.</p>
        <Link href="/lord/waitlist" className="mt-5 text-sm font-bold text-primary hover:underline">Return to the waitlist</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/lord/waitlist" className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-950">
            <ArrowLeft size={14} /> Back to waitlist
          </Link>
          <p className="mt-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-800"><Mail size={14} /> Waitlist communications</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950">Halloween invitation studio 🎃</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Save your personalized invitation here, then use Invite beside a person in the waitlist directory to send it only to them. Each person is contacted through email, SMS and/or WhatsApp only when they opted into that channel. Bulk send reaches all eligible New members with at least one active channel consent.</p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <form onSubmit={sendInvitations} className="space-y-5 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="grid gap-2 text-xs font-bold text-slate-700">
            Email subject
            <input
              required
              maxLength={200}
              value={subject}
              onChange={event => setSubject(event.target.value)}
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          <label className="grid gap-2 text-xs font-bold text-slate-700">
            Message
            <textarea
              required
              maxLength={5000}
              rows={15}
              value={message}
              onChange={event => setMessage(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          <div className="rounded-xl bg-orange-50 p-4 text-xs leading-5 text-orange-950">
            <p className="font-black">Personalization and ticket link</p>
            <p className="mt-1">Use <code className="rounded bg-white px-1">{'{{name}}'}</code> to personalize the greeting and <code className="rounded bg-white px-1">{'{{tickets_link}}'}</code> for the Online Bar ticket page. If you leave the token out, the Online Bar ticket link is added automatically. Event date, time, and venue are optional—include them when you are ready.</p>
          </div>

          {result && (
            <div role={result.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${result.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
              {result.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
              <p>{result.message}</p>
            </div>
          )}

          <button type="submit" disabled={!ready || sending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-800 px-5 text-sm font-black text-white transition hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {sending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
            {sending ? 'Sending invitations…' : 'Send to eligible New waitlist members'}
          </button>
        </form>

        <aside className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-950 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">Email preview</p>
            <h2 className="mt-2 break-words text-lg font-black text-white">{subject || 'Your subject will appear here'}</h2>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-[10px] font-semibold text-slate-500">To: One selected member or all eligible New members, using their opted-in channels</p>
            <div className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {previewMessage.split(previewTicketUrl).map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && <a href={previewTicketUrl} target="_blank" rel="noreferrer" className="break-all font-semibold text-blue-700 underline">{previewTicketUrl}</a>}
                  {part}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 px-5 py-3 text-[10px] leading-5 text-slate-500">
            The ticket link opens Online Bar tickets. Emails include a marketing opt-out link. SMS and WhatsApp use their respective configured providers; WhatsApp requires an approved template. No invitation is sent until you tap Invite or confirm bulk send.
          </div>
        </aside>
      </div>
    </main>
  );
}
