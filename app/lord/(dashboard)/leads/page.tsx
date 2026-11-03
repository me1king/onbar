'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, Loader2, Megaphone, ShoppingBag, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';

type LeadsData = {
  totals: { visitors: number; orders: number; revenue: number };
  sources: Array<{ source: string; visitors: number; orders: number; revenue: number }>;
  recentOrders: Array<{ id: number; customer_name: string | null; total_price: number | string; status: string; source: string; created_at: string }>;
  error?: string;
};

export default function LeadsPage() {
  const [data, setData] = React.useState<LeadsData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/admin/leads', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as LeadsData;
        if (!response.ok) throw new Error(result.error || 'Lead data could not be loaded.');
        setData(result);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Lead data could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const totals = data?.totals || { visitors: 0, orders: 0, revenue: 0 };
  const conversionRate = totals.visitors ? `${((totals.orders / totals.visitors) * 100).toFixed(1)}%` : '0.0%';

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Growth intelligence · 90 days</p>
          <h1 className="mt-2 text-4xl font-black uppercase tracking-tighter text-slate-950">Leads & acquisition</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">See where customers arrive from and which channels become real orders.</p>
        </div>
        <Link href="/lord/analytics"><Button variant="outline" className="rounded-xl bg-white text-xs font-black uppercase">Open full analytics <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
      </header>
      {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Tracked visitors', value: totals.visitors.toLocaleString(), Icon: Users },
              { label: 'Orders', value: totals.orders.toLocaleString(), Icon: ShoppingBag },
              { label: 'Conversion rate', value: conversionRate, Icon: BarChart3 },
              { label: 'Attributed revenue', value: formatPrice(totals.revenue), Icon: Megaphone }
            ].map(item => <Card key={item.label} className="rounded-2xl border-slate-100 bg-white p-5 shadow-sm"><item.Icon className="h-5 w-5 text-primary" /><p className="mt-5 text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{item.value}</p></Card>)}
          </section>
          <section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="rounded-2xl border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Channel performance</p>
              <div className="mt-5 space-y-3">
                {!data?.sources.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No source-tagged traffic or orders yet.</p>}
                {data?.sources.map(source => <div key={source.source} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl border border-slate-100 p-4"><div><p className="text-sm font-black text-slate-900">{source.source}</p><p className="text-xs text-slate-500">{source.visitors.toLocaleString()} visitors</p></div><div className="text-right"><p className="text-sm font-black text-slate-900">{source.orders}</p><p className="text-[10px] uppercase text-slate-400">orders</p></div><div className="text-right"><p className="text-sm font-black text-primary">{formatPrice(source.revenue)}</p><p className="text-[10px] uppercase text-slate-400">revenue</p></div></div>)}
              </div>
            </Card>
            <Card className="rounded-2xl border-slate-100 bg-slate-950 p-6 text-white shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">What is tracked</p>
              <ul className="mt-5 space-y-4 text-sm leading-6 text-white/70"><li>Instagram, Facebook, WhatsApp, TikTok, Google, referrals, and direct traffic.</li><li>Orders are matched from saved UTM or referral attribution.</li><li>Un-tagged traffic is shown as Direct / unknown rather than invented.</li></ul>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
