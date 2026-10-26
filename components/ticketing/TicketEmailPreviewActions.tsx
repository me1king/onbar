'use client';

import { useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { ticketThemes, type TicketThemeId } from '@/lib/ticketing/theme';

export default function TicketEmailPreviewActions({ theme }: { theme: TicketThemeId }) {
  const [recipient, setRecipient] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function sendTestEmail() {
    if (sending) return;
    setSending(true);
    setMessage('');
    setError(false);
    try {
      const response = await fetch('/api/admin/ticketing/email-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, recipient }),
        cache: 'no-store'
      });
      const result = await response.json() as { sentTo?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Test email could not be sent.');
      setMessage(`Sample email sent to ${result.sentTo}. The attached QR codes are not valid for entry.`);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Test email could not be sent.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-amber-200/15 bg-amber-100/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p className="text-sm font-black text-white">Send {ticketThemes.find(option => option.id === theme)?.label} sample email</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">Choose a color above first. The email and attached sample PDF tickets use that color. QR codes are invalid and no real ticket is created.</p>
        {message && <p role={error ? 'alert' : 'status'} className={`mt-2 text-xs ${error ? 'text-rose-300' : 'text-emerald-300'}`}>{message}</p>}
      </div>
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-80">
        <label htmlFor="ticket-preview-recipient" className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Test recipient email</label>
        <input
          id="ticket-preview-recipient"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={recipient}
          onChange={event => setRecipient(event.target.value)}
          placeholder="Leave blank to use your admin email"
          className="min-h-10 rounded-lg border border-white/15 bg-black/20 px-3 text-sm text-white placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={() => void sendTestEmail()}
          disabled={sending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-black text-[#170d18] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
          {sending ? 'Sending sample…' : 'Send sample email'}
        </button>
      </div>
    </section>
  );
}
