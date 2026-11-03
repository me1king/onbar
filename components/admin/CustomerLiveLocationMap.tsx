'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCcw, ShieldCheck, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getCartoVoyagerTileUrl } from '@/lib/cartoMaps';

type CustomerLocation = {
  id: string;
  visitorCode: string;
  latitude: number;
  longitude: number;
  city: string;
  area: string;
  activity: 'browsing' | 'checkout' | 'ordered';
  lastSeenAt: string;
};

type MapResult = {
  locations: CustomerLocation[];
  activeCount: number;
  refreshedAt: string;
  error?: string;
};

function FitCustomerLocations({ locations }: { locations: CustomerLocation[] }) {
  const map = useMap();
  const previousLocations = useRef('');
  useEffect(() => {
    const signature = locations.map(location => `${location.id}:${location.latitude}:${location.longitude}`).join('|');
    if (signature === previousLocations.current) return;
    previousLocations.current = signature;
    if (locations.length > 1) {
      map.fitBounds(locations.map(location => [location.latitude, location.longitude] as [number, number]), { padding: [40, 40], maxZoom: 13 });
    } else if (locations.length === 1) {
      map.setView([locations[0].latitude, locations[0].longitude], 13);
    }
  }, [locations, map]);
  return null;
}

function activityLabel(activity: CustomerLocation['activity']) {
  if (activity === 'checkout') return 'At checkout';
  if (activity === 'ordered') return 'Order placed';
  return 'Browsing';
}

function activityColor(activity: CustomerLocation['activity']) {
  if (activity === 'checkout') return '#f59e0b';
  if (activity === 'ordered') return '#2563eb';
  return '#059669';
}

function freshness(timestamp: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

export default function CustomerLiveLocationMap() {
  const [data, setData] = useState<MapResult>({ locations: [], activeCount: 0, refreshedAt: '' });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/customer-location-map', { cache: 'no-store' });
      const result = await response.json() as MapResult;
      if (!response.ok) throw new Error(result.error || 'Live customer locations could not be loaded.');
      setData(result);
    } catch (error) {
      console.error('[CustomerLiveLocationMap] Could not load locations:', error);
      setData(current => ({
        ...current,
        locations: [],
        activeCount: 0,
        error: error instanceof Error ? error.message : 'Live customer locations could not be loaded.'
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const center: [number, number] = data.locations.length
    ? [data.locations[0].latitude, data.locations[0].longitude]
    : [-1.286389, 36.817223];

  return (
    <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Customer app · explicit opt-in only</p>
          <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Live customer locations</h2>
          <p className="mt-1 text-xs text-slate-500">Anonymous pins are rounded to about 100 m and expire after 2 minutes without a heartbeat.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">
            <Users size={14} /> {data.activeCount} sharing
          </span>
          <button type="button" onClick={() => void refresh()} aria-label="Refresh live customer locations" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold uppercase text-slate-500">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Browsing</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Checkout</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Order placed</span>
      </div>

      {data.error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{data.error}</p>}

      <div className="relative mt-4 h-[360px] overflow-hidden rounded-xl border border-slate-200 sm:h-[440px]">
        <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={getCartoVoyagerTileUrl()}
          />
          <FitCustomerLocations locations={data.locations} />
          {data.locations.map(location => (
            <CircleMarker
              key={location.id}
              center={[location.latitude, location.longitude]}
              radius={9}
              pathOptions={{
                color: '#ffffff',
                weight: 3,
                fillColor: activityColor(location.activity),
                fillOpacity: 0.9
              }}
            >
              <Popup>
                <div className="min-w-[150px] p-1">
                  <p className="font-black text-slate-900">{location.visitorCode}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{location.city} · {location.area}</p>
                  <p className="mt-1 text-xs font-bold" style={{ color: activityColor(location.activity) }}>{activityLabel(location.activity)}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Updated {freshness(location.lastSeenAt)}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        {!data.locations.length && !data.error && (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
            <div className="flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" />
              <p className="text-xs font-semibold leading-relaxed text-slate-600">No customers are sharing right now. Customers must opt in from the storefront before a pin appears.</p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] font-semibold text-slate-400">
        {data.refreshedAt ? `Refreshed ${new Date(data.refreshedAt).toLocaleTimeString()}` : 'Waiting for live location data'} · This is separate from analytics and saved checkout addresses.
      </p>
    </Card>
  );
}
