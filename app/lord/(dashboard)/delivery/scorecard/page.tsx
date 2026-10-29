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
  delivered: number;
  exceptions: number;
}

interface VendorScorecard {
  applicationId: string;
  name: string;
  town: string | null;
  acceptingOrders: boolean;
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
  error?: string;
}

function acceptanceRate(metrics: VendorWindow) {
  const total = metrics.accepted + metrics.rejected;
  return total ? Math.round((metrics.accepted / total) * 100) : null;
}

function score(metrics: VendorWindow) {
  const acceptance = acceptanceRate(metrics);
  if (acceptance === null || metrics.averageResponseSeconds === null || metrics.decisions < 5) return null;
  const speed = Math.max(0, Math.min(100, 100 * (1 - metrics.averageResponseSeconds / 180)));
  return Math.round(acceptance * 0.65 + speed * 0.35);
}

function grade(value: number | null) {
  if (value === null) return { label: '—', tone: 'bg-slate-800 text-slate-400' };
  if (value >= 85) return { label: 'A', tone: 'bg-emerald-500/15 text-emerald-300' };
  if (value >= 70) return { label: 'B', tone: 'bg-sky-500/15 text-sky-300' };
  if (value >= 55) return { label: 'C', tone: 'bg-amber-500/15 text-amber-300' };
  return { label: 'D', tone: 'bg-rose-500/15 text-rose-300' };
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
    return <div className="flex h-32 items-center justify-center rounded-xl border border-white/[0.06] text-xs text-slate-500">No merchant decisions recorded in this period.</div>;
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
      <div className="mt-2 flex justify-between text-[9px] text-slate-500">
        <span>{timeline[0]?.date}</span><span>{timeline[timeline.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function DeliveryVendorScorecardPage() {
  const [vendors, setVendors] = React.useState<VendorScorecard[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<WindowDays>(7);
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

  const rankedVendors = React.useMemo(() => [...vendors].sort((left, right) => {
    const leftScore = score(left.windows[days]);
    const rightScore = score(right.windows[days]);
    if (leftScore === null) return rightScore === null ? left.name.localeCompare(right.name) : 1;
    if (rightScore === null) return -1;
    return rightScore - leftScore;
  }), [days, vendors]);
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
    <main className="min-h-screen bg-[#0b1020] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col justify-between gap-5 rounded-3xl border border-white/[0.08] bg-[#111a2e] p-5 sm:flex-row sm:items-center sm:p-7">
          <div>
            <Link href="/lord/delivery" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white">
              <ArrowLeft size={14} /> Delivery command hub
            </Link>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Merchant operations · Verified records</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Vendor scorecard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Real accepted/rejected and fulfilment events. Response time is measured from order creation to the merchant&apos;s recorded decision—not from a routed offer.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-[#0b1020] p-1" aria-label="Scorecard reporting period">
              {([7, 30] as const).map(period => (
                <button key={period} type="button" onClick={() => setDays(period)} aria-pressed={days === period}
                  className={cn('min-h-10 rounded-lg px-4 text-xs font-bold transition', days === period ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5')}>
                  {period} days
                </button>
              ))}
            </div>
            <Button onClick={() => void refresh(true)} disabled={refreshing} variant="outline" className="min-h-11 border-white/15 bg-transparent text-white hover:bg-white/10">
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} /> Refresh
            </Button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={cn('rounded-2xl border p-4 text-sm', notice.kind === 'success' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/20 bg-rose-400/10 text-rose-200')}>{notice.text}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.65fr)]">
          <section aria-label="Ranked merchants" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-300">Approved merchants</h2>
              <span className="text-xs text-slate-500">{vendors.length} tracked</span>
            </div>
            {loading && !vendors.length ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#111a2e] p-6 text-sm text-slate-400">Loading recorded merchant metrics…</div>
            ) : rankedVendors.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#111a2e] p-6 text-sm text-slate-400">No approved merchants have been recorded.</div>
            ) : rankedVendors.map(vendor => {
              const metrics = vendor.windows[days];
              const vendorScore = score(metrics);
              const vendorGrade = grade(vendorScore);
              const acceptance = acceptanceRate(metrics);
              return (
                <button key={vendor.applicationId} type="button" onClick={() => setSelectedId(vendor.applicationId)}
                  aria-pressed={selectedVendor?.applicationId === vendor.applicationId}
                  className={cn('flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition',
                    selectedVendor?.applicationId === vendor.applicationId ? 'border-amber-400 bg-[#151e33] ring-1 ring-amber-400' : 'border-white/[0.08] bg-[#111a2e] hover:border-white/20')}>
                  <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black', vendorGrade.tone)}>{vendorGrade.label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{vendor.name}</span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={11} />{vendor.town || 'Location not set'} · {formatResponse(metrics.averageResponseSeconds)} response</span>
                    <span className="mt-1 block text-[10px] text-slate-500">{acceptance === null ? 'No decision sample' : `${acceptance}% acceptance`} · {metrics.decisions} decisions</span>
                  </span>
                  <span className="text-lg font-black tabular-nums">{vendorScore ?? '—'}</span>
                </button>
              );
            })}
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] leading-5 text-slate-500">
              Score uses acceptance (65%) and response speed (35%, full credit at 0 seconds and none at 180 seconds). Grades are withheld until five decisions exist. This is a dispatch aid, not a customer rating.
            </p>
          </section>

          {selectedVendor && selectedMetrics ? (
            <section aria-label={`${selectedVendor.name} performance details`} className="space-y-5">
              <div className="rounded-3xl border border-white/[0.08] bg-[#111a2e] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Merchant detail · last {days} days</p>
                    <h2 className="mt-2 text-2xl font-black">{selectedVendor.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">{selectedVendor.town || 'Location not set'} · {selectedVendor.acceptingOrders ? 'Accepting orders' : 'Paused for new orders'}</p>
                  </div>
                  <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black', selectedGrade.tone)}>{selectedGrade.label}</span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Avg response', value: formatResponse(selectedMetrics.averageResponseSeconds), icon: Clock3 },
                    { label: 'Accepted', value: selectedMetrics.accepted, icon: CheckCircle2 },
                    { label: 'Acceptance', value: acceptanceRate(selectedMetrics) === null ? '—' : `${acceptanceRate(selectedMetrics)}%`, icon: Store },
                    { label: 'Declined', value: selectedMetrics.rejected, icon: ShieldAlert },
                    { label: 'Delivered', value: selectedMetrics.delivered, icon: Truck },
                    { label: 'Exceptions', value: selectedMetrics.exceptions, icon: AlertTriangle }
                  ].map(metric => (
                    <article key={metric.label} className="rounded-2xl border border-white/[0.07] bg-[#0b1020] p-4">
                      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><metric.icon size={13} />{metric.label}</p>
                      <p className="mt-2 text-2xl font-black tabular-nums">{metric.value}</p>
                    </article>
                  ))}
                </div>
                <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-white/[0.07] bg-[#0b1020] p-4">
                    <h3 className="text-sm font-black">Recorded response trend</h3>
                    <p className="mb-3 mt-1 text-[10px] text-slate-500">Daily average seconds from order creation to accept/reject</p>
                    <ResponseTrend vendor={selectedVendor} days={days} />
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-[#0b1020] p-4">
                    <h3 className="text-sm font-black">Recorded decline reasons</h3>
                    {selectedVendor.declineReasons.length ? (
                      <div className="mt-4 space-y-3">
                        {selectedVendor.declineReasons.map(item => (
                          <div key={item.reason}>
                            <div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate text-slate-300">{item.reason}</span><span className="font-bold text-slate-400">{item.count}</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.count / maxDeclines) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-4 text-xs text-slate-500">No merchant decline events recorded.</p>}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-3xl border border-white/[0.08] bg-[#111a2e] p-5">
                  <h3 className="text-sm font-black">Availability control</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-400">Pausing stops new orders only. In-progress fulfilment remains unchanged. Every change requires a reason and is written to the merchant audit history.</p>
                  <label className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Audit reason
                    <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3}
                      placeholder="Why is availability changing? (at least 8 characters)"
                      className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#0b1020] p-3 text-sm font-normal text-white outline-none focus:border-amber-400" />
                  </label>
                  <Button onClick={() => void toggleAvailability()} disabled={actionId !== null || reason.trim().length < 8}
                    variant="outline" className={cn('mt-3 min-h-11 w-full border-white/15 bg-transparent text-white hover:bg-white/10', selectedVendor.acceptingOrders && 'border-rose-400/30 text-rose-200')}>
                    {actionId ? <RefreshCw size={14} className="animate-spin" /> : selectedVendor.acceptingOrders ? 'Pause new orders' : 'Resume new orders'}
                  </Button>
                </section>
                <section className="rounded-3xl border border-white/[0.08] bg-[#111a2e] p-5">
                  <h3 className="text-sm font-black">Recent merchant decisions</h3>
                  {selectedVendor.recentDecisions.length ? (
                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                      {selectedVendor.recentDecisions.slice(0, 8).map((decision, index) => (
                        <div key={`${decision.orderId}-${decision.occurredAt}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-[#0b1020] p-3 text-xs">
                          <span><span className="font-bold">Order #{decision.orderId}</span><span className={cn('ml-2 capitalize', decision.eventType === 'accepted' ? 'text-emerald-300' : 'text-rose-300')}>{decision.eventType}</span>{decision.note && <span className="mt-1 block text-[10px] text-slate-500">{decision.note}</span>}</span>
                          <span className="shrink-0 text-right text-[10px] text-slate-400">{formatResponse(decision.responseSeconds)}<br />{new Date(decision.occurredAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-xs text-slate-500">No decisions recorded for this merchant in the last 30 days.</p>}
                </section>
              </div>
            </section>
          ) : !error ? (
            <section className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-[#111a2e] p-8 text-center">
              <Store className="h-8 w-8 text-slate-500" />
              <p className="mt-3 font-bold">No merchant performance data yet</p>
              <p className="mt-1 text-xs text-slate-500">Approved merchants and recorded fulfillment events will appear here.</p>
            </section>
          ) : null}
        </div>
        <footer className="flex flex-wrap justify-between gap-3 border-t border-white/[0.08] pt-4 text-[10px] text-slate-500">
          <span>{updatedAt ? `Last refreshed ${new Date(updatedAt).toLocaleTimeString()}` : 'Waiting for first refresh'}</span>
          <Link href="/lord/delivery" className="font-bold text-sky-300 hover:text-sky-200">Back to live delivery operations →</Link>
        </footer>
      </div>
    </main>
  );
}
