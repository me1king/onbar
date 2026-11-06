'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  DEFAULT_LOCATION_WAITLIST_CONTENT,
  LOCATION_AREAS,
  type ConfiguredLocationArea,
  type LocationArea,
  type LocationWaitlistContent
} from '@/lib/locationCatalog';
import { supabase } from '@/lib/supabaseClient';

interface SavedLocation extends Omit<LocationArea, 'latitude' | 'longitude'> {
  serviceAvailable: boolean;
  source: 'browser_geolocation' | 'manual';
}

const DECISION_KEY = 'onbar_location_prompt_answered';
const LOCATION_KEY = 'onbar_area_preference';
const PROMPT_SHOWN_KEY = 'onbar_location_prompt_shown';
const EXACT_LOCATION_SHARE_EVENT = 'onbar:share-exact-location';
const OPEN_LOCATION_PREFERENCES_EVENT = 'onbar:open-location-preferences';

function getPreciseBrowserLocation(): Promise<{ latitude: number; longitude: number; accuracyM: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Precise location is not supported by this browser. Turn off the optional map-location setting to join without GPS.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const accuracyM = position.coords.accuracy;
        if (!Number.isFinite(accuracyM) || accuracyM <= 0 || accuracyM > 250) {
          reject(new Error('GPS accuracy is too low for the optional demand map. Try again outdoors or turn off the optional map-location setting.'));
          return;
        }
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM
        });
      },
      error => reject(new Error(error.code === error.PERMISSION_DENIED
        ? 'Location permission was declined. Turn off the optional map-location setting to join without GPS.'
        : error.code === error.TIMEOUT
          ? 'Precise location timed out. Try again or turn off the optional map-location setting.'
          : 'We could not detect a reliable GPS location. Turn off the optional map-location setting to join without GPS.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

function createAnonymousId() {
  const existing = localStorage.getItem('ob_anonymous_id');
  if (existing) return existing;
  const id = `anon-${crypto.randomUUID()}`;
  localStorage.setItem('ob_anonymous_id', id);
  return id;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: number | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
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
  const [customCounty, setCustomCounty] = useState('');
  const [customAreaMode, setCustomAreaMode] = useState(false);
  const [locationAreas, setLocationAreas] = useState<ConfiguredLocationArea[]>(LOCATION_AREAS);
  const [waitlistContent, setWaitlistContent] = useState<LocationWaitlistContent>(DEFAULT_LOCATION_WAITLIST_CONTENT);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notificationConsent, setNotificationConsent] = useState(false);
  const [preciseLocationConsent, setPreciseLocationConsent] = useState(false);
  const [exactLocationShareConsent, setExactLocationShareConsent] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const counties = useMemo(() => [...new Set(locationAreas.map((item) => item.county))].sort(), [locationAreas]);
  const areasForCounty = useMemo(
    () => locationAreas.filter((item) => item.county === county),
    [locationAreas, county]
  );
  const manualSelection = useRef({ county, area });

  useEffect(() => {
    manualSelection.current = { county, area };
  }, [county, area]);

  useEffect(() => {
    if (!ready || location || isOpen || suppressLauncher) return;
    if (localStorage.getItem(DECISION_KEY) || localStorage.getItem(PROMPT_SHOWN_KEY)) return;

    let activeSeconds = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      activeSeconds += 1;
      if (activeSeconds < 60) return;
      window.clearInterval(timer);
      localStorage.setItem(PROMPT_SHOWN_KEY, 'yes');
      setIsOpen(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, location, isOpen, suppressLauncher]);

  useEffect(() => {
    const openPreferences = () => {
      setStatus('');
      setManualMode(Boolean(location));
      setIsOpen(true);
    };
    window.addEventListener(OPEN_LOCATION_PREFERENCES_EVENT, openPreferences);
    return () => window.removeEventListener(OPEN_LOCATION_PREFERENCES_EVENT, openPreferences);
  }, [location]);

  useEffect(() => {
    let active = true;
    fetch('/api/location/catalog', { cache: 'no-store', signal: AbortSignal.timeout(6000) })
      .then(async (response) => {
        const result = await response.json() as {
          config?: { areas?: ConfiguredLocationArea[]; waitlist?: LocationWaitlistContent };
          error?: string;
        };
        if (!response.ok) {
          console.error('[LocationOnboarding] Could not load configured locations:', result.error || response.status);
          return;
        }
        if (!Array.isArray(result.config?.areas)) {
          console.error('[LocationOnboarding] The location catalog response was invalid.');
          return;
        }
        if (!active) return;
        setLocationAreas(result.config.areas);
        if (result.config.waitlist) setWaitlistContent(result.config.waitlist);
        const selected = manualSelection.current;
        const countiesFromSettings = [...new Set(result.config.areas.map((item) => item.county))].sort();
        if (!countiesFromSettings.includes(selected.county)) {
          setCounty(countiesFromSettings[0] || '');
          const firstArea = result.config.areas.find((item) => item.county === countiesFromSettings[0]);
          setCity(firstArea?.city || countiesFromSettings[0] || '');
          setArea(firstArea?.area || '');
          setCustomAreaMode(!firstArea);
        } else if (!result.config.areas.some((item) => item.county === selected.county && item.area === selected.area)) {
          const firstArea = result.config.areas.find((item) => item.county === selected.county);
          setCity(firstArea?.city || selected.county);
          setArea(firstArea?.area || '');
          setCustomAreaMode(!firstArea);
        }
      })
      .catch((error) => console.error('[LocationOnboarding] Could not load configured locations:', error));
    try {
      const saved = localStorage.getItem(LOCATION_KEY);
      if (saved) {
        const restored = JSON.parse(saved) as SavedLocation;
        manualSelection.current = { county: restored.county, area: restored.area };
        setLocation(restored);
        setCounty(restored.county);
        setCity(restored.city);
        setArea(restored.area);
        setCustomAreaMode(!LOCATION_AREAS.some(item => item.county === restored.county && item.area === restored.area));
      }
    } catch (error) {
      console.error('[LocationOnboarding] Could not restore the saved area preference:', error);
    } finally {
      setReady(true);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.access_token) return;
      void (async () => {
      const anonymousId = localStorage.getItem('ob_anonymous_id');
      if (!anonymousId || !localStorage.getItem(LOCATION_KEY)) return;
      try {
        const response = await fetch('/api/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ action: 'link', anonymousId })
        });
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          console.error('[LocationOnboarding] Could not link opted-in location to account:', result.error);
        }
      } catch (error) {
        console.error('[LocationOnboarding] Could not link opted-in location to account:', error);
      }
      })().catch(error => {
        console.error('[LocationOnboarding] Could not read the opted-in location:', error);
      });
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
      localStorage.setItem(PROMPT_SHOWN_KEY, 'yes');
      setLocation(saved);
      setWaitlistSubmitted(false);
      setEmail('');
      setPhone('');
      setNotificationConsent(false);
      setPreciseLocationConsent(false);
      setExactLocationShareConsent(false);
      setStatus(serviceAvailable
        ? `Saved ${areaDetails.area}, ${areaDetails.city} on this device. We’ll use it to check local availability. Admin demand reporting will update after the location database migration is installed.`
        : `Saved ${areaDetails.area}, ${areaDetails.city} on this device. We’re not serving this area yet. Admin demand reporting and the launch waitlist require the location database migration.`);
      setManualMode(false);
      return true;
    };

    try {
      const anonymousId = createAnonymousId();
      const session = supabase
        ? (await withTimeout(supabase.auth.getSession(), 5000, 'Your sign-in check timed out. Please try saving your area again.')).data.session
        : null;
      const response = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        signal: AbortSignal.timeout(10000),
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
          return persistLocalOnly();
        }
        throw new Error(result.error || 'Your area preference could not be saved.');
      }

      const saved: SavedLocation = { ...areaDetails, serviceAvailable, source };
      localStorage.setItem(LOCATION_KEY, JSON.stringify(saved));
      localStorage.setItem(DECISION_KEY, 'yes');
      localStorage.setItem(PROMPT_SHOWN_KEY, 'yes');
      setLocation(saved);
      setWaitlistSubmitted(false);
      setEmail('');
      setPhone('');
      setNotificationConsent(false);
      setPreciseLocationConsent(false);
      setExactLocationShareConsent(false);
      setStatus(serviceAvailable
        ? `Saved ${areaDetails.area}, ${areaDetails.city}. We’ll use your area to check local availability.`
        : `Saved ${areaDetails.area}, ${areaDetails.city}. We’re not serving this area yet; you can join the launch waitlist below.`);
      setManualMode(false);
      return true;
    } catch (error) {
      console.error('[LocationOnboarding] Could not save an opted-in area:', error);
      setStatus(error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
        ? 'Saving your area timed out. Check your saved location before retrying.'
        : error instanceof Error ? error.message : 'Your area preference could not be saved.');
      return false;
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
        const accuracyM = position.coords.accuracy;
        if (exactLocationShareConsent && (!Number.isFinite(accuracyM) || accuracyM <= 0 || accuracyM > 100)) {
          setStatus(`Your device reports GPS accuracy of ${Math.round(accuracyM || 0)} m. We did not share a pin; try again outdoors or choose an area manually.`);
          setManualMode(true);
          return;
        }
        const response = await fetch('/api/location/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
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
        const areaSaved = await saveArea({
          country: result.country || 'Kenya',
          county: result.county || 'Unspecified',
          city: result.city || 'Other Kenya',
          area: result.area || 'Please tell us your area'
        }, result.serviceAvailable === true, 'browser_geolocation');
        if (areaSaved && exactLocationShareConsent) {
          window.dispatchEvent(new CustomEvent(EXACT_LOCATION_SHARE_EVENT, {
            detail: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyM,
              city: result.city || 'Other Kenya',
              area: result.area || 'Please tell us your area'
            }
          }));
        }
      } catch (error) {
        console.error('[LocationOnboarding] Could not resolve approximate location:', error);
        setStatus(error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'Location lookup timed out. Please enter your area manually.'
          : error instanceof Error ? error.message : 'We could not resolve your area. Please enter it manually.');
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
    }, {
      enableHighAccuracy: exactLocationShareConsent,
      timeout: exactLocationShareConsent ? 20000 : 12000,
      maximumAge: exactLocationShareConsent ? 0 : 300000
    });
  };

  const saveManualArea = async () => {
    const selectedCounty = county === '__other_county__' ? customCounty.trim() : county;
    const areaMatch = !customAreaMode
      ? areasForCounty.find((item) => item.area === area)
      : undefined;
    const areaName = customAreaMode ? area.trim() : areaMatch?.area || area.trim();
    const selectedCity = areaMatch?.city || city.trim() || selectedCounty;
    if (!selectedCounty || !selectedCity || !areaName) {
      setStatus('Choose a county and enter your area before saving.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/location/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ city: selectedCity, county: areaMatch?.county || selectedCounty, area: areaName })
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
        county: result.county || selectedCounty,
        city: result.city || selectedCity,
        area: result.area || areaName
      }, result.serviceAvailable === true, 'manual');
    } catch (error) {
      console.error('[LocationOnboarding] Could not check manually selected area:', error);
      setStatus(error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
        ? 'Area check timed out. Please try again or choose another area.'
        : error instanceof Error ? error.message : 'We could not check delivery coverage.');
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
      const preciseLocation = preciseLocationConsent ? await getPreciseBrowserLocation() : null;
      const source = new URLSearchParams(window.location.search).get('utm_source')
        || sessionStorage.getItem('ob_attribution_source')
        || 'direct';
      const session = supabase
        ? (await withTimeout(supabase.auth.getSession(), 5000, 'Your sign-in check timed out. Please retry the waitlist signup.')).data.session
        : null;
      const response = await fetch('/api/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          action: 'waitlist',
          country: location.country,
          county: location.county,
          city: location.city,
          area: location.area,
          email,
          phone,
          notificationConsent,
          preciseLocationConsent,
          preciseLatitude: preciseLocation?.latitude,
          preciseLongitude: preciseLocation?.longitude,
          preciseAccuracyM: preciseLocation?.accuracyM,
          source
        })
      });
      const result = await response.json() as { error?: string; preciseLocationCaptured?: boolean };
      if (!response.ok) throw new Error(result.error || 'We could not add you to the area waitlist.');
      setWaitlistSubmitted(true);
      setStatus(result.preciseLocationCaptured
        ? `You’re on the ${location.city} launch list. Your rounded location was added to the aggregated demand map.`
        : `You’re on the ${location.city} launch list. We’ll contact you when service is available.`);
      setEmail('');
      setPhone('');
      setNotificationConsent(false);
      setPreciseLocationConsent(false);
    } catch (error) {
      console.error('[LocationOnboarding] Could not submit market waitlist signup:', error);
      setStatus(error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
        ? 'Waitlist signup timed out. Check your email before retrying.'
        : error instanceof Error ? error.message : 'We could not add you to the area waitlist.');
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
        const session = supabase
          ? (await withTimeout(supabase.auth.getSession(), 5000, 'Your sign-in check timed out. Please retry removing your area.')).data.session
          : null;
        const response = await fetch('/api/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
          },
          signal: AbortSignal.timeout(10000),
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
      setPreciseLocationConsent(false);
      setIsOpen(false);
    } catch (error) {
      console.error('[LocationOnboarding] Could not withdraw the saved area:', error);
      setStatus(error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
        ? 'Area removal timed out. Your server-side preference may still be saved; retry removal.'
        : error instanceof Error ? error.message : 'Your saved area could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const closePrompt = () => {
    localStorage.setItem(DECISION_KEY, 'declined');
    localStorage.setItem(PROMPT_SHOWN_KEY, 'yes');
    setIsOpen(false);
    setManualMode(false);
  };

  if (!ready) return null;

  return (
    <>
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
                  <p className="font-bold">Find what’s available near you.</p>
                  <p className="mt-1">Use GPS or choose your area. We only save the approximate area for delivery coverage.</p>
                </div>
                <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <summary className="cursor-pointer font-semibold">Optional: share a live GPS pin</summary>
                  <label className="mt-2 flex items-start gap-2 leading-relaxed">
                    <input
                      type="checkbox"
                      checked={exactLocationShareConsent}
                      onChange={(event) => setExactLocationShareConsent(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Share an anonymous pin with authorized operations admins. It stops when you close this tab or after 2 minutes without updates. Area selection works without it.</span>
                  </label>
                </details>
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
                <p className="text-sm leading-relaxed text-slate-600">Choose your county, then an area. If it is not listed, add it and we’ll include it in launch planning.</p>
                <label className="block text-xs font-bold text-slate-700">
                  County
                  <select
                    value={county === '__other_county__' || !counties.includes(county) ? '__other_county__' : county}
                    onChange={(event) => {
                      const nextCounty = event.target.value;
                      if (nextCounty === '__other_county__') {
                        setCounty(nextCounty);
                        setCustomCounty('');
                        setCity('');
                        setArea('');
                        setCustomAreaMode(true);
                        return;
                      }
                      const firstArea = locationAreas.find((item) => item.county === nextCounty);
                      setCounty(nextCounty);
                      setCustomCounty('');
                      setCity(firstArea?.city || nextCounty);
                      setArea(firstArea?.area || '');
                      setCustomAreaMode(!firstArea);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3"
                  >
                    {counties.map((item) => <option key={item} value={item}>{item} County</option>)}
                    <option value="__other_county__">My county is not listed</option>
                  </select>
                </label>
                {county === '__other_county__' && (
                  <label className="block text-xs font-bold text-slate-700">
                    County name
                    <input value={customCounty} onChange={(event) => setCustomCounty(event.target.value)} required maxLength={80} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                  </label>
                )}
                {county !== '__other_county__' && areasForCounty.length > 0 && (
                  <label className="block text-xs font-bold text-slate-700">
                    Area
                    <select
                      value={customAreaMode ? '__custom_area__' : area}
                      onChange={(event) => {
                        if (event.target.value === '__custom_area__') {
                          setArea('');
                          setCustomAreaMode(true);
                          setCity(areasForCounty[0]?.city || county);
                          return;
                        }
                        const selected = areasForCounty.find((item) => item.area === event.target.value);
                        setArea(selected?.area || '');
                        setCity(selected?.city || county);
                        setCustomAreaMode(false);
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3"
                    >
                      {areasForCounty.map((item) => <option key={`${item.city}-${item.area}`} value={item.area}>{item.area}</option>)}
                      <option value="__custom_area__">My area is not listed</option>
                    </select>
                  </label>
                )}
                {customAreaMode && (
                  <>
                    <label className="block text-xs font-bold text-slate-700">
                      Town or city
                      <input value={city} onChange={(event) => setCity(event.target.value)} required maxLength={100} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                    </label>
                    <label className="block text-xs font-bold text-slate-700">
                      Area or neighborhood
                      <input value={area} onChange={(event) => setArea(event.target.value)} required maxLength={100} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" />
                    </label>
                  </>
                )}
                <button type="button" disabled={busy || !area.trim() || (county === '__other_county__' && !customCounty.trim())} onClick={saveManualArea} className="w-full rounded-2xl bg-primary px-5 py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60">
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
                    const countyExists = locationAreas.some((item) => item.county === location.county);
                    setCounty(countyExists ? location.county : '__other_county__');
                    setCustomCounty(countyExists ? '' : location.county);
                    setArea(location.area);
                    setCustomAreaMode(!locationAreas.some((item) => item.county === location.county && item.area === location.area));
                    setManualMode(true);
                  }} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    Change or enter area manually
                  </button>
                )}
              </>
            )}

            {location && !manualMode && !location.serviceAvailable && !waitlistSubmitted && (
              <form onSubmit={submitWaitlist} className="mt-5 space-y-3">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{waitlistContent.heading}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{waitlistContent.message}</p>
                {(waitlistContent.rewardTitle || waitlistContent.rewardDetails) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
                    {waitlistContent.rewardTitle && <p className="font-bold">{waitlistContent.rewardTitle}</p>}
                    {waitlistContent.rewardDetails && <p className={waitlistContent.rewardTitle ? 'mt-1' : ''}>{waitlistContent.rewardDetails}</p>}
                  </div>
                )}
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
                <label className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-slate-700">
                  <input type="checkbox" checked={preciseLocationConsent} onChange={(event) => setPreciseLocationConsent(event.target.checked)} className="mt-0.5" />
                  <span><b>Optional: improve the launch-demand map.</b> If enabled, your browser shares a GPS reading accurate to 250 m or better. We round it to a roughly 100 m grid, store no exact GPS point, and show only anonymous grouped counts to admins. Your name and contact details are not shown on the map. You can leave this off.</span>
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
