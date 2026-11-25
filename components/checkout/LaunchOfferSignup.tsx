'use client';

import * as React from 'react';
import { CalendarDays, CheckCircle2, Gift, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  orderEmail?: string | null;
  phone?: string | null;
  deliveryArea?: string | null;
};

type Offer = {
  enabled: boolean;
  launchAt: string;
};

function formatLaunchTime(value: string) {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Africa/Nairobi'
  });
  const time = new Intl.DateTimeFormat('en-KE', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi'
  }).format(new Date(value));
  const launchDate = dateFormatter.format(new Date(value));
  const today = dateFormatter.format(new Date());
  const tomorrow = dateFormatter.format(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (launchDate === today) return `today at ${time}`;
  if (launchDate === tomorrow) return `tomorrow at ${time}`;
  const date = new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Africa/Nairobi'
  }).format(new Date(value));
  return `${date} at ${time}`;
}

export default function LaunchOfferSignup({ orderEmail, phone, deliveryArea }: Props) {
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [county, setCounty] = React.useState('');
  const [city, setCity] = React.useState('');
  const [area, setArea] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (orderEmail) setEmail(current => current || orderEmail);
  }, [orderEmail]);

  React.useEffect(() => {
    if (deliveryArea) setArea(current => current || deliveryArea);
  }, [deliveryArea]);

  React.useEffect(() => {
    let active = true;
    fetch('/api/checkout-launch-offer', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as { enabled?: boolean; launchAt?: string };
        if (!response.ok || typeof result.enabled !== 'boolean' || typeof result.launchAt !== 'string') {
          throw new Error('The launch announcement could not be loaded.');
        }
        if (active) setOffer({ enabled: result.enabled, launchAt: result.launchAt });
      })
      .catch(loadError => {
        console.error('[CheckoutLaunchOffer] Could not load the checkout announcement:', loadError);
        if (active) setLoadError(true);
      });
    return () => { active = false; };
  }, []);

  const joinLaunchList = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      if (sessionResult?.error) throw sessionResult.error;
      const token = sessionResult?.data.session?.access_token;
      const response = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'waitlist',
          email,
          phone: phone || '',
          country: 'Kenya',
          county,
          city,
          area,
          notificationConsent: true,
          emailUpdatesConsent: true,
          source: 'checkout-launch-offer'
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Your launch signup could not be saved.');
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your launch signup could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <p role="status" className="mb-8 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-600">The launch offer is temporarily unavailable. Your order is not affected.</p>;
  }
  if (!offer?.enabled) return null;

  return (
    <section aria-labelledby="launch-offer-title" className="mb-8 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-left shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><Gift size={22} /></span>
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-800"><CalendarDays size={14} /> Official launch</p>
            <h2 id="launch-offer-title" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
              We officially launch {formatLaunchTime(offer.launchAt)} (EAT)
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Join the launch list with your email and service area. Sign in or create an account with that email, and your next eligible paid order will include a mystery gift at no extra charge.
            </p>
          </div>
        </div>

        {submitted ? (
          <div role="status" className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
            <p><strong>You’re on the launch list.</strong> We’ll send updates to {email}. Use this email when you sign in or create your account to claim the mystery gift on your next eligible paid order.</p>
          </div>
        ) : (
          <form onSubmit={event => void joinLaunchList(event)} className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">Email address
                <Input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1 h-11 rounded-xl bg-white" />
              </label>
              <label className="text-xs font-bold text-slate-700">County
                <Input required maxLength={80} value={county} onChange={event => setCounty(event.target.value)} placeholder="Nairobi" className="mt-1 h-11 rounded-xl bg-white" />
              </label>
              <label className="text-xs font-bold text-slate-700">Town / city
                <Input required maxLength={100} value={city} onChange={event => setCity(event.target.value)} placeholder="Nairobi" className="mt-1 h-11 rounded-xl bg-white" />
              </label>
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">Estate / area
                <Input required maxLength={100} value={area} onChange={event => setArea(event.target.value)} placeholder="Westlands" className="mt-1 h-11 rounded-xl bg-white" />
              </label>
            </div>

            <label className="flex items-start gap-2 text-xs leading-5 text-slate-600">
              <input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-600" />
              <span><MapPin size={13} className="mr-1 inline" />Use my town and area to plan launch coverage, and email me launch and gift updates. I can unsubscribe at any time. No precise GPS location is collected.</span>
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}
            <Button type="submit" disabled={saving || !consent} className="h-11 w-full rounded-xl font-black sm:w-auto sm:px-7">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gift className="mr-2 h-4 w-4" />}
              {saving ? 'Joining…' : 'Join launch list & get my gift'}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
