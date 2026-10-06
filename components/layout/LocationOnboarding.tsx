'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { LOCATION_AREAS, type LocationArea } from '@/lib/locationCatalog';
import { supabase } from '@/lib/supabaseClient';

interface SavedLocation extends Omit<LocationArea, 'latitude' | 'longitude'> {
  serviceAvailable: boolean;
  source: 'browser_geolocation' | 'manual';
}

const DECISION_KEY = 'onbar_location_prompt_answered';
const LOCATION_KEY = 'onbar_area_preference';

function createAnonymousId() {
  const existing = localStorage.getItem('ob_anonymous_id');
  if (existing) return existing;
  const id = `anon-${crypto.randomUUID()}`;
  localStorage.setItem('ob_anonymous_id', id);
  return id;
}

export default function LocationOnboarding({ suppressLauncher = false }: { suppressLauncher?: boolean }) {
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [city, setCity] = useState('Nairobi');
  const [county, setCounty] = useState('Nairobi');
  const [area, setArea] = useState('Westlands');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notificationConsent, setNotificationConsent] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const cities = useMemo(() => [...new Set(LOCATION_AREAS.map((item) => item.city))], []);
  const areasForCity = useMemo(
    () => LOCATION_AREAS.filter((item) => item.city === city),
    [city]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCATION_KEY);
      if (saved) setLocation(JSON.parse(saved) as SavedLocation);
      if (!localStorage.getItem(DECISION_KEY)) setIsOpen(true);
    } catch (error) {
      console.error('[LocationOnboarding] Could not restore the saved area preference:', error);
      setIsOpen(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.access_token) return;
      const anonymousId = localStorage.getItem('ob_anonymous_id');
      if (!anonymousId || !localStorage.getItem(LOCATION_KEY)) return;
      try {
        const response = await fetch('/api/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ action: 'link', anonymousId })
        });
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          console.error('[LocationOnboarding] Could not link opted-in location to account:', result.error);
        }
      } catch (error) {
        console.error('[LocationOnboarding] Could not link opted-in location to account:', error);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const saveArea = async (
    areaDetails: Omit<LocationArea, 'latitude' | 'longitude'>,
    serviceAvailable: boolean,
    source: SavedLocation['source']
  ) => {
    setBusy(true);
    setStatus('');
    const persistLocalOnly = () => {
      const saved: SavedLocation = { ...areaDetails, serviceAvailable, source };
      localStorage.setItem(LOCATION_KEY, JSON.stringify(saved));
      localStorage.setItem(DECISION_KEY, 'yes');
      setLocation(saved);
      setWaitlistSubmitted(false);
      setEmail('');
      setPhone('');
      setNotificationConsent(false);
      setStatus(serviceAvailable
        ? `Saved ${areaDetails.area}, ${areaDetails.city} on this device. We’ll use it to check local availability. Admin demand reporting will update after the location database migration is installed.`
        : `Saved ${areaDetails.area}, ${areaDetails.city} on this device. We’re not serving this area yet. Admin demand reporting and the launch waitlist require the location database migration.`);
      setManualMode(false);
    };

    try {
      const anonymousId = createAnonymousId();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const response = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          action: 'save',
          anonymousId,
          country: areaDetails.country,
          county: areaDetails.county,
          city: areaDetails.city,
          area: areaDetails.area,
          source,
          locationConsent: true
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        const migrationMissing = /Area saving is not set up on this database|DEMAND_INTELLIGENCE_MIGRATION/i.test(result.error || '');
        if (migrationMissing) {
          persistLocalOnly();
          return;
        }
        throw new Error(result.error || 'Your area preference could not be saved.');
      }

      const saved: SavedLocation = { ...areaDetails, serviceAvailable, source };
      localStorage.setItem(LOCATION_KEY, JSON.stringify(saved));
      localStorage.setItem(DECISION_KEY, 'yes');
      setLocation(saved);
      setWaitlistSubmitted(false);
      setEmail('');
      setPhone('');
      setNotificationConsent(false);
      setStatus(serviceAvailable
        ? `Saved ${areaDetails.area}, ${areaDetails.city}. We’ll use your area to check local availability.`
        : `Saved ${areaDetails.area}, ${areaDetails.city}. We’re not serving this area yet; you can join the launch waitlist below.`);
      setManualMode(false);
    } catch (error) {
      console.error('[LocationOnboarding] Could not save an opted-in area:', error);
      setStatus(error instanceof Error ? error.message : 'Your area preference could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const requestLocation = () => {
    setStatus('');
    if (!navigator.geolocation) {
      setStatus('Location is not supported by this browser. You can enter an area manually instead.');
      setManualMode(true);
      return;
    }

    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch('/api/location/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: Math.round(position.coords.latitude * 100) / 100,
            longitude: Math.round(position.coords.longitude * 100) / 100
          })
        });
        const result = await response.json() as {
          error?: string;
          country?: string;
          county?: string;
          city?: string;
          area?: string;
          serviceAvailable?: boolean;
        };
        if (!response.ok) throw new Error(result.error || 'We could not check delivery coverage.');
        await saveArea({
          country: result.country || 'Kenya',
          county: result.county || 'Unspecified',
          city: result.city || 'Other Kenya',
          area: result.area || 'Please tell us your area'
        }, result.serviceAvailable === true, 'browser_geolocation');
      } catch (error) {
        console.error('[LocationOnboarding] Could not resolve approximate location:', error);
        setStatus(error instanceof Error ? error.message : 'We could not resolve your area. Please enter it manually.');
        setManualMode(true);
      } finally {
        setBusy(false);
      }
    }, (error) => {
      setBusy(false);
      if (error.code === error.PERMISSION_DENIED) {
        setStatus('Location permission was declined. You can still choose your area manually.');
      } else if (error.code === error.TIMEOUT) {
        setStatus('Location lookup timed out. Please try again or choose your area manually.');
      } else {
        setStatus('We could not detect your location. You can choose your area manually.');
      }
      setManualMode(true);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  };

  const saveManualArea = async () => {
    const areaMatch = areasForCity.find((item) => item.area === area);
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/location/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, county: areaMatch?.county || county, area: area.trim() })
      });
      const result = await response.json() as {
        error?: string;
        country?: string;
        county?: string;
        city?: string;
        area?: string;
        serviceAvailable?: boolean;
      };
      if (!response.ok) throw new Error(result.error || 'We could not check delivery coverage.');
      await saveArea({
        country: result.country || 'Kenya',
        county: result.county || county,
        city: result.city || city,
        area: result.area || area.trim()
      }, result.serviceAvailable === true, 'manual');
    } catch (error) {
      console.error('[LocationOnboarding] Could not check manually selected area:', error);
      setStatus(error instanceof Error ? error.message : 'We could not check delivery coverage.');
    } finally {
      setBusy(false);
    }
  };

  const submitWaitlist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!location || !notificationConsent) return;
    setBusy(true);
    setStatus('');
    try {
      const source = new URLSearchParams(window.location.search).get('utm_source')
        || sessionStorage.getItem('ob_attribution_source')
        || 'direct';
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const response = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          action: 'waitlist',
          country: location.country,
          county: location.county,
          city: location.city,
          area: location.area,
          email,
          phone,
          notificationConsent,
          source
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'We could not add you to the area waitlist.');
      setWaitlistSubmitted(true);
      setStatus(`You’re on the ${location.city} launch list. We’ll contact you when service is available.`);
      setEmail('');
      setPhone('');
      setNotificationConsent(false);
    } catch (error) {
      console.error('[LocationOnboarding] Could not submit market waitlist signup:', error);
      setStatus(error instanceof Error ? error.message : 'We could not add you to the area waitlist.');
    } finally {
      setBusy(false);
    }
  };

  const withdrawLocation = async () => {
    if (!location) return;
    setBusy(true);
    setStatus('');
    try {
      const anonymousId = localStorage.getItem('ob_anonymous_id');
      if (anonymousId) {
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const response = await fetch('/api/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ action: 'withdraw', anonymousId })
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Your saved area could not be removed.');
      }
      localStorage.removeItem(LOCATION_KEY);
      localStorage.setItem(DECISION_KEY, 'declined');
      setLocation(null);
      setWaitlistSubmitted(false);
      setNotificationConsent(false);
      setIsOpen(false);
    } catch (error) {
      console.error('[LocationOnboarding] Could not withdraw the saved area:', error);
      setStatus(error instanceof Error ? error.message : 'Your saved area could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const closePrompt = () => {
    localStorage.setItem(DECISION_KEY, 'declined');
    setIsOpen(false);
    setManualMode(false);
  };

  if (!ready) return null;

  return (
    <>
      {!suppressLauncher && location && !isOpen && (
        <button
          type="button"
          onClick={() => {
            setStatus('');
            setIsOpen(true);
          }}
          className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-3 z-[90] inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-lg backdrop-blur sm:bottom-6 sm:left-6"
          aria-label={`Change saved area, currently ${location.area}, ${location.city}`}
        >
          <MapPin size={14} className="text-primary" />
          {location.area}
        </button>
      )}

      {!suppressLauncher && !location && !isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] left-3 z-[90] inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-lg backdrop-blur sm:bottom-6 sm:left-6"
        >
          <MapPin size={14} className="text-primary" />
          Set your area
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[7000] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-onboarding-title"
            className="my-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Welcome to Onbar</p>
                <h2 id="location-onboarding-title" className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-950">
                  Discover what’s near you
                </h2>
              </div>
              <button type="button" onClick={closePrompt} aria-label="Close location prompt" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            {!location && !manualMode && (
              <>
                <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
                  <p className="font-bold">📍 Help us show what’s available in your area.</p>
                  <p className="mt-2">We use an approximate area to check delivery coverage and understand where Onbar should grow. We round your location before matching it to an area and never store the GPS coordinates.</p>
                </div>
                <div className="mt-6 grid gap-3">
                  <button type="button" disabled={busy} onClick={requestLocation} className="rounded-2xl bg-primary px-5 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60">
                    {busy ? 'Checking your area…' : 'Allow Location'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setManualMode(true)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    Choose area manually
                  </button>
                  <button type="button" disabled={busy} onClick={closePrompt} className="rounded-2xl px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">
                    Not now
                  </button>
                </div>
              </>
            )}

            {manualMode && (
              <div className="mt-6 space-y-4">
                <p className="text-sm leading-relaxed text-slate-600">Choose an area to check coverage. Your area is saved only after you confirm.</p>
                <label className="block text-xs font-bold text-slate-700">
                  City or town
                  <select
                    value={city}
                    onChange={(event) => {
                      const nextCity = event.target.value;
                      const nextArea = LOCATION_AREAS.find((item) => item.city === nextCity);
                      setCity(nextCity);
                      setCounty(nextArea?.county || 'Unspecified');
                      setArea(nextArea?.area || '');
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3"
                  >
                    {cities.map((item) => <option key={item} value={item}>{item}</option>)}
                    <option value="Other Kenya">Other Kenya</option>
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  County
                  <input value={county} onChange={(event) => setCounty(event.target.value)} maxLength={80} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Area
                  <input value={area} onChange={(event) => setArea(event.target.value)} required maxLength={100} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                </label>
                <button type="button" disabled={busy || !area.trim()} onClick={saveManualArea} className="w-full rounded-2xl bg-primary px-5 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60">
                  {busy ? 'Saving area…' : 'Save my area'}
                </button>
                {!location && <button type="button" onClick={closePrompt} className="w-full rounded-xl py-2 text-sm font-bold text-slate-500">Not now</button>}
              </div>
            )}

            {location && (
              <>
                <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Your saved area</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{location.city} · {location.area}</p>
                  <p className="text-xs text-slate-500">{location.county} County, {location.country}</p>
                  <p className={`mt-3 text-sm font-semibold ${location.serviceAvailable ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {location.serviceAvailable ? 'Delivery is currently available in this area.' : 'We’re not fully available here yet. Join the launch waitlist and we’ll let you know when we arrive.'}
                  </p>
                </div>
                {!manualMode && (
                  <button type="button" onClick={() => {
                    setCity(location.city);
                    setCounty(location.county);
                    setArea(location.area);
                    setManualMode(true);
                  }} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    Change or enter area manually
                  </button>
                )}
              </>
            )}

            {location && !manualMode && !location.serviceAvailable && !waitlistSubmitted && (
              <form onSubmit={submitWaitlist} className="mt-5 space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Get notified when Onbar launches here</h3>
                <label className="block text-xs font-bold text-slate-700">
                  Email
                  <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Phone (optional)
                  <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                </label>
                <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                  <input type="checkbox" checked={notificationConsent} onChange={(event) => setNotificationConsent(event.target.checked)} className="mt-0.5" />
                  I agree to be contacted about Onbar availability and launches in this area.
                </label>
                <button type="submit" disabled={busy || !notificationConsent} className="w-full rounded-2xl bg-slate-900 px-5 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50">
                  {busy ? 'Joining waitlist…' : 'Notify me'}
                </button>
              </form>
            )}

            {waitlistSubmitted && (
              <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                You’re on the list. Thanks for helping us plan where to launch next.
              </p>
            )}

            {status && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{status}</p>}

            {location && (
              <div className="mt-5 grid gap-2">
                <button type="button" disabled={busy} onClick={() => {
                  setManualMode(false);
                  setIsOpen(false);
                }} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  Done
                </button>
                <button type="button" disabled={busy} onClick={withdrawLocation} className="w-full rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 underline hover:text-red-700 disabled:opacity-60">
                  {busy ? 'Removing saved area…' : 'Remove my saved area'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
