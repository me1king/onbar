'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, MessageSquareText, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function WaitlistDeveloperSuggestion({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('Waitlist member');
  const [email, setEmail] = React.useState(defaultEmail);
  const [emailEdited, setEmailEdited] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [ticketId, setTicketId] = React.useState('');
  const [emailWarning, setEmailWarning] = React.useState('');

  React.useEffect(() => {
    if (!emailEdited) setEmail(defaultEmail);
  }, [defaultEmail, emailEdited]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subject: 'Waitlist suggestion for the developer',
          message,
          category: 'Other',
          website: ''
        })
      });
      const result = await response.json() as { success?: boolean; ticketId?: string; error?: string; emailWarning?: string };
      if (!response.ok || !result.success || !result.ticketId) {
        throw new Error(result.error || 'Your suggestion could not be sent.');
      }
      setTicketId(result.ticketId);
      setEmailWarning(result.emailWarning || '');
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your suggestion could not be sent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="waitlist-developer-suggestion-form"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-red-700 bg-red-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
        >
          <MessageSquareText size={17} /> Give suggestions to the developer
        </button>
      ) : (
        <div id="waitlist-developer-suggestion-form" className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-red-950">Give suggestions to the developer</h3>
              <p className="mt-1 text-xs leading-5 text-red-900/80">Your message is saved in our support workspace for the team to review.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close suggestion form" className="rounded-lg p-1 text-red-800 hover:bg-red-100">
              <X size={17} />
            </button>
          </div>

          {ticketId ? (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-white p-3 text-sm text-emerald-800">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
              <p>Suggestion sent. Reference #{ticketId.slice(0, 8).toUpperCase()}.</p>
            </div>
          ) : (
            <form onSubmit={event => void submit(event)} className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-slate-700">Name
                <Input required maxLength={120} value={name} onChange={event => setName(event.target.value)} className="mt-1 rounded-lg bg-white" />
              </label>
              <label className="block text-xs font-bold text-slate-700">Email
                <Input required type="email" autoComplete="email" maxLength={254} value={email} onChange={event => {
                  setEmailEdited(true);
                  setEmail(event.target.value);
                }} className="mt-1 rounded-lg bg-white" />
              </label>
              <label className="block text-xs font-bold text-slate-700">Your suggestion
                <Textarea required minLength={10} maxLength={4000} rows={4} value={message} onChange={event => setMessage(event.target.value)} placeholder="Tell us what would improve your waitlist experience…" className="mt-1 rounded-lg bg-white" />
              </label>
              {error && <p role="alert" className="rounded-lg bg-white p-3 text-xs font-semibold text-red-800">{error}</p>}
              <Button type="submit" disabled={submitting} className="h-10 w-full rounded-lg bg-red-600 font-bold text-white hover:bg-red-700">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {submitting ? 'Sending…' : 'Send suggestion'}
              </Button>
            </form>
          )}
          {ticketId && emailWarning && <p role="status" className="mt-3 rounded-lg bg-white p-3 text-xs leading-relaxed text-amber-800">{emailWarning}</p>}
        </div>
      )}
    </section>
  );
}
