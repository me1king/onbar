'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, LoaderCircle, Mail, MapPin, MessageCircle, ShieldCheck, Ticket } from 'lucide-react';
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
  event?: {
    title: string;
    starts_at: string;
    ends_at: string;
    doors_open_at: string | null;
    venue_name: string;
    venue_address: string;
    city: string;
    timezone: string;
    age_limit: number | null;
  };
  tickets?: WalletTicket[];
  emailDelivery?: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'not_configured';
  whatsappDelivery?: 'pending' | 'sending' | 'sent' | 'unknown';
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
    : <div aria-label="Generating ticket QR code" className="ticket-theme-accent-soft mx-auto flex h-56 w-56 items-center justify-center rounded-xl"><LoaderCircle className="animate-spin" /></div>;
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
  const [accessToken, setAccessToken] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState('');

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
    setAccessToken(token);
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
        if (response.status === 202 && attempts < 120) {
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

  async function sendTicketEmail() {
    if (!accessToken || emailSending) return;
    setEmailSending(true);
    setEmailError('');
    try {
      const response = await fetch('/api/ticketing/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderId, token: accessToken }),
        cache: 'no-store'
      });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error || 'Ticket email could not be sent. Please try again.');
      }
      if (result.status === 'sent' || result.status === 'already_sent') {
        setWallet(current => current ? { ...current, emailDelivery: 'sent' } : current);
      } else {
        setWallet(current => current ? { ...current, emailDelivery: 'sending' } : current);
      }
    } catch (sendError) {
      setEmailError(sendError instanceof Error ? sendError.message : 'Ticket email could not be sent. Please try again.');
    } finally {
      setEmailSending(false);
    }
  }

  async function sendTicketMessage() {
    if (!accessToken || messageSending) return;
    setMessageSending(true);
    setMessageError('');
    try {
      const response = await fetch('/api/ticketing/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderId, token: accessToken }),
        cache: 'no-store'
      });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error || 'Ticket link could not be sent by WhatsApp. Please try again.');
      }
      setWallet(current => current
        ? { ...current, whatsappDelivery: result.status === 'sent' || result.status === 'already_sent' ? 'sent' : 'sending' }
        : current);
    } catch (sendError) {
      setMessageError(sendError instanceof Error ? sendError.message : 'Ticket link could not be sent by WhatsApp. Please try again.');
    } finally {
      setMessageSending(false);
    }
  }

  const event = wallet?.event;
  const tickets = wallet?.tickets;
  const isPaymentFailed = wallet?.status === 'payment_failed';
  const isHalloweenEvent = /halloween/i.test(event?.title || '');

  return (
    <>
    <TicketingBrand />
    <main className="ticket-theme-page min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="ticket-theme-hero rounded-3xl border p-6 shadow-xl shadow-slate-900/5 sm:p-9">
          <p className="ticket-theme-accent text-[10px] font-black uppercase tracking-[0.2em]">Online Bar ticket wallet</p>
          <p className="ticket-theme-muted mt-1 text-[9px]">Your event tickets from Online Bar</p>
          <h1 className="ticket-theme-text mt-2 text-3xl font-black sm:text-4xl">Your night starts here.</h1>
          <p className="ticket-theme-copy mt-3 text-sm leading-6">Keep each QR code private. Gate staff will scan it once at the event entrance.</p>
        </header>

        {waiting && (
          <section role="status" className="ticket-theme-accent-soft flex items-start gap-3 rounded-2xl border p-4">
            <LoaderCircle className="mt-0.5 shrink-0 animate-spin" size={18} />
            <div><p className="ticket-theme-text text-sm font-black">Confirming your payment</p><p className="ticket-theme-copy mt-1 text-xs leading-5">{wallet?.message || 'We are waiting for the verified payment callback. Keep this page open; no second payment is needed.'}</p></div>
          </section>
        )}

        {error && !waiting && (
          <section role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="mt-0.5 shrink-0 text-rose-700" size={18} />
            <div><p className="text-sm font-black text-slate-900">{isPaymentFailed ? 'Payment failed 😞' : wallet?.status === 'pending_payment' ? 'Payment is not confirmed yet' : ['expired', 'cancelled'].includes(wallet?.status || '') ? 'Payment was not completed' : 'We could not open your ticket wallet'}</p><p className="mt-1 text-xs leading-5 text-slate-700">{error}</p>
              {wallet?.orderReference && <p className="mt-2 text-xs font-bold text-slate-900">Order reference: {wallet.orderReference}</p>}
            </div>
          </section>
        )}

        {wallet?.status === 'paid' && event && wallet.order && tickets?.length ? (
          <>
            <section role="status" className={`flex items-start gap-3 rounded-2xl border p-4 ${wallet.emailDelivery === 'sent' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <Mail className={`mt-0.5 shrink-0 ${wallet.emailDelivery === 'sent' ? 'text-emerald-700' : 'text-amber-700'}`} size={18} />
              <div>
                <p className="text-sm font-black text-slate-900">Payment confirmed! 🎉</p>
                <p className="mt-1 text-xs leading-5 text-slate-700">
                  {wallet.emailDelivery === 'sent'
                    ? 'Check your Gmail inbox (and spam or junk folder) for your ticket email with your QR code and event details.'
                    : wallet.emailDelivery === 'failed'
                      ? 'Your tickets are ready below, but the email has not been sent yet. Use “Send ticket email” below to try again.'
                      : wallet.emailDelivery === 'not_configured'
                        ? 'Your valid tickets are ready below, but email delivery is not configured right now. Keep this page open or save your QR codes, and contact support if you need an email copy.'
                        : wallet.emailDelivery === 'unknown'
                          ? 'Your valid tickets are ready below, but we cannot confirm the email status right now. Check your inbox and spam folder, or try sending the email again below.'
                          : 'Your payment is confirmed. We are preparing the ticket email with your QR codes and event details; it should be sent shortly. Your valid tickets are already available below.'}
                </p>
              </div>
            </section>

            {isHalloweenEvent && (
              <section className="overflow-hidden rounded-3xl border border-orange-200 bg-slate-950 p-3 shadow-xl shadow-orange-950/10 sm:p-5">
                <Image
                  src="/images/halloween-private-house-party-ticket.png"
                  alt="Halloween private house party invitation"
                  width={724}
                  height={683}
                  priority
                  className="h-auto w-full rounded-2xl"
                />
                <p className="px-2 pb-1 pt-3 text-center text-xs font-semibold leading-5 text-orange-50">
                  Your issued QR ticket below is your valid entry pass. Show its QR code at the door.
                </p>
              </section>
            )}

            <section className="ticket-theme-panel rounded-3xl border p-5 shadow-lg shadow-slate-900/5 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><ShieldCheck size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Payment verified · tickets issued</p>
                  <h2 className="ticket-theme-text mt-1 text-2xl font-black">{event.title}</h2>
                  <p className="ticket-theme-copy mt-2 flex items-center gap-2 text-xs"><CalendarDays size={14} />{formatDate(event.starts_at, event.timezone)}</p>
                  <p className="ticket-theme-copy mt-1 flex items-center gap-2 text-xs"><MapPin size={14} />{event.venue_name} · {event.city}</p>
                  {event.venue_address && <p className="ticket-theme-copy mt-1 text-xs">{event.venue_address}</p>}
                  {event.doors_open_at && <p className="ticket-theme-copy mt-1 text-xs">Doors open: {formatDate(event.doors_open_at, event.timezone)}</p>}
                  {event.age_limit !== null && <p className="ticket-theme-copy mt-1 text-xs">{event.age_limit}+ event</p>}
                  <p className="ticket-theme-muted mt-3 text-[10px]">Order {wallet.order.reference} · {formatPrice(wallet.order.totalMinor, wallet.order.currency)}</p>
                </div>
              </div>
            </section>

            <section className="ticket-theme-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
              <div className="flex items-center gap-3">
                <Mail className="ticket-theme-accent shrink-0" size={18} />
                <div>
                  <p className="ticket-theme-text text-sm font-bold">
                    {wallet.emailDelivery === 'sent'
                      ? 'Ticket email sent'
                      : wallet.emailDelivery === 'failed'
                        ? 'Ticket email needs retry'
                        : wallet.emailDelivery === 'not_configured'
                          ? 'Email delivery is not configured'
                          : wallet.emailDelivery === 'unknown'
                            ? 'Ticket email status unavailable'
                            : 'Ticket email is being prepared'}
                  </p>
                  <p className="ticket-theme-copy mt-1 text-xs">
                    {wallet.emailDelivery === 'sent'
                      ? 'Your ticket QR codes were sent to the checkout email. Check your inbox and spam or junk folder.'
                      : wallet.emailDelivery === 'failed'
                        ? 'Payment succeeded, but email delivery failed. Tap below to retry sending your tickets.'
                        : wallet.emailDelivery === 'not_configured'
                          ? 'Your paid tickets and QR codes are ready on this page. Email delivery will be available once the email service is configured.'
                          : wallet.emailDelivery === 'unknown'
                            ? 'Your tickets are ready on this page, but the current email delivery status could not be checked.'
                            : 'Payment confirmed. We are preparing a copy of your tickets for the checkout email address; it should arrive shortly.'}
                  </p>
                </div>
              </div>
              {wallet.emailDelivery !== 'sent' && wallet.emailDelivery !== 'not_configured' && (
                <button type="button" onClick={sendTicketEmail} disabled={emailSending || !accessToken}
                  className="ticket-theme-accent-soft inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60">
                  {emailSending ? <LoaderCircle size={15} className="animate-spin" /> : <Mail size={15} />}
                  {emailSending ? 'Sending…' : 'Send ticket email'}
                </button>
              )}
              {emailError && <p role="alert" className="w-full text-xs text-rose-700">{emailError}</p>}
            </section>

            <section className="ticket-theme-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="ticket-theme-accent shrink-0" size={18} />
                <div>
                  <p className="ticket-theme-text text-sm font-bold">
                    {wallet.whatsappDelivery === 'sent' ? 'Ticket link sent on WhatsApp' : 'WhatsApp ticket link'}
                  </p>
                  <p className="ticket-theme-copy mt-1 text-xs">
                    {wallet.whatsappDelivery === 'sent'
                      ? 'A secure link to your ticket wallet was sent to your checkout number.'
                      : 'Send or retry the secure wallet link to your checkout WhatsApp number.'}
                  </p>
                </div>
              </div>
              {wallet.whatsappDelivery !== 'sent' && (
                <button type="button" onClick={sendTicketMessage} disabled={messageSending || !accessToken}
                  className="ticket-theme-accent-soft inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-60">
                  {messageSending ? <LoaderCircle size={15} className="animate-spin" /> : <MessageCircle size={15} />}
                  {messageSending ? 'Sending…' : 'Send WhatsApp link'}
                </button>
              )}
              {messageError && <p role="alert" className="w-full text-xs text-rose-700">{messageError}</p>}
            </section>

            {tickets.map((ticket, index) => (
              <article key={ticket.reference} className="ticket-theme-panel overflow-hidden rounded-3xl border shadow-lg shadow-slate-900/5">
                <div className="ticket-theme-hero border-b p-5 sm:p-7">
                  <p className="ticket-theme-accent text-[10px] font-black uppercase tracking-[0.2em]">Online Bar · Admit one · Ticket {index + 1} / {tickets.length}</p>
                  <h3 className="ticket-theme-text mt-2 text-2xl font-black sm:text-3xl">{event.title}</h3>
                  <p className="ticket-theme-copy mt-2 text-xs">{formatDate(event.starts_at, event.timezone)}</p>
                </div>
                <div className="grid sm:grid-cols-[1fr_240px]">
                  <div className="p-5 sm:p-7">
                    <span className="ticket-theme-accent-soft inline-flex h-10 w-10 items-center justify-center rounded-xl border"><Ticket size={19} /></span>
                    <p className="ticket-theme-accent mt-4 text-[10px] font-black uppercase tracking-[0.18em]">Admission</p>
                    <p className="ticket-theme-text mt-1 text-lg font-black">{ticket.ticketName}</p>
                    <p className="ticket-theme-copy mt-2 text-sm">{ticket.attendeeName || 'Guest'}</p>
                    <p className="ticket-theme-muted mt-5 text-[10px] font-bold uppercase tracking-wider">Ticket reference</p>
                    <p className="ticket-theme-text mt-1 font-mono text-sm font-bold">{ticket.reference}</p>
                    <p className="ticket-theme-copy mt-5 text-[10px] leading-5">Each ticket admits one guest. Present the QR code at the entrance; it is valid for one scan only. Keep it private.</p>
                  </div>
                  <div className="ticket-theme-panel border-t border-dashed p-5 text-center sm:border-l sm:border-t-0">
                    <p className="ticket-theme-text text-xs font-black uppercase tracking-[0.2em]">Scan at entry</p>
                    <div className="my-4"><TicketQr credential={ticket.credential} reference={ticket.reference} /></div>
                    <p className="ticket-theme-muted text-[10px]">ONE GUEST · ONE ENTRY</p>
                  </div>
                </div>
              </article>
            ))}
          </>
        ) : null}

        <Link href="/tickets" className="ticket-theme-panel ticket-theme-hover-accent inline-flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold transition">
          Browse more events
        </Link>
        <section className="ticket-theme-panel rounded-2xl border p-4" aria-label="Ticket customer support">
          <p className="ticket-theme-text text-sm font-black">Need help with your ticket?</p>
          <p className="ticket-theme-copy mt-1 text-xs leading-5">
            Send our customer support team a WhatsApp message on 0769 345 599
            {wallet?.orderReference ? ` and include order reference ${wallet.orderReference}.` : '.'}
          </p>
          <a
            href={`https://wa.me/254769345599?text=${encodeURIComponent(`Hello, I need help with ticket order${wallet?.orderReference ? ` ${wallet.orderReference}` : ''}.`)}`}
            target="_blank"
            rel="noreferrer"
            className="ticket-theme-accent mt-2 inline-flex min-h-9 items-center text-xs font-black underline"
          >
            Message ticket support on WhatsApp
          </a>
        </section>
      </div>
    </main>
    </>
  );
}
