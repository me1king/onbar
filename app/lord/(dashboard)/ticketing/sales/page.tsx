'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Download, RefreshCw, Ticket, Wallet } from 'lucide-react';

type SalesSummary = {
  paidOrders: number;
  ticketsSold: number;
  grossSalesMinor: string;
  serviceFeesMinor: string;
  discountsMinor: string;
  collectedMinor: string;
  refundedMinor: string;
  netAfterRefundsMinor: string;
  currency: string;
};

type EventSales = {
  eventId: string;
  eventTitle: string;
  paidOrders: number;
  ticketsSold: number;
  grossSalesMinor: string;
  serviceFeesMinor: string;
  discountsMinor: string;
  collectedMinor: string;
  currency: string;
};

type RecentSale = {
  reference: string;
  eventTitle: string;
  tickets: number;
  grossSalesMinor: string;
  serviceFeesMinor: string;
  discountsMinor: string;
  collectedMinor: string;
  currency: string;
  paidAt: string;
};

type SalesReport = {
  summary: SalesSummary;
  byEvent: EventSales[];
  recentOrders: RecentSale[];
  generatedAt: string;
};

const cardClass = 'rounded-2xl border border-amber-200/10 bg-[#17121e] p-4 sm:p-5';

function count(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-KE') : '—';
}

function money(minor: string, currency: string) {
  if (!/^-?\d+$/.test(minor)) return '—';
  const amount = BigInt(minor);
  const hundred = BigInt(100);
  const sign = amount < BigInt(0) ? '-' : '';
  const absolute = amount < BigInt(0) ? -amount : amount;
  const whole = absolute / hundred;
  const fraction = String(absolute % hundred).padStart(2, '0');
  return `${sign}${currency} ${whole.toLocaleString('en-KE')}.${fraction}`;
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function TicketingSalesPage() {
  const [period, setPeriod] = useState<'all' | '7d' | '30d'>('all');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/ticketing/sales?period=${period}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as SalesReport & { error?: string };
      if (!response.ok) throw new Error(result.error || `Ticket sales request failed (${response.status}).`);
      if (!result.summary || !Array.isArray(result.byEvent) || !Array.isArray(result.recentOrders)) {
        throw new Error('Ticket sales response was incomplete.');
      }
      setReport(result);
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : 'Ticket sales could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ['Type', 'Reference', 'Event', 'Paid at', 'Tickets', 'Gross ticket sales', 'Service fees', 'Discounts', 'Collected', 'Currency'],
      ...report.recentOrders.map(order => [
        'Ticket order', order.reference, order.eventTitle, order.paidAt, order.tickets,
        order.grossSalesMinor, order.serviceFeesMinor, order.discountsMinor, order.collectedMinor, order.currency
      ])
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const downloadUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `ticket-sales-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  const summary = report?.summary;
  const cards = summary ? [
    { label: 'Verified ticket orders', value: count(summary.paidOrders), icon: Wallet },
    { label: 'Tickets sold', value: count(summary.ticketsSold), icon: Ticket },
    { label: 'Gross ticket sales', value: money(summary.grossSalesMinor, summary.currency), icon: Wallet },
    { label: 'Fees collected', value: money(summary.serviceFeesMinor, summary.currency), icon: Wallet },
    { label: 'Customer discounts', value: money(summary.discountsMinor, summary.currency), icon: CalendarDays },
    { label: 'Total collected', value: money(summary.collectedMinor, summary.currency), icon: Wallet },
    { label: 'Successful refunds', value: money(summary.refundedMinor, summary.currency), icon: Wallet },
    { label: 'Net after refunds', value: money(summary.netAfterRefundsMinor, summary.currency), icon: Wallet }
  ] : [];

  return (
    <main className="min-h-screen bg-[#0d0a12] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-amber-200/15 bg-gradient-to-br from-[#201913] via-[#151319] to-[#0e0d12] p-5 shadow-2xl shadow-black/20 sm:p-8">
          <Link href="/lord/ticketing" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-white">
            <ArrowLeft size={14} /> Ticketing management
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Dedicated ticketing ledger</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Ticket sales<span className="text-amber-300">.</span></h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Only verified paid records from the isolated Ticketing orders, payment attempts and refund tables appear here.
                Beverage orders, shop reports, product stock and merchant payouts are not included.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="ticket-sales-period">Reporting period</label>
              <select id="ticket-sales-period" value={period} onChange={event => setPeriod(event.target.value as typeof period)}
                className="min-h-11 rounded-xl border border-white/10 bg-[#17121e] px-3 text-sm font-bold text-white outline-none focus:border-amber-300">
                <option value="all">All time</option>
                <option value="30d">Last 30 days</option>
                <option value="7d">Last 7 days</option>
              </select>
              <button type="button" onClick={() => void load()} disabled={loading}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 text-sm font-bold hover:bg-white/10 disabled:opacity-50">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button type="button" onClick={exportCsv} disabled={!report || loading}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-black text-[#170d18] hover:bg-amber-200 disabled:opacity-50">
                <Download size={15} /> Export recent sales
              </button>
            </div>
          </div>
          {report?.generatedAt && <p className="mt-4 text-[11px] text-slate-500">Synced {dateTime(report.generatedAt)} · {period === 'all' ? 'All time' : `Last ${period === '7d' ? '7' : '30'} days`}</p>}
        </header>

        {error && <section role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/30 p-4 text-sm text-red-100">
          <p className="font-black">Ticket sales report unavailable</p>
          <p className="mt-1 text-xs leading-5 text-red-100/80">{error}</p>
        </section>}

        {loading && !report ? (
          <div className="rounded-2xl border border-white/10 bg-[#17121e] p-10 text-center text-sm text-slate-400">Syncing the Ticketing ledger…</div>
        ) : report ? (
          <>
            <section aria-label="Ticketing revenue summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(card => (
                <article key={card.label} className={cardClass}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{card.label}</span>
                    <card.icon size={16} className="text-amber-200" />
                  </div>
                  <p className="mt-3 break-words text-2xl font-black text-white">{card.value}</p>
                  <p className="mt-1 text-[10px] text-slate-500">Ticketing ledger only</p>
                </article>
              ))}
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#17121e]">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-lg font-black">Sales by event</h2>
                <p className="mt-1 text-xs text-slate-400">Paid orders and revenue grouped from verified Ticketing orders.</p>
              </div>
              {report.byEvent.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-400">
                      <tr><th className="px-5 py-3">Event</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Tickets</th><th className="px-4 py-3">Gross sales</th><th className="px-4 py-3">Fees</th><th className="px-5 py-3">Collected</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {report.byEvent.map(event => (
                        <tr key={event.eventId}>
                          <td className="px-5 py-4 font-bold text-white">{event.eventTitle}</td>
                          <td className="px-4 py-4 text-slate-300">{count(event.paidOrders)}</td>
                          <td className="px-4 py-4 text-slate-300">{count(event.ticketsSold)}</td>
                          <td className="px-4 py-4 text-amber-100">{money(event.grossSalesMinor, event.currency)}</td>
                          <td className="px-4 py-4 text-slate-300">{money(event.serviceFeesMinor, event.currency)}</td>
                          <td className="px-5 py-4 font-black text-white">{money(event.collectedMinor, event.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="p-8 text-center text-sm text-slate-400">No verified paid ticket orders in this period.</p>}
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#17121e]">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-lg font-black">Recent verified orders</h2>
                <p className="mt-1 text-xs text-slate-400">Latest 50 paid ticket orders. Customer contact details and ticket credentials are intentionally excluded.</p>
              </div>
              {report.recentOrders.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-400">
                      <tr><th className="px-5 py-3">Ticket order</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Tickets</th><th className="px-4 py-3">Amount paid</th><th className="px-5 py-3">Verified at</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {report.recentOrders.map(order => (
                        <tr key={order.reference}>
                          <td className="px-5 py-4 font-mono text-xs text-amber-100">{order.reference}</td>
                          <td className="px-4 py-4 font-semibold text-white">{order.eventTitle}</td>
                          <td className="px-4 py-4 text-slate-300">{count(order.tickets)}</td>
                          <td className="px-4 py-4 font-black text-white">{money(order.collectedMinor, order.currency)}</td>
                          <td className="px-5 py-4 text-xs text-slate-400">{dateTime(order.paidAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="p-8 text-center text-sm text-slate-400">No paid ticket orders are recorded yet.</p>}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
