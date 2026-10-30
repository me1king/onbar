'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Store,
  Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type WindowDays = 7 | 30;

interface VendorWindow {
  decisions: number;
  accepted: number;
  rejected: number;
  averageResponseSeconds: number | null;
  averagePrepMinutes: number | null;
  onTimePercent: number | null;
  averageRating: number | null;
  vendorComplaints: number;
  complaintsPer100: number | null;
  delivered: number;
  exceptions: number;
  score: number | null;
  grade: string | null;
  rank: number | null;
  zoneSize: number;
}

interface VendorScorecard {
  applicationId: string;
  name: string;
  town: string | null;
  vendorType: 'retailer' | 'wholesaler' | 'street_food';
  acceptingOrders: boolean;
  targets: {
    replySeconds: number;
    prepMinutes: number;
    acceptancePercent: number;
    onTimePercent: number;
    rating: number;
    complaintsPer100: number;
    minimumDecisions: number;
  };
  complianceScore: number | null;
  windows: Record<WindowDays, VendorWindow>;
  dailyResponse: Array<{ date: string; averageResponseSeconds: number; decisions: number }>;
  declineReasons: Array<{ reason: string; count: number }>;
  recentDecisions: Array<{
    orderId: number;
    eventType: 'accepted' | 'rejected';
    occurredAt: string;
    responseSeconds: number;
    note: string | null;
  }>;
}

interface ScorecardResponse {
  vendors?: VendorScorecard[];
  updatedAt?: string;
  responseMetric?: string;
  timeoutMetric?: string;
  error?: string;
}

function acceptanceRate(metrics: VendorWindow) {
  const total = metrics.accepted + metrics.rejected;
  return total ? Math.round((metrics.accepted / total) * 100) : null;
}

function score(metrics: VendorWindow) {
  return metrics.score;
}

function grade(value: number | null) {
  if (value === null) return { label: '—', tone: 'bg-slate-100 text-slate-600' };
  if (value >= 85) return { label: 'A', tone: 'bg-emerald-100 text-emerald-900' };
  if (value >= 72) return { label: 'B', tone: 'bg-sky-100 text-sky-900' };
  if (value >= 58) return { label: 'C', tone: 'bg-amber-100 text-amber-900' };
  return { label: 'D', tone: 'bg-rose-100 text-rose-900' };
}

const vendorTypeLabels: Record<VendorScorecard['vendorType'], string> = {
  retailer: 'Alcohol retailer',
  wholesaler: 'Alcohol wholesaler',
  street_food: 'Street food'
};

function isVendorType(value: string): value is VendorScorecard['vendorType'] {
  return value === 'retailer' || value === 'wholesaler' || value === 'street_food';
}

function formatResponse(seconds: number | null) {
  if (seconds === null) return '—';
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function ResponseTrend({ vendor, days }: { vendor: VendorScorecard; days: WindowDays }) {
  const recordedDays = new Map(vendor.dailyResponse.map(item => [item.date, item]));
  const today = new Date();
  const timeline = Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days + index + 1));
    const dateKey = date.toISOString().slice(0, 10);
    return recordedDays.get(dateKey) || { date: dateKey, averageResponseSeconds: 0, decisions: 0 };
  });
  const values = timeline.filter(item => item.decisions > 0).map(item => item.averageResponseSeconds);
  if (!values.length) {
    return <div className="flex h-32 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs text-slate-600">No merchant decisions recorded in this period.</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = timeline.flatMap((item, index) => {
    if (!item.decisions) return [];
    const x = timeline.length === 1 ? 50 : (index / (timeline.length - 1)) * 100;
    const normalized = (item.averageResponseSeconds - min) / Math.max(1, max - min);
    return [`${x},${90 - normalized * 70}`];
  }).join(' ');
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full overflow-visible" role="img" aria-label={`Daily average order-created-to-response time for ${vendor.name}`}>
        <line x1="0" y1="90" x2="100" y2="90" stroke="rgba(148,163,184,.2)" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {timeline.map((item, index) => item.decisions ? (
          <circle key={item.date} cx={timeline.length === 1 ? 50 : (index / (timeline.length - 1)) * 100} cy={90 - ((item.averageResponseSeconds - min) / Math.max(1, max - min)) * 70} r="2" fill="#fbbf24">
            <title>{item.date}: {formatResponse(item.averageResponseSeconds)} average across {item.decisions} decisions</title>
          </circle>
        ) : null)}
      </svg>
      <div className="mt-2 flex justify-between text-[9px] text-slate-600">
        <span>{timeline[0]?.date}</span><span>{timeline[timeline.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function DeliveryVendorScorecardPage() {
  const [vendors, setVendors] = React.useState<VendorScorecard[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<WindowDays>(7);
  const [vendorTypeFilter, setVendorTypeFilter] = React.useState<'all' | VendorScorecard['vendorType']>('all');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const refresh = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/delivery/vendor-scorecard', { cache: 'no-store' });
      const result = await response.json() as ScorecardResponse;
      if (!response.ok || !result.vendors) throw new Error(result.error || 'Merchant scorecards could not be loaded.');
      setVendors(result.vendors);
      setSelectedId(current => current && result.vendors?.some(vendor => vendor.applicationId === current)
        ? current
        : result.vendors?.[0]?.applicationId || null);
      setUpdatedAt(result.updatedAt || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Merchant scorecards could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const rankedVendors = React.useMemo(() => vendors.filter(vendor =>
    vendorTypeFilter === 'all' || vendor.vendorType === vendorTypeFilter
  ).sort((left, right) => {
    const leftScore = score(left.windows[days]);
    const rightScore = score(right.windows[days]);
    if (leftScore === null) return rightScore === null ? left.name.localeCompare(right.name) : 1;
    if (rightScore === null) return -1;
    return rightScore - leftScore;
  }), [days, vendorTypeFilter, vendors]);
  const selectedVendor = rankedVendors.find(vendor => vendor.applicationId === selectedId) || rankedVendors[0] || null;
  const selectedMetrics = selectedVendor?.windows[days] || null;
  const selectedScore = selectedMetrics ? score(selectedMetrics) : null;
  const selectedGrade = grade(selectedScore);
  const maxDeclines = Math.max(1, ...(selectedVendor?.declineReasons.map(item => item.count) || []));

  const toggleAvailability = async () => {
    if (!selectedVendor || reason.trim().length < 8) return;
    setActionId(selectedVendor.applicationId);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/delivery/vendor-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedVendor.applicationId,
          acceptingOrders: !selectedVendor.acceptingOrders,
          reason: reason.trim()
        })
      });
      const result = await response.json() as { acceptingOrders?: boolean; error?: string };
      if (!response.ok || typeof result.acceptingOrders !== 'boolean') {
        throw new Error(result.error || 'Merchant availability could not be changed.');
      }
      setReason('');
      setNotice({
        kind: 'success',
        text: `${selectedVendor.name} is ${result.acceptingOrders ? 'accepting new orders' : 'paused for new orders'}. The change was audited.`
      });
      await refresh(true);
    } catch (cause) {
      setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Merchant availability could not be changed.' });
    } finally {
      setActionId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-6 text-[#10231f] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col justify-between gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-7">
          <div>
            <Link href="/lord/delivery" className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-950">
              <ArrowLeft size={14} /> Delivery command hub
            </Link>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-700">Merchant operations · Verified records</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#10231f] sm:text-4xl">Vendor scorecard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Real alcohol retailers, alcohol wholesalers, and street food vendors, ranked separately within their town. Response and preparation metrics use recorded merchant events.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1" aria-label="Scorecard reporting period">
              {([7, 30] as const).map(period => (
                <button key={period} type="button" onClick={() => setDays(period)} aria-pressed={days === period}
                  className={cn('min-h-10 rounded-lg px-4 text-xs font-bold transition', days === period ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white')}>
                  {period} days
                </button>
              ))}
            </div>
            <Button onClick={() => void refresh(true)} disabled={refreshing} variant="outline" className="min-h-11 border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} /> Refresh
            </Button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={cn('rounded-2xl border p-4 text-sm', notice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-800')}>{notice.text}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.65fr)]">
          <section aria-label="Ranked merchants" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">Approved merchants</h2>
              <span className="text-xs text-slate-600">{rankedVendors.length} tracked</span>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Vendor category
              <select value={vendorTypeFilter} onChange={event => {
                if (event.target.value === 'all' || isVendorType(event.target.value)) {
                  setVendorTypeFilter(event.target.value);
                }
              }}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs normal-case text-slate-900">
                <option value="all">All vendor categories</option>
                <option value="retailer">Alcohol retailers</option>
                <option value="wholesaler">Alcohol wholesalers</option>
                <option value="street_food">Street food vendors</option>
              </select>
            </label>
            {loading && !vendors.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Loading recorded merchant metrics…</div>
            ) : rankedVendors.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">No approved merchants have been recorded.</div>
            ) : rankedVendors.map(vendor => {
              const metrics = vendor.windows[days];
              const vendorScore = score(metrics);
              const vendorGrade = grade(vendorScore);
              const acceptance = acceptanceRate(metrics);
              return (
                <button key={vendor.applicationId} type="button" onClick={() => setSelectedId(vendor.applicationId)}
                  aria-pressed={selectedVendor?.applicationId === vendor.applicationId}
                  className={cn('flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition',
                    selectedVendor?.applicationId === vendor.applicationId ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40')}>
                  <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black', vendorGrade.tone)}>{vendorGrade.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{vendor.name}</span>
                    <span className="mt-1 block text-[10px] text-slate-600">{vendorTypeLabels[vendor.vendorType]}</span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-600"><MapPin size={11} />{vendor.town || 'Location not set'} · {formatResponse(metrics.averageResponseSeconds)} response</span>
                    <span className="mt-1 block text-[10px] text-slate-600">{acceptance === null ? 'No decision sample' : `${acceptance}% acceptance`} · {metrics.decisions} decisions</span>
                    <span className="mt-1 block text-[10px] text-slate-600">
                      {metrics.decisions < vendor.targets.minimumDecisions
                        ? `Rank eligible after ${vendor.targets.minimumDecisions} decisions`
                        : metrics.rank ? `Rank ${metrics.rank} of ${metrics.zoneSize} in ${vendor.town || 'town not set'}` : 'No town ranking available'}
                    </span>
                  </span>
                  <span className="text-lg font-black tabular-nums text-slate-950">{vendorScore ?? '—'}</span>
                </button>
              );
            })}
            <p className="rounded-xl border border-slate-200 bg-white p-3 text-[10px] leading-5 text-slate-600">
              Ranking is separated by vendor category and town. Minimum sample thresholds are category-specific. Timeouts are not counted because this fulfilment workflow does not record offer timeouts.
            </p>
          </section>

          {selectedVendor && selectedMetrics ? (
            <section aria-label={`${selectedVendor.name} performance details`} className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Merchant detail · last {days} days</p>
                    <h2 className="mt-2 text-2xl font-black text-[#10231f]">{selectedVendor.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {vendorTypeLabels[selectedVendor.vendorType]} · {selectedVendor.town || 'Location not set'} · {selectedVendor.acceptingOrders ? 'Accepting orders' : 'Paused for new orders'}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      {selectedMetrics.decisions < selectedVendor.targets.minimumDecisions
                        ? `${selectedMetrics.decisions} decisions; ranking starts at ${selectedVendor.targets.minimumDecisions}.`
                        : selectedMetrics.rank
                          ? `Rank ${selectedMetrics.rank} of ${selectedMetrics.zoneSize} ${selectedVendor.vendorType.replace('_', ' ')} vendors in ${selectedVendor.town || 'town not set'}.`
                          : 'No town comparison is currently available.'}
                    </p>
                  </div>
                  <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black', selectedGrade.tone)}>{selectedGrade.label}</span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Avg response', value: formatResponse(selectedMetrics.averageResponseSeconds), target: `Under ${selectedVendor.targets.replySeconds}s`, icon: Clock3 },
                    { label: 'Accepted', value: selectedMetrics.accepted, icon: CheckCircle2 },
                    { label: 'Acceptance', value: acceptanceRate(selectedMetrics) === null ? '—' : `${acceptanceRate(selectedMetrics)}%`, target: `At least ${selectedVendor.targets.acceptancePercent}%`, icon: Store },
                    { label: 'Declined', value: selectedMetrics.rejected, icon: ShieldAlert },
                    { label: 'Avg preparation', value: selectedMetrics.averagePrepMinutes === null ? 'Not recorded' : `${selectedMetrics.averagePrepMinutes} min`, target: `Under ${selectedVendor.targets.prepMinutes} min`, icon: Clock3 },
                    { label: 'Ready on time', value: selectedMetrics.onTimePercent === null ? 'Not recorded' : `${selectedMetrics.onTimePercent}%`, target: `At least ${selectedVendor.targets.onTimePercent}%`, icon: CheckCircle2 },
                    { label: 'Customer rating', value: selectedMetrics.averageRating === null ? 'Not recorded' : `${selectedMetrics.averageRating.toFixed(1)} / 5`, target: `At least ${selectedVendor.targets.rating.toFixed(1)} / 5`, icon: Store },
                    { label: 'Vendor-fault complaints', value: selectedMetrics.complaintsPer100 === null ? 'Not recorded' : `${selectedMetrics.complaintsPer100} / 100`, target: `Under ${selectedVendor.targets.complaintsPer100} / 100`, icon: AlertTriangle },
                    { label: 'Compliance documents', value: selectedVendor.complianceScore === null ? 'Not rated' : `${selectedVendor.complianceScore}%`, icon: ShieldAlert },
                    { label: 'Delivered', value: selectedMetrics.delivered, icon: Truck },
                    { label: 'Exceptions', value: selectedMetrics.exceptions, icon: AlertTriangle }
                  ].map(metric => (
                    <article key={metric.label} className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
                      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600"><metric.icon size={13} />{metric.label}</p>
                      <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">{metric.value}</p>
                      {'target' in metric && <p className="mt-1 text-[10px] text-slate-600">Target: {metric.target}</p>}
                    </article>
                  ))}
                </div>
                <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
                    <h3 className="text-sm font-black text-slate-900">Recorded response trend</h3>
                    <p className="mb-3 mt-1 text-[10px] text-slate-600">Daily average seconds from order creation to accept/reject</p>
                    <ResponseTrend vendor={selectedVendor} days={days} />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
                    <h3 className="text-sm font-black text-slate-900">Recorded decline reasons</h3>
                    {selectedVendor.declineReasons.length ? (
                      <div className="mt-4 space-y-3">
                        {selectedVendor.declineReasons.map(item => (
                          <div key={item.reason}>
                            <div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate text-slate-700">{item.reason}</span><span className="font-bold text-slate-700">{item.count}</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.count / maxDeclines) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-4 text-xs text-slate-600">No merchant decline events recorded.</p>}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900">Availability control</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-600">Pausing stops new orders only. In-progress fulfilment remains unchanged. Every change requires a reason and is written to the merchant audit history.</p>
                  <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Audit reason
                    <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3}
                      placeholder="Why is availability changing? (at least 8 characters)"
                      className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500" />
                  </label>
                  <Button onClick={() => void toggleAvailability()} disabled={actionId !== null || reason.trim().length < 8}
                    variant="outline" className={cn('mt-3 min-h-11 w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-50', selectedVendor.acceptingOrders && 'border-rose-300 text-rose-800 hover:bg-rose-50')}>
                    {actionId ? <RefreshCw size={14} className="animate-spin" /> : selectedVendor.acceptingOrders ? 'Pause new orders' : 'Resume new orders'}
                  </Button>
                </section>
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900">Recent merchant decisions</h3>
                  {selectedVendor.recentDecisions.length ? (
                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                      {selectedVendor.recentDecisions.slice(0, 8).map((decision, index) => (
                        <div key={`${decision.orderId}-${decision.occurredAt}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-[#f7f8fa] p-3 text-xs">
                          <span><span className="font-bold text-slate-900">Order #{decision.orderId}</span><span className={cn('ml-2 capitalize', decision.eventType === 'accepted' ? 'text-emerald-800' : 'text-rose-800')}>{decision.eventType}</span>{decision.note && <span className="mt-1 block text-[10px] text-slate-600">{decision.note}</span>}</span>
                          <span className="shrink-0 text-right text-[10px] text-slate-600">{formatResponse(decision.responseSeconds)}<br />{new Date(decision.occurredAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-xs text-slate-600">No decisions recorded for this merchant in the last 30 days.</p>}
                </section>
              </div>
            </section>
          ) : !error ? (
            <section className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <Store className="h-8 w-8 text-slate-500" />
              <p className="mt-3 font-bold text-slate-900">No merchant performance data yet</p>
              <p className="mt-1 text-xs text-slate-600">Approved merchants and recorded fulfillment events will appear here.</p>
            </section>
          ) : null}
        </div>
        <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 text-[10px] text-slate-600">
          <span>{updatedAt ? `Last refreshed ${new Date(updatedAt).toLocaleTimeString()}` : 'Waiting for first refresh'}</span>
          <Link href="/lord/delivery" className="font-bold text-emerald-800 hover:text-emerald-950">Back to live delivery operations →</Link>
        </footer>
      </div>
    </main>
  );
}
