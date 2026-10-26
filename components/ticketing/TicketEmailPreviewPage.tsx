import Link from 'next/link';
import { Mail } from 'lucide-react';
import { generateTicketEmailPreview } from '@/lib/ticketing/email.server';
import { isTicketThemeId, ticketThemes, type TicketThemeId } from '@/lib/ticketing/theme';
import TicketEmailPreviewActions from '@/components/ticketing/TicketEmailPreviewActions';

export default async function TicketEmailPreviewPage({
  basePath,
  requestedTheme
}: {
  basePath: string;
  requestedTheme?: string;
}) {
  const theme: TicketThemeId = isTicketThemeId(requestedTheme) ? requestedTheme : 'midnight';
  const preview = await generateTicketEmailPreview(theme);
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());

  return (
    <main className="ticket-admin-theme min-h-screen bg-[#0d0a12] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-amber-200/15 bg-gradient-to-br from-[#201913] via-[#151319] to-[#0e0d12] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <Link href={basePath} className="text-xs font-bold text-amber-200 hover:text-amber-100">← Back to ticketing</Link>
          <div className="mt-5 flex items-start gap-3">
            <Mail className="mt-1 text-amber-200" size={22} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Buyer email</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Ticket confirmation preview</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                This is the same ticket email layout sent after payment is verified. The details and QR codes below are sample-only; this page does not send an email and its QR codes are not valid for entry.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-[#17121e] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ticket email appearance</p>
              <p className="mt-1 text-xs text-slate-300">Preview the available ticket themes.</p>
            </div>
            <nav aria-label="Email preview theme" className="flex flex-wrap gap-2">
              {ticketThemes.map(option => (
                <Link
                  key={option.id}
                  href={`${basePath}/email-preview?theme=${encodeURIComponent(option.id)}`}
                  aria-current={theme === option.id ? 'page' : undefined}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    theme === option.id
                      ? 'border-amber-200/50 bg-amber-200/10 text-amber-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <section aria-label="Email delivery details" className="grid gap-3 rounded-2xl border border-white/10 bg-[#17121e] p-4 sm:grid-cols-2 sm:p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Subject</p>
            <p className="mt-1 text-sm font-bold text-white">Your tickets for Midnight Society — Sample Event – 19 Jun 2027</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sender</p>
            <p className="mt-1 break-all text-sm font-bold text-white">{sender || 'RESEND_FROM_EMAIL is not configured'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resend API key</p>
            <p className={`mt-1 text-sm font-bold ${resendConfigured ? 'text-emerald-300' : 'text-amber-200'}`}>
              {resendConfigured ? 'Configured on this deployment' : 'Not configured on this deployment'}
            </p>
            <p className="mt-1 text-xs text-slate-400">This status only checks that an environment value exists. It does not validate the key, sender-domain verification, or delivery.</p>
          </div>
        </section>

        <TicketEmailPreviewActions theme={theme} />

        <section aria-label="Email preview" className="overflow-hidden rounded-2xl border border-white/10 bg-white p-2 shadow-2xl shadow-black/30 sm:p-4">
          <iframe
            title="Sample ticket confirmation email"
            srcDoc={preview.html}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-[1500px] w-full border-0"
          />
        </section>
        <section aria-label="Email content checklist" className="rounded-2xl border border-white/10 bg-[#17121e] p-5 sm:p-6">
          <h2 className="text-sm font-black text-white">Included in real ticket emails</h2>
          <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-300 sm:grid-cols-2">
            <li>• One QR per issued ticket, attendee name, ticket type, ticket reference, and ticket count</li>
            <li>• Event date/time, door time, venue/address, map directions, entry and arrival guidance</li>
            <li>• Order total, subtotal, fees, discount/promo when available, and payment provider</li>
            <li>• A printable PDF ticket for each attendee and an .ics calendar attachment</li>
            <li>• Plain-text fallback and a reminder to check spam if the ticket email is missing</li>
            <li>• QR credentials are random, private, and checked against ticket status by the scanner</li>
          </ul>
          <p className="mt-4 text-xs leading-5 text-amber-100/80">
            Receipt codes, seat assignments, Apple/Google Wallet passes, scheduled reminders, and delivery/open tracking are not available in the current ticketing data/integration.
          </p>
        </section>
      </div>
    </main>
  );
}
