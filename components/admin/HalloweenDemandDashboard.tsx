'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, Eye, RefreshCw, Search, ShoppingBag, Sparkles } from 'lucide-react';

interface HalloweenDemand {
  days: number;
  totalEvents: number;
  scannedEvents: number;
  truncated: boolean;
  eventTotals: Record<string, number>;
  topSearches: Array<{ query: string; searches: number; zeroResults: number }>;
  products: Array<{ productId: string; name: string; category: string; views: number; addToCart: number; tryOns: number }>;
  topFilters: Array<{ type: string; value: string; count: number }>;
  dailyTrend: Array<{ date: string; searches: number; zeroResults: number; addToCart: number }>;
}

const number = (value: number) => new Intl.NumberFormat('en-KE').format(value);

export default function HalloweenDemandDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<HalloweenDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/halloween-intelligence?days=${days}`, { cache: 'no-store' });
      const result = await response.json() as HalloweenDemand & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Halloween demand data could not be loaded.');
      setData(result);
    } catch (cause) {
      console.error('[HalloweenIntelligence] Could not load dashboard data:', cause);
      setError(cause instanceof Error ? cause.message : 'Halloween demand data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const events = data?.eventTotals || {};
    return {
      searches: events.HALLOWEEN_SEARCH || 0,
      zeroResults: events.HALLOWEEN_ZERO_RESULTS || 0,
      productViews: events.HALLOWEEN_PRODUCT_VIEW || 0,
      tryOns: events.HALLOWEEN_TRYON_OPEN || 0,
      addToCart: events.HALLOWEEN_ADD_TO_CART || 0,
      filters: events.HALLOWEEN_FILTER || 0
    };
  }, [data]);

  const peak = Math.max(1, ...(data?.dailyTrend || []).map(point =>
    Math.max(point.searches, point.zeroResults, point.addToCart)
  ));

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-violet-700">
            <Sparkles size={14} /> Consented Halloween storefront signals
          </p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-950 sm:text-4xl">Halloween Demand Intelligence</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Search demand, zero-result searches, try-on interest and cart intent. Signals are recorded only when visitors have enabled analytics consent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="halloween-demand-days">Time range</label>
          <select id="halloween-demand-days" value={days} onChange={event => setDays(Number(event.target.value))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><b>Demand data is unavailable.</b><p className="mt-1">{error}</p></div></div>}
      {data?.truncated && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This view is based on the latest {number(data.scannedEvents)} of {number(data.totalEvents)} matching events. Narrow the date range for complete coverage.</p>}

      <section aria-label="Halloween demand summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { title: 'Costume searches', value: totals.searches, Icon: Search },
          { title: 'Zero-result searches', value: totals.zeroResults, Icon: AlertTriangle },
          { title: 'Product interest', value: totals.productViews, Icon: Eye },
          { title: 'Try-on opens', value: totals.tryOns, Icon: Camera },
          { title: 'Add-to-cart intent', value: totals.addToCart, Icon: ShoppingBag },
          { title: 'Shop filters', value: totals.filters, Icon: Sparkles }
        ].map(card => <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{card.title}</p><card.Icon size={16} className="text-violet-700" /></div>
          <p className="mt-3 text-2xl font-black text-slate-950">{loading ? '—' : number(card.value)}</p>
        </article>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black uppercase text-slate-950">Unmet searches</h2>
          <p className="mt-1 text-xs text-slate-500">Frequently searched terms with no matching costume results.</p>
          {loading && !data ? <p className="py-8 text-sm text-slate-500">Loading search demand…</p>
            : (data?.topSearches.filter(item => item.zeroResults > 0).length || 0) === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No consented zero-result searches in this period.</p>
              : <ol className="mt-4 space-y-2">{data?.topSearches.filter(item => item.zeroResults > 0).map(item => <li key={item.query} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3"><span className="font-semibold text-slate-800">{item.query}</span><span className="text-right text-sm font-black text-violet-800">{number(item.zeroResults)} no result · {number(item.searches)} searches</span></li>)}</ol>}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black uppercase text-slate-950">Costume interest</h2>
          <p className="mt-1 text-xs text-slate-500">Catalog views, try-on opens and cart intent by product.</p>
          {loading && !data ? <p className="py-8 text-sm text-slate-500">Loading costume interest…</p>
            : (data?.products.length || 0) === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No consented product-interest signals in this period.</p>
              : <div className="mt-4 space-y-3">{data?.products.map(product => <div key={product.productId} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">{product.name}</h3><p className="text-xs text-slate-500">{product.category}</p></div><span className="text-xs font-black text-violet-800">{number(product.addToCart)} cart intents</span></div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600"><span>{number(product.views)} product views</span><span>{number(product.tryOns)} try-on opens</span></div>
              </div>)}</div>}
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black uppercase text-slate-950">Most-used filters</h2>
        <p className="mt-1 text-xs text-slate-500">Theme and size selections help show what shoppers are trying to find.</p>
        {!data?.topFilters.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{loading ? 'Loading filter activity…' : 'No consented filter signals in this period.'}</p>
          : <div className="mt-4 flex flex-wrap gap-2">{data.topFilters.map(filter => <span key={`${filter.type}:${filter.value}`} className="rounded-full border border-violet-100 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-900">{filter.type}: {filter.value} · {number(filter.count)}</span>)}</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black uppercase text-slate-950">Daily demand signals</h2>
        <p className="mt-1 text-xs text-slate-500">Counts are based on the recorded consented activity, not total anonymous traffic.</p>
        {!data?.dailyTrend.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{loading ? 'Loading daily activity…' : 'No activity recorded in this period.'}</p>
          : <div className="mt-5 space-y-2">{data.dailyTrend.map(point => <div key={point.date} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-xs">
            <time className="font-semibold text-slate-600">{point.date}</time>
            <div className="flex h-7 min-w-0 items-center gap-2">
              <span className="h-2 rounded-full bg-violet-600" style={{ width: `${Math.max(point.searches ? 2 : 0, point.searches / peak * 100)}%` }} title={`${point.searches} searches`} />
              <span className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.max(point.zeroResults ? 2 : 0, point.zeroResults / peak * 100)}%` }} title={`${point.zeroResults} zero results`} />
              <span className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.max(point.addToCart ? 2 : 0, point.addToCart / peak * 100)}%` }} title={`${point.addToCart} cart intents`} />
              <span className="whitespace-nowrap text-slate-500">{point.searches} search · {point.zeroResults} unmet · {point.addToCart} cart</span>
            </div>
          </div>)}</div>}
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span className="text-violet-700">● Searches</span><span className="text-amber-600">● No results</span><span className="text-emerald-700">● Cart intent</span></div>
      </section>
    </main>
  );
}
