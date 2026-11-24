'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type DeliveryZone = {
  id: string;
  name: string;
  center_latitude: number | string;
  center_longitude: number | string;
  radius_km: number | string;
  is_active: boolean;
};

const emptyZone = {
  name: '',
  centerLatitude: '',
  centerLongitude: '',
  radiusKm: '5',
  isActive: true
};

export default function DeliveryZonesPanel() {
  const [zones, setZones] = React.useState<DeliveryZone[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = React.useState('');
  const [zone, setZone] = React.useState(emptyZone);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadSettings = React.useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/admin/delivery-zones', { cache: 'no-store' });
      const result = await response.json() as {
        zones?: DeliveryZone[];
        maxDistanceKm?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || 'Delivery settings could not be loaded.');
      setZones(result.zones || []);
      setMaxDistanceKm(String(result.maxDistanceKm ?? ''));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Delivery settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveZone = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/delivery-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-zone',
          ...(editingId ? { id: editingId } : {}),
          name: zone.name,
          centerLatitude: Number(zone.centerLatitude),
          centerLongitude: Number(zone.centerLongitude),
          radiusKm: Number(zone.radiusKm),
          isActive: zone.isActive
        }),
        cache: 'no-store'
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Delivery zone could not be saved.');
      setZone(emptyZone);
      setEditingId(null);
      setMessage('Delivery zone saved. Customer orders with map pins in this radius are assigned to it.');
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Delivery zone could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveDistanceCap = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/delivery-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-distance-cap', maxDistanceKm: Number(maxDistanceKm) }),
        cache: 'no-store'
      });
      const result = await response.json() as { error?: string; maxDistanceKm?: number };
      if (!response.ok) throw new Error(result.error || 'Dispatch distance cap could not be saved.');
      setMaxDistanceKm(String(result.maxDistanceKm));
      setMessage('Dispatch distance cap saved. Riders cannot set a higher limit.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Dispatch distance cap could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const editZone = (item: DeliveryZone) => {
    setEditingId(item.id);
    setZone({
      name: item.name,
      centerLatitude: String(item.center_latitude),
      centerLongitude: String(item.center_longitude),
      radiusKm: String(item.radius_km),
      isActive: item.is_active
    });
  };

  return (
    <Card className="space-y-5 rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-black">Delivery-zone dispatch rules</h2>
        <p className="mt-1 text-sm text-slate-500">
          Define circular zones from map coordinates. Each order with a customer map pin gets the nearest active zone containing that pin.
        </p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading
        ? <p className="text-sm text-slate-500">Loading delivery settings…</p>
        : <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div className="space-y-3">
              {zones.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="font-bold">{item.name} {!item.is_active && <span className="text-xs font-normal text-slate-500">(inactive)</span>}</p>
                    <p className="text-xs text-slate-500">
                      {Number(item.center_latitude).toFixed(5)}, {Number(item.center_longitude).toFixed(5)} · {Number(item.radius_km)} km
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => editZone(item)}>Edit</Button>
                </div>
              ))}
              {!zones.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No configured delivery zones yet. Add a zone before riders can go online.</p>}
              <form onSubmit={saveZone} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                <label className="text-xs font-semibold sm:col-span-2">Zone name<Input required minLength={2} maxLength={80} value={zone.name} onChange={event => setZone(current => ({ ...current, name: event.target.value }))} className="mt-1" /></label>
                <label className="text-xs font-semibold">Centre latitude<Input required type="number" step="any" min="-90" max="90" value={zone.centerLatitude} onChange={event => setZone(current => ({ ...current, centerLatitude: event.target.value }))} className="mt-1" /></label>
                <label className="text-xs font-semibold">Centre longitude<Input required type="number" step="any" min="-180" max="180" value={zone.centerLongitude} onChange={event => setZone(current => ({ ...current, centerLongitude: event.target.value }))} className="mt-1" /></label>
                <label className="text-xs font-semibold">Radius (km)<Input required type="number" min="0.1" max="100" step="0.1" value={zone.radiusKm} onChange={event => setZone(current => ({ ...current, radiusKm: event.target.value }))} className="mt-1" /></label>
                <label className="flex items-center gap-2 self-end text-xs font-semibold">
                  <input type="checkbox" checked={zone.isActive} onChange={event => setZone(current => ({ ...current, isActive: event.target.checked }))} />
                  Active for dispatch
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update zone' : 'Add zone'}</Button>
                  {editingId && <Button type="button" variant="outline" onClick={() => { setZone(emptyZone); setEditingId(null); }}>Cancel</Button>}
                </div>
              </form>
            </div>
            <form onSubmit={saveDistanceCap} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div>
                <h3 className="font-bold">Maximum rider distance</h3>
                <p className="mt-1 text-xs leading-5 text-amber-900">The rider’s own limit can be lower, never higher. Dispatch also checks the GPS-to-customer distance.</p>
              </div>
              <label className="block text-xs font-semibold">Admin cap (km)<Input required type="number" min="1" max="100" step="0.1" value={maxDistanceKm} onChange={event => setMaxDistanceKm(event.target.value)} className="mt-1 bg-white" /></label>
              <Button type="submit" disabled={saving || !maxDistanceKm}>{saving ? 'Saving…' : 'Save distance cap'}</Button>
            </form>
          </div>}
    </Card>
  );
}
