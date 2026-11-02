'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { marketSupabase } from '@/lib/marketSupabaseClient';

type EligibleLocation = {
  id: string;
  business_name: string;
  business_type: string;
  county: string;
  town: string;
};

type Business = {
  id: string;
  business_name: string;
  business_type: string;
};

type Location = {
  id: string;
  business_name: string;
  trading_name: string | null;
  business_type: string;
  status: string;
  accepting_orders: boolean;
  county: string;
  town: string;
  address: string;
  phone: string;
  orders_last_7_days: number;
};

type BusinessResponse = {
  business?: Business | null;
  eligibleLocations?: EligibleLocation[];
  locations?: Location[];
  error?: string;
};

export default function MerchantBusinessPage() {
  const [token, setToken] = useState('');
  const [business, setBusiness] = useState<Business | null>(null);
  const [eligibleLocations, setEligibleLocations] = useState<EligibleLocation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [onboardingUrl, setOnboardingUrl] = useState('');

  const loadBusiness = useCallback(async (accessToken: string) => {
    const response = await fetch('/api/merchant/business/branches', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });
    const result = await response.json() as BusinessResponse;
    if (!response.ok) throw new Error(result.error || 'Could not load your business locations.');
    setBusiness(result.business || null);
    setEligibleLocations(result.eligibleLocations || []);
    setLocations(result.locations || []);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        if (!marketSupabase) throw new Error('Merchant sign-in is not configured.');
        const { data: { session }, error: sessionError } = await marketSupabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) {
          if (active) setError('Sign in with the verified email used for your approved merchant location.');
          return;
        }
        if (active) setToken(session.access_token);
        await loadBusiness(session.access_token);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your business locations.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [loadBusiness]);

  async function registerBusiness(applicationId: string) {
    if (!token) return;
    setWorkingId(applicationId);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/merchant/business/branches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', applicationId })
      });
      const result = await response.json() as BusinessResponse;
      if (!response.ok) throw new Error(result.error || 'Could not register the business account.');
      await loadBusiness(token);
      setMessage('Business account created. Your approved location is now the primary branch.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register the business account.');
    } finally {
      setWorkingId('');
    }
  }

  async function addLocation() {
    if (!token) return;
    setWorkingId('new-location');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/merchant/business/branches', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite-branch' })
      });
      const result = await response.json() as { onboardingUrl?: string; error?: string };
      if (!response.ok || !result.onboardingUrl) throw new Error(result.error || 'Could not create a branch onboarding link.');
      setOnboardingUrl(`${window.location.origin}${result.onboardingUrl}`);
      setMessage('Secure link created. Complete the branch application and compliance documents before it can receive orders.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a branch onboarding link.');
    } finally {
      setWorkingId('');
    }
  }

  async function setAvailability(location: Location) {
    if (!token) return;
    setWorkingId(location.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/merchant/business/branches', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: location.id,
          acceptingOrders: !location.accepting_orders
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Location availability could not be updated.');
      await loadBusiness(token);
      setMessage(`${location.trading_name || location.business_name} is now ${location.accepting_orders ? 'paused' : 'accepting orders'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Location availability could not be updated.');
    } finally {
      setWorkingId('');
    }
  }

  async function copyOnboardingLink() {
    try {
      await navigator.clipboard.writeText(onboardingUrl);
      setMessage('Branch onboarding link copied.');
    } catch {
      setError('Copy was blocked by the browser. Select and copy the branch onboarding link.');
    }
  }

  async function signOut() {
    if (!marketSupabase) return;
    const { error: signOutError } = await marketSupabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    setToken('');
    setBusiness(null);
    setLocations([]);
    setError('You are signed out. Sign in to manage business locations.');
  }

  return (
    <main className="min-h-screen bg-[#080c0b] px-4 py-8 text-white sm:px-7">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Merchant business account</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{business?.business_name || 'Manage your locations'}</h1>
            <p className="mt-2 text-sm text-white/60">One verified owner account for multiple independently reviewed branches.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/merchant/dashboard" className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/5">Merchant Studio</Link>
            {token && <button onClick={signOut} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/5">Sign out</button>}
          </div>
        </header>

        {loading && <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">Loading verified business access…</section>}
        {!loading && !token && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-white/75">{error}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/merchant/portal/login" className="inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-black text-[#08100c]">Sign in</Link>
              <Link href="/merchant/portal/register" className="inline-flex rounded-xl border border-white/15 px-5 py-3 font-bold">Create seller account</Link>
            </div>
          </section>
        )}

        {!loading && token && !business && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-7">
            <h2 className="text-xl font-black">Set up the owner account</h2>
            <p className="text-sm leading-6 text-white/60">Use a verified sign-in whose email matches an already-approved merchant application. The selected location becomes the first branch.</p>
            {eligibleLocations.length ? eligibleLocations.map(location => (
              <article key={location.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
                <div>
                  <h3 className="font-bold">{location.business_name}</h3>
                  <p className="mt-1 text-xs text-white/55">{location.business_type.replace(/_/g, ' ')} · {location.town}, {location.county}</p>
                </div>
                <button
                  disabled={Boolean(workingId)}
                  onClick={() => registerBusiness(location.id)}
                  className="rounded-lg bg-emerald-400 px-4 py-3 text-sm font-black text-[#08100c] disabled:opacity-50"
                >
                  {workingId === location.id ? 'Setting up…' : 'Use as primary location'}
                </button>
              </article>
            )) : (
              <div className="rounded-xl border border-dashed border-white/20 p-5 text-sm leading-6 text-white/60">
                {error || 'No approved location matches your verified email yet. Finish merchant onboarding and wait for approval first.'}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/merchant/portal/login" className="font-bold text-emerald-300 underline">Check account</Link>
                  <Link href="/merchant/onboarding" className="font-bold text-emerald-300 underline">Apply for a location</Link>
                </div>
              </div>
            )}
          </section>
        )}

        {!loading && business && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-5">
              <div>
                <h2 className="font-black">Locations and onboarding</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">Every new branch submits its own address, goods, opening hours, and required licences. OnBar reviews it before it can go live.</p>
              </div>
              <button
                onClick={addLocation}
                disabled={Boolean(workingId)}
                className="rounded-xl bg-emerald-400 px-5 py-3 font-black text-[#08100c] disabled:opacity-50"
              >
                {workingId === 'new-location' ? 'Creating link…' : '+ Add location'}
              </button>
              {onboardingUrl && (
                <div className="w-full space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-bold text-white/70">Single-use branch application link · expires in 7 days</p>
                  <div className="flex flex-wrap gap-2">
                    <input readOnly value={onboardingUrl} aria-label="Branch onboarding link" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70" />
                    <button onClick={copyOnboardingLink} className="rounded-lg border border-white/15 px-4 py-2 text-xs font-bold">Copy link</button>
                    <a href={onboardingUrl} className="rounded-lg border border-white/15 px-4 py-2 text-xs font-bold">Open form</a>
                  </div>
                </div>
              )}
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Locations</p>
                <p className="mt-2 text-3xl font-black">{locations.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Live and accepting</p>
                <p className="mt-2 text-3xl font-black">{locations.filter(location => location.status === 'approved' && location.accepting_orders).length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-white/45">Orders · 7 days</p>
                <p className="mt-2 text-3xl font-black">{locations.reduce((sum, location) => sum + location.orders_last_7_days, 0)}</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-black">Your branches</h2>
              {locations.map(location => {
                const name = location.trading_name || location.business_name;
                const approved = location.status === 'approved';
                return (
                  <article key={location.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black">{name}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${approved ? 'border-emerald-300/50 text-emerald-300' : 'border-amber-300/50 text-amber-200'}`}>
                          {location.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs capitalize text-white/50">{location.business_type.replace(/_/g, ' ')} · {location.town}, {location.county}</p>
                      <p className="mt-2 text-xs text-white/60">{location.orders_last_7_days} orders in the last 7 days{location.phone ? ` · ${location.phone}` : ''}</p>
                    </div>
                    <button
                      disabled={!approved || workingId === location.id}
                      onClick={() => setAvailability(location)}
                      className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                      title={approved ? undefined : 'Location must be approved before changing order availability'}
                    >
                      {workingId === location.id ? 'Saving…' : location.accepting_orders ? 'Pause orders' : 'Resume orders'}
                    </button>
                  </article>
                );
              })}
            </section>
          </>
        )}

        {error && token && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-300/30 bg-emerald-300/5 p-4 text-sm text-emerald-100">{message}</p>}

        <p className="text-xs leading-5 text-white/40">Branch access is based on your verified owner account. Do not share your owner sign-in. Branch manager PINs and per-employee roles are not enabled in this version.</p>
      </div>
    </main>
  );
}
