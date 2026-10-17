'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, LoaderCircle, MapPin, ShieldCheck, Ticket } from 'lucide-react';
import QRCode from 'qrcode';

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

  if (error) return <p role="alert" className="text-xs text-rose-300">The secure QR code could not be generated. Show support this ticket reference: {reference}</p>;
  return image
    ? <Image src={image} alt={`Secure entry QR code for ticket ${reference}`} width={224} height={224} unoptimized className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
    : <div aria-label="Generating ticket QR code" className="mx-auto flex h-56 w-56 items-center justify-center rounded-xl bg-white/5 text-orange-200"><LoaderCircle className="animate-spin" /></div>;
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
    <main className="min-h-screen bg-[#0d0a12] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl border border-orange-300/20 bg-gradient-to-br from-[#39172a] via-[#261329] to-[#15101d] p-6 sm:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-200">ONLINE BAR ticket wallet</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Your night starts here.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Keep each QR code private. Gate staff will scan it once at the event entrance.</p>
        </header>

        {waiting && (
          <section role="status" className="flex items-start gap-3 rounded-2xl border border-orange-300/20 bg-orange-950/25 p-4">
            <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-orange-200" size={18} />
            <div><p className="text-sm font-black text-orange-100">Confirming your payment</p><p className="mt-1 text-xs leading-5 text-orange-50/70">We are waiting for the verified payment callback. Keep this page open; no second payment is needed.</p></div>
          </section>
        )}

        {error && !waiting && (
          <section role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300/20 bg-rose-950/25 p-4">
            <AlertCircle className="mt-0.5 shrink-0 text-rose-200" size={18} />
            <div><p className="text-sm font-black text-rose-100">We could not open your ticket wallet</p><p className="mt-1 text-xs leading-5 text-rose-50/70">{error}</p>
              {wallet?.orderReference && <p className="mt-2 text-xs font-bold text-white">Order reference: {wallet.orderReference}</p>}
            </div>
          </section>
        )}

        {wallet?.status === 'paid' && wallet.event && wallet.order && wallet.tickets?.length ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-[#17121e] p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-300/10 p-2 text-emerald-200"><ShieldCheck size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Payment verified · tickets issued</p>
                  <h2 className="mt-1 text-2xl font-black">{wallet.event.title}</h2>
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-300"><CalendarDays size={14} />{formatDate(wallet.event.starts_at, wallet.event.timezone)}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-slate-300"><MapPin size={14} />{wallet.event.venue_name} · {wallet.event.city}</p>
                  <p className="mt-3 text-[10px] text-slate-500">Order {wallet.order.reference} · {formatPrice(wallet.order.totalMinor, wallet.order.currency)}</p>
                </div>
              </div>
            </section>

            {wallet.tickets.map((ticket, index) => (
              <article key={ticket.reference} className="rounded-3xl border border-orange-300/15 bg-[#17121e] p-5 text-center shadow-xl shadow-black/20 sm:p-7">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-orange-300/20 bg-orange-300/10 text-orange-200"><Ticket size={20} /></span>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-orange-200">Ticket {index + 1} of {wallet.tickets?.length ?? 0}</p>
                <h3 className="mt-1 text-xl font-black">{ticket.ticketName}</h3>
                <p className="mt-1 text-xs text-slate-400">{ticket.attendeeName || 'Guest'} · {ticket.reference}</p>
                <div className="my-5"><TicketQr credential={ticket.credential} reference={ticket.reference} /></div>
                <p className="text-[10px] leading-5 text-slate-500">Present this QR at the gate. Each ticket admits one guest and is valid for one scan only. Do not share this screen or QR image.</p>
              </article>
            ))}
          </>
        ) : null}

        <Link href="/tickets" className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:border-orange-300/40 hover:text-white">
          Browse more events
        </Link>
      </div>
    </main>
  );
}
