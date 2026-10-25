'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react';

type InsightReport = {
  days: number;
  sampledAt: string;
  summary: {
    views: number;
    searches: number;
    zero_result_searches: number;
    filter_uses: number;
    checkout_intents: number;
    visitors: number;
    paid_orders: number;
    revenue_minor: number;
  };
  events: Array<{ id: string; title: string; views: number; checkout_intents: number; paid_orders: number; revenue_minor: number }>;
  unmetSearches: Array<{ query: string; count: number }>;
  popularCities: Array<{ city: string; count: number }>;
};

function formatCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-KE') : '—';
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 })
    .format(value / 100);
}

export default function TicketingInsightsPage() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<InsightReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/ticketing/insights?days=${days}`, { cache: 'no-store' });
      const result = await response.json() as InsightReport & { error?: string };
      if (!response.ok) throw new Error(result.error || `Demand report failed (${response.status}).`);
      setReport(result);
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : 'Ticketing demand insights could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const metrics: Array<[string, string]> = report ? [
    ['Event views', formatCount(report.summary.views)],
    ['Anonymous visitors', formatCount(report.summary.visitors)],
    ['Searches', formatCount(report.summary.searches)],
    ['Searches with no results', formatCount(report.summary.zero_result_searches)],
    ['Filter selections', formatCount(report.summary.filter_uses)],
    ['Checkout starts', formatCount(report.summary.checkout_intents)],
    ['Verified paid orders', formatCount(report.summary.paid_orders)],
    ['Verified ticket revenue', formatMoney(report.summary.revenue_minor)]
  ] : [];

  return (
    <main className="min-h-screen bg-[#0d0a12] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-amber-200/15 bg-gradient-to-br from-[#201913] via-[#151319] to-[#0e0d12] p-5 sm:p-8">
          <Link href="/lord/ticketing" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white">
            <ArrowLeft size={14} /> Ticketing management
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-200"><BarChart3 size={15} /> Ticketing demand</p>
              <h1 className="mt-2 text-3xl font-black sm:text-4xl">Discovery insights</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Consent-based anonymous browsing signals alongside verified ticket orders. This is descriptive reporting, not a forecast.</p>
            </div>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="ticketing-insight-days">Report period</label>
              <select id="ticketing-insight-days" value={days} onChange={event => setDays(Number(event.target.value))}
                className="min-h-11 rounded-xl border border-white/10 bg-[#17121e] px-3 text-sm font-bold text-white">
                <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
              </select>
              <button type="button" onClick={() => void load()} disabled={loading}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-bold hover:bg-white/5 disabled:opacity-50">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-300/25 bg-red-950/25 p-4 text-sm text-red-100">{error}</div>}

        <section aria-label="Ticketing demand metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-[#17121e] p-4">
              <p className="text-xs font-bold text-slate-400">{label}</p>
              <p className="mt-3 text-2xl font-black">{loading && !report ? '—' : value}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-[#17121e] p-5">
            <h2 className="font-black">Unmet searches</h2>
            <p className="mt-1 text-xs text-slate-400">Searches with no matching events; contact-like queries are excluded.</p>
            {report?.unmetSearches.length ? <ul className="mt-4 divide-y divide-white/10">
              {report.unmetSearches.map(item => <li key={item.query} className="flex justify-between gap-3 py-2 text-sm"><span>{item.query}</span><span className="text-slate-400">{formatCount(item.count)}</span></li>)}
            </ul> : <p className="mt-4 text-sm text-slate-500">{loading ? 'Loading…' : 'No unmet searches in this period.'}</p>}
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#17121e] p-5">
            <h2 className="font-black">Popular city filters</h2>
            <p className="mt-1 text-xs text-slate-400">Cities visitors actively selected during event discovery.</p>
            {report?.popularCities.length ? <ul className="mt-4 divide-y divide-white/10">
              {report.popularCities.map(item => <li key={item.city} className="flex justify-between gap-3 py-2 text-sm"><span>{item.city}</span><span className="text-slate-400">{formatCount(item.count)}</span></li>)}
            </ul> : <p className="mt-4 text-sm text-slate-500">{loading ? 'Loading…' : 'No city filters in this period.'}</p>}
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#17121e]">
          <h2 className="border-b border-white/10 p-5 font-black">Event performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="text-xs text-slate-400"><tr><th className="p-4">Event</th><th className="p-4">Views</th><th className="p-4">Checkout starts</th><th className="p-4">Paid orders</th><th className="p-4">Verified revenue</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {report?.events.map(event => <tr key={event.id}><td className="p-4 font-bold">{event.title}</td><td className="p-4">{formatCount(event.views)}</td><td className="p-4">{formatCount(event.checkout_intents)}</td><td className="p-4">{formatCount(event.paid_orders)}</td><td className="p-4">{formatMoney(event.revenue_minor)}</td></tr>)}
                {!report?.events.length && <tr><td colSpan={5} className="p-5 text-slate-500">{loading ? 'Loading…' : 'No event activity recorded in this period.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
