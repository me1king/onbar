'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const MerchantPickupMap = dynamic(() => import('@/components/admin/MerchantPickupMap'), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 sm:h-[390px]" />
});

type SearchResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
};

type Props = {
  latitude: string;
  longitude: string;
  onCoordinatesChange: (latitude: string, longitude: string) => void;
  locationDescription: string;
  onLocationDescriptionChange: (description: string) => void;
  initialAddress: string;
};

export default function MerchantPickupLocationEditor({
  latitude,
  longitude,
  onCoordinatesChange,
  locationDescription,
  onLocationDescriptionChange,
  initialAddress
}: Props) {
  const [searchText, setSearchText] = useState(initialAddress);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const lastSearchAt = useRef(0);

  const position = useMemo<[number, number] | null>(() => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    return latitude.trim() && longitude.trim()
      && Number.isFinite(lat) && lat >= -90 && lat <= 90
      && Number.isFinite(lng) && lng >= -180 && lng <= 180
      ? [lat, lng]
      : null;
  }, [latitude, longitude]);

  const setPosition = (lat: number, lng: number) => {
    onCoordinatesChange(lat.toFixed(6), lng.toFixed(6));
    setMessage('Pin set. Check the map and adjust it to the shop entrance before saving.');
  };

  const searchPlaces = async () => {
    const query = [searchText.trim(), locationDescription.trim()]
      .filter(Boolean)
      .join(', ');
    if (query.length < 3) {
      setMessage('Enter the shop name, street/area, or a nearby landmark to search.');
      return;
    }
    const wait = 1100 - (Date.now() - lastSearchAt.current);
    if (wait > 0) {
      setMessage('Please wait a moment before searching again.');
      return;
    }

    lastSearchAt.current = Date.now();
    setSearching(true);
    setMessage('');
    setResults([]);
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '5');
      url.searchParams.set('countrycodes', 'ke');
      url.searchParams.set('q', query);
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error('Map search is temporarily unavailable. Try again or place the pin manually.');
      const found = await response.json() as SearchResult[];
      if (!Array.isArray(found) || found.length === 0) {
        setMessage('No matching places found. Try adding the town/county, or zoom the map and tap the shop location.');
        return;
      }
      setResults(found);
      setMessage('Choose the matching place below, then fine-tune the pin on the map.');
    } catch (searchError) {
      setMessage(searchError instanceof Error ? searchError.message : 'Map search failed. You can still place the pin manually.');
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result: SearchResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setMessage('That map result did not have usable coordinates. Choose another result.');
      return;
    }
    onCoordinatesChange(lat.toFixed(6), lng.toFixed(6));
    setSearchText(result.display_name);
    setMessage('Place found. Verify the shop entrance on the map; the search result may identify only the street or building.');
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="text-xs font-semibold text-slate-700">
          Search shop, area, or nearby place
          <Input
            value={searchText}
            onChange={event => {
              setSearchText(event.target.value);
              setResults([]);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void searchPlaces();
              }
            }}
            placeholder="Shop name, street, estate, town"
            className="mt-1"
            maxLength={200}
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Nearest landmark or directions
          <Input
            value={locationDescription}
            onChange={event => {
              onLocationDescriptionChange(event.target.value);
              setResults([]);
            }}
            placeholder="e.g. opposite Ngumo Primary School, blue gate"
            className="mt-1"
            maxLength={300}
          />
        </label>
        <button
          type="button"
          onClick={() => void searchPlaces()}
          disabled={searching}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {searching ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Search size={15} className="mr-2" />}
          Find place
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Search uses OpenStreetMap. Only send the public shop address or landmark, not private customer details.
      </p>
      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Choose the right place</p>
          <div className="divide-y divide-slate-100">
            {results.map(result => (
              <button
                type="button"
                key={result.place_id}
                onClick={() => chooseResult(result)}
                className="flex w-full items-start gap-2 px-3 py-3 text-left text-xs text-slate-700 hover:bg-emerald-50"
              >
                <MapPin size={15} className="mt-0.5 shrink-0 text-rose-600" />
                <span>{result.display_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <MerchantPickupMap
        position={position}
        onSelect={(lat, lng) => setPosition(lat, lng)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Latitude
          <Input
            type="number"
            min="-90"
            max="90"
            step="any"
            value={latitude}
            onChange={event => onCoordinatesChange(event.target.value, longitude)}
            placeholder="Set by map pin"
            aria-label="Merchant latitude"
            className="mt-1"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          Longitude
          <Input
            type="number"
            min="-180"
            max="180"
            step="any"
            value={longitude}
            onChange={event => onCoordinatesChange(latitude, event.target.value)}
            placeholder="Set by map pin"
            aria-label="Merchant longitude"
            className="mt-1"
          />
        </label>
      </div>
      {message && <p role="status" className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-600">{message}</p>}
      <p className="text-[10px] text-slate-500">
        Map data © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Search results are approximate; verify the exact entrance before saving.
      </p>
    </div>
  );
}
