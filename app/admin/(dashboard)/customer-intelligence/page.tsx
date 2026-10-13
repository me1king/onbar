'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Info,
  Loader2,
  Megaphone,
  RefreshCw,
  Repeat2,
  Users,
  type LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';

interface PeriodMetrics {
  revenue: number;
  orders: number;
  customers: number;
  repeatCustomers: number;
  repeatRate: number | null;
  averageOrderValue: number | null;
  revenuePerCustomer: number | null;
  referralOrders: number;
  referralRevenue: number;
  itemCostCoveragePercent: number | null;
  contributionBeforeFeesAndRefunds: number | null;
}

interface CustomerIntelligenceResponse {
  windowDays: number;
  current: PeriodMetrics;
  previous: { revenue: number; orders: number; customers: number };
  referralAttribution: { description: string; orders: number; revenue: number };
  dataReadiness: {
    cac: 'unavailable';
    cacReason: string;
    predictedLtv: 'unavailable';
    predictedLtvReason: string;
    contribution: 'available' | 'incomplete';
    contributionNote: string;
  };
  error?: string;
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  trend
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  trend?: number | null;
}) {
  return (
    <Card className="min-w-0 rounded-3xl border-slate-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 sm:tracking-[0.18em]">{label}</p>
          <p className="mt-3 break-words text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">{value}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-10 sm:w-10">
          <Icon size={19} />
        </span>
      </div>
      <div className="mt-4 flex min-h-5 flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-500">{detail}</p>
        {trend !== undefined && trend !== null && (
          <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold ${trend >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </Card>
  );
}

export default function CustomerIntelligencePage() {
  const [data, setData] = React.useState<CustomerIntelligenceResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/customer-intelligence', { cache: 'no-store' });
      const result = await response.json() as CustomerIntelligenceResponse;
      if (!response.ok) throw new Error(result.error || 'Customer intelligence data could not be loaded.');
      setData(result);
    } catch (loadError) {
      console.error('[CustomerIntelligence] Load failed:', loadError);
      setData(null);
      setError(loadError instanceof Error ? loadError.message : 'Customer intelligence data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const revenueTrend = data ? percentageChange(data.current.revenue, data.previous.revenue) : null;
  const ordersTrend = data ? percentageChange(data.current.orders, data.previous.orders) : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-5 rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between sm:p-10">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">
              <Activity size={14} /> Growth intelligence
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Customer Economics</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              See the revenue, repeat behavior, and referral activity recorded for customers—without presenting missing spend or modeled forecasts as facts.
            </p>
          </div>
          <Button onClick={() => void load()} disabled={loading} variant="outline" className="h-11 shrink-0 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15">
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
            Refresh data
          </Button>
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div>
        )}

        {loading && !data ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 className="animate-spin" size={20} /> Loading recorded customer economics…
          </div>
        ) : data ? (
          <>
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Measured in the last 90 days</h2>
                <p className="text-xs text-slate-400">Compared with the previous 90 days</p>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <MetricCard label="Order revenue" value={formatPrice(data.current.revenue)} detail={`${data.current.orders.toLocaleString()} paid or delivered orders`} icon={CircleDollarSign} trend={revenueTrend} />
                <MetricCard label="Purchasing customers" value={data.current.customers.toLocaleString()} detail="Unique customer accounts or normalized phone numbers" icon={Users} />
                <MetricCard label="Repeat customer rate" value={data.current.repeatRate === null ? 'Unavailable' : `${data.current.repeatRate.toFixed(1)}%`} detail={`${data.current.repeatCustomers.toLocaleString()} customers ordered at least twice in this period`} icon={Repeat2} />
                <MetricCard label="Average order value" value={data.current.averageOrderValue === null ? 'Unavailable' : formatPrice(data.current.averageOrderValue)} detail="Recorded order revenue divided by paid or delivered orders" icon={BarChart3} />
                <MetricCard label="Revenue per customer" value={data.current.revenuePerCustomer === null ? 'Unavailable' : formatPrice(data.current.revenuePerCustomer)} detail="Historical 90-day average; not predicted lifetime value" icon={BarChart3} />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="rounded-3xl border-slate-100 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><Info size={20} /></span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">CAC and predicted LTV are not available yet</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{data.dataReadiness.cacReason}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{data.dataReadiness.predictedLtvReason}</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Blended CAC</p>
                    <p className="mt-2 text-lg font-black text-slate-500">Not measured</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Predicted LTV</p>
                    <p className="mt-2 text-lg font-black text-slate-500">No validated model</p>
                  </div>
                </div>
              </Card>

              <Card className="rounded-3xl border-slate-100 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Known attribution signal</p>
                    <h2 className="mt-2 text-lg font-black text-slate-900">Referral-code orders</h2>
                  </div>
                  <Megaphone className="text-primary" size={22} />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Orders attributed</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{data.referralAttribution.orders.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Recorded revenue</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{formatPrice(data.referralAttribution.revenue)}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">{data.referralAttribution.description}</p>
              </Card>
            </div>

            <Card className="rounded-3xl border-slate-100 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Profit data readiness</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                    {data.current.itemCostCoveragePercent === null
                      ? 'No usable order-item unit costs were found in this period.'
                      : `${data.current.itemCostCoveragePercent.toFixed(1)}% of recorded order items have a positive unit cost.`}
                    {' '}A contribution estimate is shown only when all completed orders have recorded item costs.
                  </p>
                </div>
                {data.dataReadiness.contribution === 'available' && data.current.contributionBeforeFeesAndRefunds !== null ? (
                  <div className="min-w-56 rounded-2xl bg-emerald-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Known contribution*</p>
                    <p className="mt-2 text-xl font-black text-emerald-950">{formatPrice(data.current.contributionBeforeFeesAndRefunds)}</p>
                  </div>
                ) : (
                  <div className="min-w-56 rounded-2xl bg-amber-50 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-800">Contribution profit</p>
                    <p className="mt-2 text-lg font-black text-amber-950">Incomplete costs</p>
                  </div>
                )}
              </div>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">*{data.dataReadiness.contributionNote}</p>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/admin/customers" className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm">
                <span><span className="block text-sm font-black text-slate-900">Open customer directory</span><span className="mt-1 block text-xs text-slate-500">Review customer records and order history.</span></span>
                <ArrowRight className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-primary" size={18} />
              </Link>
              <Link href="/admin/marketing/audiences" className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm">
                <span><span className="block text-sm font-black text-slate-900">Explore customer audiences</span><span className="mt-1 block text-xs text-slate-500">Build segments from recorded customer activity.</span></span>
                <ArrowRight className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-primary" size={18} />
              </Link>
            </div>
            <p className="text-right text-[10px] text-slate-400">Order volume change vs previous period: {ordersTrend === null ? 'unavailable' : `${ordersTrend >= 0 ? '+' : ''}${ordersTrend.toFixed(1)}%`}</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
