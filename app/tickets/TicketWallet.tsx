'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, LoaderCircle, MapPin, ShieldCheck, Ticket } from 'lucide-react';
import QRCode from 'qrcode';
import TicketingBrand from '@/app/tickets/TicketingBrand';

type WalletTicket = {
  reference: string;
  attendeeName: string;
  ticketName: string;
  credential: string;
};

type Wallet = {
  status: string;
  orderReference?: string;
  message?: string;
  order?: { reference: string; totalMinor: number; currency: string };
  event?: { title: string; starts_at: string; ends_at: string; venue_name: string; city: string; timezone: string };
  tickets?: WalletTicket[];
  error?: string;
};

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  }).format(new Date(value));
}

function TicketQr({ credential, reference }: { credential: string; reference: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(credential, { width: 256, margin: 2, errorCorrectionLevel: 'H' })
      .then(dataUrl => { if (active) setImage(dataUrl); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [credential]);

  if (error) return <p role="alert" className="text-xs text-rose-700">The secure QR code could not be generated. Show support this ticket reference: {reference}</p>;
  return image
    ? <Image src={image} alt={`Secure entry QR code for ticket ${reference}`} width={224} height={224} unoptimized className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
    : <div aria-label="Generating ticket QR code" className="mx-auto flex h-56 w-56 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><LoaderCircle className="animate-spin" /></div>;
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: currency.trim(),
    maximumFractionDigits: 2
  }).format(amount / 100);
}

export default function TicketWallet({ orderId, initialToken }: { orderId: string; initialToken: string }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      setError('This ticket wallet link is invalid.');
      return;
    }

    let savedToken = '';
    try {
      savedToken = window.sessionStorage.getItem(`ticket-wallet:${orderId}`) || '';
    } catch {
      savedToken = '';
    }
    const token = /^[0-9a-f]{64}$/.test(initialToken) ? initialToken : savedToken;
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setError('This ticket wallet link is missing its private access code. Reopen the link from your payment confirmation.');
      return;
    }
    try {
      window.sessionStorage.setItem(`ticket-wallet:${orderId}`, token);
    } catch {
      // The return link remains available for the current page load.
    }
    window.history.replaceState(null, '', `/tickets/confirmation?order=${encodeURIComponent(orderId)}`);

    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadWallet = async () => {
      try {
        const response = await fetch('/api/ticketing/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: orderId, token }),
          cache: 'no-store'
        });
        const result = await response.json() as Wallet;
        if (!active) return;
        if (response.status === 202 && attempts < 20) {
          attempts += 1;
          setWaiting(true);
          setWallet(result);
          timer = setTimeout(loadWallet, 3000);
          return;
        }
        if (!response.ok) {
          setWallet(result);
          setError(result.error || result.message || 'Your ticket wallet could not be loaded.');
          setWaiting(false);
          return;
        }
        setWallet(result);
        setWaiting(false);
      } catch {
        if (active) {
          setError('The ticket service could not be reached. Refresh this page to try again.');
          setWaiting(false);
        }
      }
    };
    void loadWallet();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [initialToken, orderId]);

  return (
    <>
    <TicketingBrand />
    <main className="ticket-theme-page min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="ticket-theme-hero rounded-3xl border p-6 shadow-xl shadow-slate-900/5 sm:p-9">
          <p className="ticket-theme-accent text-[10px] font-black uppercase tracking-[0.2em]">ONLINE BAR ticket wallet</p>
          <h1 className="ticket-theme-text mt-2 text-3xl font-black sm:text-4xl">Your night starts here.</h1>
          <p className="ticket-theme-copy mt-3 text-sm leading-6">Keep each QR code private. Gate staff will scan it once at the event entrance.</p>
        </header>

        {waiting && (
          <section role="status" className="ticket-theme-accent-soft flex items-start gap-3 rounded-2xl border p-4">
            <LoaderCircle className="mt-0.5 shrink-0 animate-spin" size={18} />
            <div><p className="ticket-theme-text text-sm font-black">Confirming your payment</p><p className="ticket-theme-copy mt-1 text-xs leading-5">We are waiting for the verified payment callback. Keep this page open; no second payment is needed.</p></div>
          </section>
        )}

        {error && !waiting && (
          <section role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="mt-0.5 shrink-0 text-rose-700" size={18} />
            <div><p className="text-sm font-black text-slate-900">We could not open your ticket wallet</p><p className="mt-1 text-xs leading-5 text-slate-700">{error}</p>
              {wallet?.orderReference && <p className="mt-2 text-xs font-bold text-slate-900">Order reference: {wallet.orderReference}</p>}
            </div>
          </section>
        )}

        {wallet?.status === 'paid' && wallet.event && wallet.order && wallet.tickets?.length ? (
          <>
            <section className="ticket-theme-panel rounded-3xl border p-5 shadow-lg shadow-slate-900/5 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><ShieldCheck size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Payment verified · tickets issued</p>
                  <h2 className="ticket-theme-text mt-1 text-2xl font-black">{wallet.event.title}</h2>
                  <p className="ticket-theme-copy mt-2 flex items-center gap-2 text-xs"><CalendarDays size={14} />{formatDate(wallet.event.starts_at, wallet.event.timezone)}</p>
                  <p className="ticket-theme-copy mt-1 flex items-center gap-2 text-xs"><MapPin size={14} />{wallet.event.venue_name} · {wallet.event.city}</p>
                  <p className="ticket-theme-muted mt-3 text-[10px]">Order {wallet.order.reference} · {formatPrice(wallet.order.totalMinor, wallet.order.currency)}</p>
                </div>
              </div>
            </section>

            {wallet.tickets.map((ticket, index) => (
              <article key={ticket.reference} className="ticket-theme-panel rounded-3xl border p-5 text-center shadow-lg shadow-slate-900/5 sm:p-7">
                <span className="ticket-theme-accent-soft mx-auto flex h-11 w-11 items-center justify-center rounded-xl border"><Ticket size={20} /></span>
                <p className="ticket-theme-accent mt-3 text-[10px] font-black uppercase tracking-[0.18em]">Ticket {index + 1} of {wallet.tickets?.length ?? 0}</p>
                <h3 className="ticket-theme-text mt-1 text-xl font-black">{ticket.ticketName}</h3>
                <p className="ticket-theme-copy mt-1 text-xs">{ticket.attendeeName || 'Guest'} · {ticket.reference}</p>
                <div className="my-5"><TicketQr credential={ticket.credential} reference={ticket.reference} /></div>
                <p className="ticket-theme-copy text-[10px] leading-5">Present this QR at the gate. Each ticket admits one guest and is valid for one scan only. Do not share this screen or QR image.</p>
              </article>
            ))}
          </>
        ) : null}

        <Link href="/tickets" className="ticket-theme-panel inline-flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold transition hover:border-orange-300">
          Browse more events
        </Link>
      </div>
    </main>
    </>
  );
}
