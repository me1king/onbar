'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Ticket } from 'lucide-react';
import { defaultTicketTheme, ticketThemes, type TicketThemeId } from '@/lib/ticketing/theme';

type Props = {
  eventId: string;
  ticketTypeId: string;
  minPerOrder: number;
  maxPerOrder: number;
  remaining: number;
  priceMinor: number;
  feeMinor: number;
  currency: string;
};

function randomHexToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: currency.trim(),
    maximumFractionDigits: 2
  }).format(amount / 100);
}

export default function TicketCheckoutButton({
  eventId,
  ticketTypeId,
  minPerOrder,
  maxPerOrder,
  remaining,
  priceMinor,
  feeMinor,
  currency
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailTheme, setEmailTheme] = useState<TicketThemeId>(defaultTicketTheme);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promotionCode, setPromotionCode] = useState('');
  const [promotionDiscount, setPromotionDiscount] = useState(0);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoMessage, setPromoMessage] = useState('');
  const [quantity, setQuantity] = useState(minPerOrder);
  const keys = useRef<{ idempotencyKey: string; accessToken: string } | null>(null);
  const maximum = Math.min(20, maxPerOrder, remaining);

  async function beginCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    keys.current ??= { idempotencyKey: randomHexToken(), accessToken: randomHexToken() };

    try {
      const response = await fetch('/api/ticketing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          ticketTypeId,
          quantity,
          promotionCode,
          name,
          email,
          phone,
          emailTheme,
          whatsappConsent,
          idempotencyKey: keys.current.idempotencyKey,
          accessToken: keys.current.accessToken
        })
      });
      const result = await response.json() as { authorizationUrl?: string; error?: string; orderReference?: string; orderId?: string };
      if (!response.ok || !result.authorizationUrl) {
        const orderReference = result.orderReference ? ` Order reference: ${result.orderReference}.` : '';
        setError(`${result.error || 'Checkout could not be started. Please try again.'}${orderReference}`);
        if (response.status === 409 || response.status === 400) keys.current = null;
        return;
      }

      if (result.orderId) {
        try {
          window.sessionStorage.setItem(`ticket-wallet:${result.orderId}`, keys.current.accessToken);
        } catch {
          // The ticket wallet link carries the one-time access token as well.
        }
      }
      window.location.assign(result.authorizationUrl);
    } catch {
      setError('The checkout service could not be reached. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  async function applyPromotion() {
    setPromoBusy(true);
    setPromoMessage('');
    setError('');
    try {
      const response = await fetch('/api/ticketing/promotions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ticketTypeId, quantity, code: promoInput })
      });
      const result = await response.json() as { code?: string; discountMinor?: number; error?: string };
      if (!response.ok || !result.code || !Number.isSafeInteger(result.discountMinor)) {
        throw new Error(result.error || 'Promo code could not be validated.');
      }
      setPromotionCode(result.code);
      setPromotionDiscount(result.discountMinor || 0);
      keys.current = null;
      setPromoMessage(`${result.code} applied. Discount: ${formatPrice(result.discountMinor || 0, currency)}.`);
    } catch (cause) {
      setPromotionCode('');
      setPromotionDiscount(0);
      setPromoMessage(cause instanceof Error ? cause.message : 'Promo code could not be validated.');
    } finally {
      setPromoBusy(false);
    }
  }

  if (maximum < minPerOrder) {
    return <span className="ticket-theme-muted text-[10px] font-semibold">Not enough tickets remain for the minimum order</span>;
  }

  return (
    <div className="w-full sm:w-auto">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="ticket-theme-accent-strong inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-black transition"
        >
          <Ticket size={14} /> Buy tickets
        </button>
      ) : (
        <form onSubmit={beginCheckout} className="ticket-theme-panel grid w-full gap-2 rounded-xl border p-3 shadow-lg shadow-slate-900/5 sm:w-[19rem]">
          <label className="ticket-theme-copy grid gap-1 text-[10px] font-bold">
            Name
            <input
              autoComplete="name"
              maxLength={160}
              required
              value={name}
              onChange={event => { setName(event.target.value); keys.current = null; }}
              className="ticket-theme-input min-h-10 rounded-lg border px-3 text-xs outline-none"
            />
          </label>
          <label className="ticket-theme-copy grid gap-1 text-[10px] font-bold">
            WhatsApp number
            <input
              autoComplete="tel"
              type="tel"
              inputMode="tel"
              maxLength={20}
              pattern="(?:\+254[17][0-9]{8}|0[17][0-9]{8}|[17][0-9]{8})"
              placeholder="0712345678 or +254712345678"
              required
              value={phone}
              onChange={event => { setPhone(event.target.value); keys.current = null; }}
              className="ticket-theme-input min-h-10 rounded-lg border px-3 text-xs outline-none"
            />
            <span className="ticket-theme-muted font-normal">Kenyan local numbers are converted to +254 automatically.</span>
          </label>
          <label className="ticket-theme-copy flex items-start gap-2 text-[10px] leading-4">
            <input
              type="checkbox"
              required
              checked={whatsappConsent}
              onChange={event => { setWhatsappConsent(event.target.checked); keys.current = null; }}
              className="ticket-theme-checkbox mt-0.5"
            />
            <span>Send my ticket wallet link to this number by WhatsApp after payment is confirmed.</span>
          </label>
          <label className="ticket-theme-copy grid gap-1 text-[10px] font-bold">
            Buyer email for payment
            <input
              autoComplete="email"
              type="email"
              maxLength={320}
              required
              value={email}
              onChange={event => { setEmail(event.target.value); keys.current = null; }}
              className="ticket-theme-input min-h-10 rounded-lg border px-3 text-xs outline-none"
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className="ticket-theme-copy text-[10px] font-bold">Ticket email color</legend>
            <p className="ticket-theme-muted text-[9px] leading-4">Choose how your ticket email and attached PDF tickets look.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ticketThemes.map(theme => (
                <label key={theme.id} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2 text-[9px] font-bold transition focus-within:ring-2 focus-within:ring-[var(--ticket-accent)] ${emailTheme === theme.id ? 'ticket-theme-accent-soft border-[var(--ticket-accent)]' : 'border-slate-200'}`}>
                  <input
                    type="radio"
                    name={`ticket-email-theme-${eventId}-${ticketTypeId}`}
                    value={theme.id}
                    checked={emailTheme === theme.id}
                    onChange={() => {
                      setEmailTheme(theme.id);
                      keys.current = null;
                    }}
                    className="sr-only"
                  />
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border border-slate-400 ${theme.swatch}`} aria-hidden="true" />
                  <span>{theme.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="ticket-theme-copy grid gap-1 text-[10px] font-bold">
            Quantity
            <select
              value={quantity}
              onChange={event => {
                setQuantity(Number(event.target.value));
                setPromotionCode('');
                setPromotionDiscount(0);
                setPromoMessage('');
                keys.current = null;
              }}
              className="ticket-theme-input min-h-10 rounded-lg border px-3 text-xs outline-none"
            >
              {Array.from({ length: maximum - minPerOrder + 1 }, (_, index) => minPerOrder + index).map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-2">
            <label className="ticket-theme-copy grid gap-1 text-[10px] font-bold">
              Promo code (optional)
              <span className="flex gap-2">
                <input
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={40}
                  value={promoInput}
                  onChange={event => {
                    setPromoInput(event.target.value.toUpperCase());
                    setPromotionCode('');
                    setPromotionDiscount(0);
                    setPromoMessage('');
                    keys.current = null;
                  }}
                  className="ticket-theme-input min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-xs outline-none"
                  placeholder="Enter code"
                />
                <button type="button" disabled={promoBusy || !promoInput.trim()} onClick={() => void applyPromotion()} className="min-h-10 rounded-lg border border-slate-300 px-3 text-[10px] font-bold disabled:opacity-50">
                  {promoBusy ? 'Checking…' : 'Apply'}
                </button>
              </span>
            </label>
            {promoMessage && <p role={promotionCode ? 'status' : 'alert'} className={`text-[10px] leading-4 ${promotionCode ? 'text-emerald-700' : 'text-rose-700'}`}>{promoMessage}</p>}
          </div>
          <div className="ticket-theme-copy text-[10px]">
            {promotionDiscount > 0 && <p>Promo discount: −{formatPrice(promotionDiscount, currency)}</p>}
            <p className="font-bold">Total: {formatPrice(Math.max(0, (priceMinor + feeMinor) * quantity - promotionDiscount), currency)} · includes service fee</p>
          </div>
          {error && <p role="alert" className="text-[10px] leading-4 text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="ticket-theme-accent-strong inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black disabled:opacity-60">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}
              {busy ? 'Preparing…' : priceMinor + feeMinor === 0 ? 'Get free tickets' : 'Continue to payment'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setIsOpen(false); keys.current = null; }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700">
              Cancel
            </button>
          </div>
          <p className="ticket-theme-muted text-[9px] leading-4">Paid tickets use Paystack checkout. Tickets appear here after server-side payment verification.</p>
        </form>
      )}
    </div>
  );
}
