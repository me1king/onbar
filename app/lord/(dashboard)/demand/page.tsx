'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Mail, MapPin, Phone, RefreshCw, Users, UserRoundPlus, X } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

interface DemandLocation {
  country: string;
  county: string;
  city: string;
  area: string;
  serviceAvailable: boolean;
  knownVisitors: number;
  totalUsers: number;
  newSignups: number;
  activeUsers: number;
  waitlistSignups: number;
  recentWaitlistSignups: number;
  previousWaitlistSignups: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  trafficSources: Record<string, number>;
}

interface WaitlistContact {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  county: string;
  city: string;
  area: string;
  source: string;
  status: string;
  createdAt: string;
}

interface TrendPoint {
  date: string;
  activeSessions: number;
  newSignups: number;
  waitlistSignups: number;
}

interface DemandResponse {
  days: number;
  locations: DemandLocation[];
  waitlistContacts: WaitlistContact[];
  dailyTrend: TrendPoint[];
}

function growthLabel(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 'New demand' : 'No change';
  const growth = Math.round(((current - previous) / previous) * 100);
  return `${growth > 0 ? '+' : ''}${growth}%`;
}

function numberValue(value: number) {
  return new Intl.NumberFormat('en-KE').format(value);
}

export default function DemandIntelligencePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DemandResponse | null>(null);
  const [selectedArea, setSelectedArea] = useState<Pick<DemandLocation, 'county' | 'city' | 'area'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDemand = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/demand-intelligence?days=${days}`, { cache: 'no-store' });
      const result = await response.json() as DemandResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Demand data could not be loaded.');
      setData(result);
    } catch (cause) {
      console.error('[DemandIntelligence] Could not load the dashboard:', cause);
      setError(cause instanceof Error ? cause.message : 'Demand data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void fetchDemand(); }, [fetchDemand]);

  const totals = useMemo(() => (data?.locations || []).reduce((sum, item) => ({
    knownVisitors: sum.knownVisitors + item.knownVisitors,
    totalUsers: sum.totalUsers + item.totalUsers,
    newSignups: sum.newSignups + item.newSignups,
    activeUsers: sum.activeUsers + item.activeUsers,
    waitlistSignups: sum.waitlistSignups + item.waitlistSignups,
    orders: sum.orders + item.orders,
    revenue: sum.revenue + item.revenue
  }), {
    knownVisitors: 0, totalUsers: 0, newSignups: 0, activeUsers: 0, waitlistSignups: 0, orders: 0, revenue: 0
  }), [data]);

  const topSources = useMemo(() => {
    const sources = new Map<string, number>();
    for (const location of data?.locations || []) {
      for (const [source, count] of Object.entries(location.trafficSources || {})) {
        sources.set(source, (sources.get(source) || 0) + count);
      }
    }
    return [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data]);

  const highestDemand = [...(data?.locations || [])]
    .filter((location) => !location.serviceAvailable && location.waitlistSignups > 0)
    .sort((a, b) => b.waitlistSignups - a.waitlistSignups)
    .slice(0, 3);
  const selectedAreaContacts = selectedArea
    ? (data?.waitlistContacts || []).filter((contact) =>
      contact.county.trim().toLowerCase() === selectedArea.county.trim().toLowerCase()
      && contact.city.trim().toLowerCase() === selectedArea.city.trim().toLowerCase()
      && contact.area.trim().toLowerCase() === selectedArea.area.trim().toLowerCase()
    )
    : [];

  const maxTrend = Math.max(1, ...(data?.dailyTrend || []).map((point) =>
    Math.max(point.activeSessions, point.newSignups, point.waitlistSignups)
  ));

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-primary">
            <MapPin size={14} /> Market planning · consented areas only
          </p>
          <h1 className="mt-2 break-words text-2xl font-black uppercase tracking-tight text-slate-950 sm:text-4xl">Demand Intelligence</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Area-level demand, launches and traffic sources. Exact customer GPS coordinates are not included or stored by this dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="demand-range">Time range</label>
          <select id="demand-range" value={days} onChange={(event) => setDays(Number(event.target.value))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button type="button" onClick={() => void fetchDemand()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><p className="font-bold">Demand data is unavailable.</p><p className="mt-1">{error}</p></div>
        </div>
      )}

      <section aria-label="Demand summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: 'Known opted-in visitors', value: numberValue(totals.knownVisitors), icon: Users },
          { label: 'Registered users by area', value: numberValue(totals.totalUsers), icon: Users },
          { label: `New signups · ${days}d`, value: numberValue(totals.newSignups), icon: UserRoundPlus },
          { label: `Active users · ${days}d`, value: numberValue(totals.activeUsers), icon: Activity },
          { label: 'Area waitlist', value: numberValue(totals.waitlistSignups), icon: MapPin },
          { label: `Paid orders · ${days}d`, value: numberValue(totals.orders), icon: ArrowUpRight }
        ].map((metric) => (
          <article key={metric.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{metric.label}</p>
              <metric.icon size={16} className="shrink-0 text-primary" />
            </div>
            <p className="mt-3 break-words text-2xl font-black text-slate-950">{loading ? '—' : metric.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Demand by area</h2>
            <p className="mt-1 text-xs text-slate-500">Only customers who opted in to area-level location are included. Tap an area name to see consenting launch contacts there.</p>
          </div>
          {loading && !data ? <p className="py-10 text-center text-sm text-slate-500">Loading area demand…</p>
            : (data?.locations.length || 0) === 0 ? <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">No opted-in area data yet. New signups appear here as customers choose to share their area.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>{['Location', 'Visitors', 'Users', `New · ${days}d`, `Active · ${days}d`, 'Waitlist', `Orders · ${days}d`, 'Revenue', 'Conversion', 'Traffic mix', 'Waitlist growth'].map((label) => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data?.locations.map((location) => (
                        <tr key={`${location.county}-${location.city}-${location.area}`} className="align-top hover:bg-slate-50">
                          <td className="px-3 py-4">
                            <button
                              type="button"
                              onClick={() => setSelectedArea({ county: location.county, city: location.city, area: location.area })}
                              aria-label={`Show opted-in people in ${location.area}, ${location.city}`}
                              aria-pressed={selectedArea?.area === location.area && selectedArea.city === location.city && selectedArea.county === location.county}
                              className="rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <span className="font-bold text-slate-900 underline decoration-dotted underline-offset-4">{location.area}</span>
                              <span className="block text-xs text-slate-500">{location.city}, {location.county}</span>
                            </button>
                          </td>
                          <td className="px-3 py-4 font-semibold">{numberValue(location.knownVisitors)}</td>
                          <td className="px-3 py-4">{numberValue(location.totalUsers)}</td>
                          <td className="px-3 py-4">{numberValue(location.newSignups)}</td>
                          <td className="px-3 py-4">{numberValue(location.activeUsers)}</td>
                          <td className="px-3 py-4 font-bold text-amber-700">{numberValue(location.waitlistSignups)}</td>
                          <td className="px-3 py-4">{numberValue(location.orders)}</td>
                          <td className="px-3 py-4 font-semibold">{formatPrice(location.revenue)}</td>
                          <td className="px-3 py-4">{location.conversionRate}%</td>
                          <td className="px-3 py-4">
                            <div className="flex max-w-48 flex-wrap gap-1">
                              {Object.entries(location.trafficSources || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([source, count]) => (
                                <span key={source} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{source} {count}</span>
                              ))}
                              {!Object.keys(location.trafficSources || {}).length && <span className="text-xs text-slate-400">—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-4">{growthLabel(location.recentWaitlistSignups, location.previousWaitlistSignups)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          {selectedArea && (
            <section aria-label={`People in ${selectedArea.area}`} className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Opted-in people in this area</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">{selectedArea.area} · {selectedArea.city}</h3>
                  <p className="mt-1 text-xs text-slate-600">{selectedAreaContacts.length} consenting launch-list contact{selectedAreaContacts.length === 1 ? '' : 's'}</p>
                </div>
                <button type="button" onClick={() => setSelectedArea(null)} aria-label="Close area people details" className="rounded-lg p-2 text-slate-500 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  <X size={16} />
                </button>
              </div>
              {selectedAreaContacts.length ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {selectedAreaContacts.map((contact) => (
                    <li key={contact.id} className="min-w-0 rounded-xl border border-indigo-100 bg-white p-4">
                      <p className="break-words font-bold text-slate-950">{contact.fullName || 'Name not provided'}</p>
                      <a className="mt-2 flex min-w-0 items-center gap-2 break-all text-xs font-semibold text-primary hover:underline" href={`mailto:${encodeURIComponent(contact.email)}`}>
                        <Mail className="shrink-0" size={13} />{contact.email}
                      </a>
                      {contact.phone && (
                        <a className="mt-2 flex items-center gap-2 text-xs text-slate-600 hover:underline" href={`tel:${encodeURIComponent(contact.phone)}`}>
                          <Phone className="shrink-0" size={13} />{contact.phone}
                        </a>
                      )}
                      <p className="mt-3 text-[10px] text-slate-500">Joined {new Date(contact.createdAt).toLocaleDateString('en-KE')} · {contact.status} · {contact.source}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-600">No opted-in launch contacts are available for this area.</p>
              )}
            </section>
          )}
          <p className="mt-4 text-right text-xs font-bold text-slate-500">Recorded paid revenue: {formatPrice(totals.revenue)}</p>
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Traffic sources</h2>
          <p className="mt-1 text-xs text-slate-500">Sessions mapped to an opted-in area.</p>
          {topSources.length === 0 ? <p className="mt-5 text-sm text-slate-500">No attributed area traffic yet.</p> : (
            <ul className="mt-5 space-y-3">
              {topSources.map(([source, count]) => (
                <li key={source} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
                  <span className="min-w-0 break-words text-sm font-semibold text-slate-700">{source}</span>
                  <span className="shrink-0 text-sm font-black text-slate-950">{numberValue(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Growth over time</h2>
          <p className="mt-1 text-xs text-slate-500">Daily opted-in sessions, new signups and launch-list joins over {days} days.</p>
          <div className="mt-5 space-y-2">
            {data?.dailyTrend.map((point) => (
              <div key={point.date} className="grid grid-cols-[72px_1fr] items-center gap-3">
                <span className="text-[10px] font-semibold text-slate-500">{new Date(`${point.date}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                <div className="flex h-5 min-w-0 items-center gap-1">
                  {[
                    { value: point.activeSessions, color: 'bg-indigo-400', label: 'sessions' },
                    { value: point.newSignups, color: 'bg-primary', label: 'signups' },
                    { value: point.waitlistSignups, color: 'bg-emerald-500', label: 'waitlist' }
                  ].map((series) => (
                    <div key={series.label} title={`${series.value} ${series.label}`} className={`h-3 min-w-0 rounded-full ${series.color}`} style={{ width: `${Math.max(series.value ? 2 : 0, series.value / maxTrend * 100)}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-[10px] font-bold text-slate-500">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-indigo-400" />Sessions</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />Signups</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Waitlist</span>
          </div>
        </article>

        <article className="min-w-0 rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-black uppercase tracking-tight text-orange-950">Emerging opportunities</h2>
          <p className="mt-1 text-xs text-orange-800">Areas outside configured dispatch zones, ranked by opted-in launch interest.</p>
          {highestDemand.length === 0 ? <p className="mt-5 text-sm text-orange-900">No emerging area demand recorded yet.</p> : (
            <ul className="mt-5 space-y-3">
              {highestDemand.map((location) => (
                <li key={`${location.city}-${location.area}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 p-3">
                  <div className="min-w-0"><p className="break-words font-bold text-slate-900">{location.city} · {location.area}</p><p className="text-xs text-slate-500">{location.county} County · {growthLabel(location.recentWaitlistSignups, location.previousWaitlistSignups)} recent joins</p></div>
                  <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-sm font-black text-orange-800">{numberValue(location.waitlistSignups)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Consented launch waitlist</h2>
          <p className="mt-1 text-xs text-slate-500">Contact details are available only to authorized admins and only for customers who agreed to launch updates.</p>
        </div>
        {!data?.waitlistContacts.length ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No launch waitlist signups yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>{['Area', 'Contact', 'Joined', 'Status'].map((label) => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.waitlistContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-3 py-3"><button type="button" onClick={() => setSelectedArea({ county: contact.county, city: contact.city, area: contact.area })} className="text-left font-bold underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{contact.city} · {contact.area}</button><p className="text-xs text-slate-500">{contact.source}</p></td>
                    <td className="px-3 py-3"><a className="break-all font-semibold text-primary hover:underline" href={`mailto:${encodeURIComponent(contact.email)}`}>{contact.email}</a>{contact.phone && <p className="mt-1"><a className="text-xs text-slate-600 hover:underline" href={`tel:${encodeURIComponent(contact.phone)}`}>{contact.phone}</a></p>}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{new Date(contact.createdAt).toLocaleDateString('en-KE')}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-800">{contact.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
