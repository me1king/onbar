'use client';

import { useState } from 'react';
import { Eye, LoaderCircle, X } from 'lucide-react';
import { ticketThemes } from '@/lib/ticketing/theme';

type EmailPreview = {
  orderReference: string;
  recipient: string;
  subject: string;
  html: string;
  theme: string;
  emailStatus: string;
  sentAt: string | null;
  attempts: number;
  themePreferenceAvailable: boolean;
  reconstructed: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function TicketOrderEmailPreview({ orderId }: { orderId: string }) {
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function openPreview() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/ticketing/sales/email-preview?order=${encodeURIComponent(orderId)}`, {
        cache: 'no-store'
      });
      const result = await response.json() as EmailPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || `Email preview failed (${response.status}).`);
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ticket email preview could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPreview()}
        disabled={loading}
        className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-amber-200/20 px-2.5 text-[10px] font-bold text-amber-100 hover:bg-amber-100/10 disabled:opacity-50"
      >
        {loading ? <LoaderCircle size={12} className="animate-spin" /> : <Eye size={12} />}
        {loading ? 'Loading…' : 'View email'}
      </button>
      {error && <p role="alert" className="mt-2 max-w-56 text-[10px] leading-4 text-red-200">{error}</p>}
      {preview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`ticket-email-preview-title-${orderId}`}
            className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111018] shadow-2xl"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id={`ticket-email-preview-title-${orderId}`} className="text-lg font-black text-white">Buyer ticket email</h2>
                <p className="mt-1 break-all text-xs text-slate-300">{preview.recipient}</p>
                <p className="mt-1 text-xs text-slate-400">Subject: {preview.subject}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Email color: {ticketThemes.find(theme => theme.id === preview.theme)?.label || 'Default'}
                  {preview.sentAt ? ` · Sent ${formatDate(preview.sentAt)}` : ` · Status: ${preview.emailStatus.replaceAll('_', ' ')}`}
                  {preview.attempts > 0 ? ` · Attempts: ${preview.attempts}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close email preview"
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white hover:bg-white/10"
              >
                <X size={14} /> Close
              </button>
              <p className="w-full text-[11px] leading-5 text-amber-100/80">
                Reconstructed preview from the order and current email settings; the exact sent email body was not archived.
                {preview.sentAt && ' The buyer email was marked sent, but this preview may differ if settings changed afterward.'}
                {!preview.themePreferenceAvailable && ' The order-specific color preference was not saved; this preview uses the current published ticket theme.'}
              </p>
            </header>
            <iframe
              title={`Ticket email preview for ${preview.orderReference}`}
              srcDoc={preview.html}
              sandbox=""
              referrerPolicy="no-referrer"
              className="min-h-0 flex-1 bg-white"
            />
          </section>
        </div>
      )}
    </>
  );
}
