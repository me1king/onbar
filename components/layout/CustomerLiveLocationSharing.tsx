'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Crosshair, MapPin, Radio, ShieldCheck, X } from 'lucide-react';
import { LOCATION_AREAS, approximateArea, type LocationArea } from '@/lib/locationCatalog';

type SharedLocation = {
  latitude: number;
  longitude: number;
  city: string;
  area: string;
  source: 'gps' | 'manual';
};

type Props = { suppressLauncher?: boolean };

const SHARE_ID_KEY = 'ob_live_location_share_id';
const HEARTBEAT_MS = 30_000;

function getShareId() {
  const saved = sessionStorage.getItem(SHARE_ID_KEY);
  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
    return saved;
  }
  const id = crypto.randomUUID();
  sessionStorage.setItem(SHARE_ID_KEY, id);
  return id;
}

function activityForPath(pathname: string) {
  if (pathname.startsWith('/checkout/success') || pathname.startsWith('/track')) return 'ordered';
  if (pathname.startsWith('/checkout')) return 'checkout';
  return 'browsing';
}

export default function CustomerLiveLocationSharing({ suppressLauncher = false }: Props) {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [location, setLocation] = useState<SharedLocation | null>(null);
  const locationRef = useRef<SharedLocation | null>(null);
  const sharingRef = useRef(false);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const saveLocation = useCallback(async (nextLocation: SharedLocation) => {
    const response = await fetch('/api/customer/location-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        action: 'share',
        shareId: getShareId(),
        ...nextLocation,
        activity: activityForPath(pathnameRef.current)
      })
    });
    const result = await response.json() as { error?: string; area?: { city: string; area: string } };
    if (!response.ok) throw new Error(result.error || 'Your location could not be shared.');
    const savedLocation = { ...nextLocation, city: result.area?.city || nextLocation.city, area: result.area?.area || nextLocation.area };
    locationRef.current = savedLocation;
    setLocation(savedLocation);
    setStatus(`Sharing an approximate ${savedLocation.city} · ${savedLocation.area} location with operations.`);
  }, []);

  const stopSharing = useCallback(async () => {
    if (!sharingRef.current) return;
    setBusy(true);
    try {
      const response = await fetch('/api/customer/location-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'stop', shareId: getShareId() })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Sharing could not be stopped.');
      sharingRef.current = false;
      setSharing(false);
      locationRef.current = null;
      setLocation(null);
      setStatus('Location sharing is off.');
    } catch (error) {
      console.error('[CustomerLiveLocationSharing] Could not stop sharing:', error);
      setStatus(error instanceof Error ? error.message : 'Sharing could not be stopped. Please retry.');
    } finally {
      setBusy(false);
    }
  }, []);

  const startSharing = useCallback(async (nextLocation: SharedLocation) => {
    setBusy(true);
    setStatus('');
    try {
      await saveLocation(nextLocation);
      sharingRef.current = true;
      setSharing(true);
    } catch (error) {
      console.error('[CustomerLiveLocationSharing] Could not start sharing:', error);
      setStatus(error instanceof Error ? error.message : 'Your location could not be shared.');
    } finally {
      setBusy(false);
    }
  }, [saveLocation]);

  const shareGps = () => {
    if (!navigator.geolocation) {
      setStatus('GPS is not available in this browser. Choose your area instead.');
      return;
    }
    setBusy(true);
    setStatus('Finding an approximate location…');
    navigator.geolocation.getCurrentPosition(
      position => {
        const nearest = approximateArea(position.coords.latitude, position.coords.longitude);
        void startSharing({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          city: nearest?.city || 'Other',
          area: nearest?.area || 'Other',
          source: 'gps'
        });
      },
      error => {
        setBusy(false);
        setStatus(error.code === error.PERMISSION_DENIED
          ? 'Location permission was declined. Choose your area to share instead.'
          : 'We could not get your location. Choose your area to share instead.');
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 30_000 }
    );
  };

  const shareArea = () => {
    const selected = LOCATION_AREAS.find(area => `${area.city}|${area.area}` === selectedArea);
    if (!selected) {
      setStatus('Choose an area before sharing.');
      return;
    }
    void startSharing({
      latitude: selected.latitude,
      longitude: selected.longitude,
      city: selected.city,
      area: selected.area,
      source: 'manual'
    });
  };

  useEffect(() => {
    if (!sharing) return;
    let watchId: number | null = null;
    if (locationRef.current?.source === 'gps' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        position => {
          const nearest = approximateArea(position.coords.latitude, position.coords.longitude);
          locationRef.current = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            city: nearest?.city || 'Other',
            area: nearest?.area || 'Other',
            source: 'gps'
          };
        },
        error => {
          setStatus(error.code === error.PERMISSION_DENIED
            ? 'GPS access was withdrawn. Stop sharing or choose an area.'
            : 'GPS could not refresh. Your last approximate location will expire if it cannot be updated.');
        },
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 }
      );
    }
    const interval = window.setInterval(() => {
      if (!locationRef.current || !sharingRef.current) return;
      void saveLocation(locationRef.current).catch(error => {
        console.error('[CustomerLiveLocationSharing] Location heartbeat failed:', error);
        setStatus(error instanceof Error ? error.message : 'Your location update failed.');
      });
    }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(interval);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [sharing, saveLocation]);

  useEffect(() => {
    const stopOnPageClose = () => {
      if (!sharingRef.current || !navigator.sendBeacon) return;
      const body = new Blob([JSON.stringify({ action: 'stop', shareId: getShareId() })], { type: 'application/json' });
      navigator.sendBeacon('/api/customer/location-share', body);
    };
    window.addEventListener('pagehide', stopOnPageClose);
    return () => window.removeEventListener('pagehide', stopOnPageClose);
  }, []);

  if (suppressLauncher) return null;

  return (
    <div className="fixed bottom-5 left-4 z-[70] sm:left-6">
      {open && (
        <section aria-label="Live location sharing" className="mb-3 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Optional live sharing</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Help operations see demand</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close location sharing panel" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Only an anonymous location rounded to about 100 m is shown. Sharing lasts while this app is open; it expires automatically after 2 minutes without an update.</p>
          </div>

          {!sharing ? (
            <div className="mt-3 space-y-3">
              <button type="button" onClick={shareGps} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60">
                <Crosshair size={16} /> {busy ? 'Finding location…' : 'Share approximate GPS'}
              </button>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400"><span className="h-px flex-1 bg-slate-200" />Or choose an area<span className="h-px flex-1 bg-slate-200" /></div>
              <label className="block text-xs font-bold text-slate-700">
                Area
                <select value={selectedArea} onChange={event => setSelectedArea(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <option value="">Choose a city and area</option>
                  {LOCATION_AREAS.map((area: LocationArea) => (
                    <option key={`${area.city}|${area.area}`} value={`${area.city}|${area.area}`}>{area.city} · {area.area}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={shareArea} disabled={busy || !selectedArea} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-800 disabled:opacity-50">
                <MapPin size={15} /> Share selected area
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-800"><Radio size={15} className="animate-pulse" /> Sharing is on</div>
              <p className="mt-1 text-xs text-emerald-900">{location?.city} · {location?.area} · {location?.source === 'gps' ? 'approximate GPS' : 'selected area'}</p>
              <button type="button" onClick={() => void stopSharing()} disabled={busy} className="mt-3 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black uppercase text-emerald-900 disabled:opacity-60">
                {busy ? 'Stopping…' : 'Stop sharing'}
              </button>
            </div>
          )}
          {status && <p role="status" className="mt-3 text-xs leading-relaxed text-slate-600">{status}</p>}
        </section>
      )}
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={sharing ? 'Manage live location sharing' : 'Share your location with operations'} className={`flex items-center gap-2 rounded-full px-4 py-3 text-xs font-black uppercase tracking-wide shadow-lg transition ${sharing ? 'bg-emerald-700 text-white' : 'bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
        {sharing ? <Radio size={16} className="animate-pulse" /> : <MapPin size={16} />}
        {sharing ? 'Location shared' : 'Share location'}
      </button>
    </div>
  );
}
