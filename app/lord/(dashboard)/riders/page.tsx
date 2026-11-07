'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  BatteryMedium,
  CheckCircle2,
  Clock3,
  LocateFixed,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBatteryTelemetry } from '@/lib/riderTelemetry';

interface Rider {
  id: number;
  rider_name: string;
  rider_phone: string;
  vehicle_type: string | null;
  vehicle_reg: string | null;
  status: string | null;
  verification_status: string;
  battery_level: number | null;
  battery_updated_at: string | null;
  location_updated_at: string | null;
  updated_at: string | null;
  online: boolean;
  locationFresh: boolean;
}

interface DeliveryResponse {
  riders: Rider[];
  error?: string;
}

type FleetFilter = 'all' | 'online' | 'verified' | 'review';

function relativeTime(value: string | null) {
  if (!value) return 'No recent GPS';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function RidersPage() {
  const [riders, setRiders] = React.useState<Rider[]>([]);
  const [filter, setFilter] = React.useState<FleetFilter>('all');
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadRiders = React.useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/delivery', { cache: 'no-store' });
      const result = await response.json() as DeliveryResponse;
      if (!response.ok) throw new Error(result.error || 'Could not load the rider fleet.');
      setRiders(Array.isArray(result.riders) ? result.riders : []);
    } catch (loadError) {
      console.error('[AdminRiders] Could not load rider fleet:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load the rider fleet.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRiders();
  }, [loadRiders]);

  const counts = React.useMemo(() => ({
    total: riders.length,
    online: riders.filter(rider => rider.online).length,
    verified: riders.filter(rider => rider.verification_status === 'Verified').length,
    review: riders.filter(rider => rider.verification_status !== 'Verified').length
  }), [riders]);

  const visibleRiders = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return riders.filter(rider => {
      const matchesFilter = filter === 'all'
        || (filter === 'online' && rider.online)
        || (filter === 'verified' && rider.verification_status === 'Verified')
        || (filter === 'review' && rider.verification_status !== 'Verified');
      const matchesQuery = !needle
        || [rider.rider_name, rider.rider_phone, rider.vehicle_reg, rider.vehicle_type]
          .some(value => value?.toLowerCase().includes(needle));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, riders]);

  const filters: { key: FleetFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All riders', count: counts.total },
    { key: 'online', label: 'Online', count: counts.online },
    { key: 'verified', label: 'Verified', count: counts.verified },
    { key: 'review', label: 'Needs review', count: counts.review }
  ];

  return (
    <main className="min-h-full space-y-6 p-4 text-slate-900 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            <Activity size={14} /> Delivery operations
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Rider fleet</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Review rider availability, verification, vehicle details, and recent location activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="bg-white">
            <Link href="/lord/delivery"><Truck size={16} className="mr-2" /> Delivery operations</Link>
          </Button>
          <Button onClick={() => void loadRiders(true)} disabled={loading || refreshing} className="bg-slate-900 text-white hover:bg-slate-800">
            <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</span>
          <Button variant="outline" onClick={() => void loadRiders(true)} disabled={refreshing} className="border-rose-300 bg-white text-rose-800">
            Try again
          </Button>
        </div>
      )}

      <section aria-label="Fleet overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Registered riders', value: counts.total, icon: Users, tone: 'text-slate-700 bg-slate-100' },
          { label: 'Online now', value: counts.online, icon: Activity, tone: 'text-emerald-700 bg-emerald-100' },
          { label: 'Verified', value: counts.verified, icon: ShieldCheck, tone: 'text-sky-700 bg-sky-100' },
          { label: 'Needs review', value: counts.review, icon: Clock3, tone: 'text-amber-700 bg-amber-100' }
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon size={20} /></span>
            <span>
              <span className="block text-2xl font-black">{loading ? '—' : stat.value}</span>
              <span className="text-xs font-semibold text-slate-500">{stat.label}</span>
            </span>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter riders">
              {filters.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={filter === item.key}
                  className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                    filter === item.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {item.label} <span className="ml-1 opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search name, phone, or plate"
                aria-label="Search rider fleet"
                className="pl-9"
              />
            </label>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm font-medium text-slate-500">Loading rider fleet…</div>
        ) : visibleRiders.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <Users size={30} className="text-slate-300" />
            <h2 className="mt-3 font-bold">{riders.length ? 'No riders match this view' : 'No riders registered yet'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {riders.length ? 'Try another filter or search term.' : 'Riders will appear here after they have been added to the fleet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleRiders.map(rider => {
              const verified = rider.verification_status === 'Verified';
              return (
                <li key={rider.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${rider.online ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-label={rider.online ? 'Online' : 'Offline'} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-bold text-slate-900">{rider.rider_name || 'Unnamed rider'}</h2>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
                          verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {verified ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                          {rider.verification_status || 'Unverified'}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${rider.online ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                          {rider.online ? 'Online' : rider.status || 'Offline'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                        <a href={`tel:${rider.rider_phone}`} className="inline-flex items-center gap-1.5 hover:text-slate-900">
                          <Phone size={13} /> {rider.rider_phone}
                        </a>
                        {(rider.vehicle_type || rider.vehicle_reg) && (
                          <span className="inline-flex items-center gap-1.5"><Truck size={13} /> {[rider.vehicle_type, rider.vehicle_reg].filter(Boolean).join(' · ')}</span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          {rider.locationFresh ? <LocateFixed size={13} className="text-emerald-600" /> : <MapPin size={13} />}
                          {rider.locationFresh ? 'GPS updated ' : ''}{relativeTime(rider.location_updated_at)}
                        </span>
                        <span className="inline-flex items-center gap-1.5"><BatteryMedium size={13} />Battery {formatBatteryTelemetry(rider.battery_level, rider.battery_updated_at)}</span>
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="shrink-0">
                    <Link href={`/lord/riders/${rider.id}`}>View rider</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
