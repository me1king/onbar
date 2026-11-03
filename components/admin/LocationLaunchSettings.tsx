'use client';

import { useEffect, useState } from 'react';
import { MapPin, Plus, Save, Trash2 } from 'lucide-react';
import {
  DEFAULT_LOCATION_CATALOG,
  type LocationCatalogConfig,
  type LocationArea,
  type LocationWaitlistContent
} from '@/lib/locationCatalog';

export default function LocationLaunchSettings() {
  const [config, setConfig] = useState<LocationCatalogConfig>(DEFAULT_LOCATION_CATALOG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/location/catalog', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as { config?: LocationCatalogConfig; error?: string };
        if (!response.ok) throw new Error(result.error || 'Location settings could not be loaded.');
        if (active && result.config) setConfig(result.config);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Location settings could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateArea = (index: number, field: keyof LocationArea, value: string) => {
    setConfig((current) => ({
      ...current,
      areas: current.areas.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === 'latitude' || field === 'longitude') {
          return { ...item, [field]: value === '' ? undefined : Number(value) };
        }
        return { ...item, [field]: value };
      })
    }));
    setNotice('');
  };

  const updateWaitlist = (field: keyof LocationWaitlistContent, value: string) => {
    setConfig((current) => ({ ...current, waitlist: { ...current.waitlist, [field]: value } }));
    setNotice('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/location/catalog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const result = await response.json() as { config?: LocationCatalogConfig; error?: string };
      if (!response.ok || !result.config) throw new Error(result.error || 'Location settings could not be saved.');
      setConfig(result.config);
      setNotice('Location options and waitlist content saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Location settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const addArea = () => {
    const firstCounty = config.areas[0]?.county || 'Nairobi';
    setConfig((current) => ({
      ...current,
      areas: [...current.areas, {
        country: 'Kenya',
        county: firstCounty,
        city: firstCounty,
        area: ''
      }]
    }));
    setNotice('');
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <MapPin size={19} className="mt-1 text-primary" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Customer locations &amp; launch waitlist</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Configure county-to-area choices and the message customers see when an area is not served. Optional coordinates improve GPS area matching. Reward copy is informational only; this setting does not issue or track gifts.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void save()} disabled={loading || saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">
          <Save size={15} /> {saving ? 'Saving…' : 'Save location settings'}
        </button>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {loading ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading location settings…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">County and area options</h3>
                <p className="mt-1 text-xs text-slate-500">Customers choose a county first, then an area. Custom areas remain available in the customer form.</p>
              </div>
              <button type="button" onClick={addArea} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Plus size={14} /> Add area
              </button>
            </div>
            <div className="space-y-3">
              {config.areas.map((area, index) => (
                <div key={`${index}-${area.county}-${area.area}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_110px_110px_auto]">
                  <label className="text-[11px] font-bold text-slate-600">County
                    <input value={area.county} maxLength={80} onChange={(event) => updateArea(index, 'county', event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900" />
                  </label>
                  <label className="text-[11px] font-bold text-slate-600">City / town
                    <input value={area.city} maxLength={100} onChange={(event) => updateArea(index, 'city', event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900" />
                  </label>
                  <label className="text-[11px] font-bold text-slate-600">Area
                    <input value={area.area} maxLength={100} onChange={(event) => updateArea(index, 'area', event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900" />
                  </label>
                  <label className="text-[11px] font-bold text-slate-600">Latitude
                    <input type="number" step="any" value={area.latitude ?? ''} onChange={(event) => updateArea(index, 'latitude', event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900" />
                  </label>
                  <label className="text-[11px] font-bold text-slate-600">Longitude
                    <input type="number" step="any" value={area.longitude ?? ''} onChange={(event) => updateArea(index, 'longitude', event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-normal text-slate-900" />
                  </label>
                  <button type="button" onClick={() => {
                    setConfig((current) => ({ ...current, areas: current.areas.filter((_, itemIndex) => itemIndex !== index) }));
                    setNotice('');
                  }} aria-label={`Remove ${area.area || 'area'}`} className="mt-4 inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-100 px-3 text-rose-700 hover:bg-rose-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">Waitlist launch message</h3>
              <p className="mt-1 text-xs text-slate-500">This copy appears for customers whose selected area is not currently served.</p>
            </div>
            <label className="text-xs font-bold text-slate-600">Waitlist heading
              <input value={config.waitlist.heading} maxLength={120} onChange={(event) => updateWaitlist('heading', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900" />
            </label>
            <label className="text-xs font-bold text-slate-600">Optional launch gift title
              <input value={config.waitlist.rewardTitle} maxLength={100} onChange={(event) => updateWaitlist('rewardTitle', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal text-slate-900" />
            </label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Waitlist message
              <textarea value={config.waitlist.message} maxLength={500} rows={2} onChange={(event) => updateWaitlist('message', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Launch gift details / terms
              <textarea value={config.waitlist.rewardDetails} maxLength={500} rows={2} onChange={(event) => updateWaitlist('rewardDetails', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
