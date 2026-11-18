'use client';

import Link from 'next/link';
import { AlertTriangle, Clock3, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';
import type { PaymentReviewCase } from '@/lib/adminFinanceTypes';

export default function PaymentReviewQueue({
  cases,
  error,
  onRefresh,
  loading
}: {
  cases: PaymentReviewCase[];
  error: string | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <Card className="space-y-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-slate-950">Payment review queue</h2>
            <p className="mt-1 text-sm text-slate-600">
              {cases.length} order{cases.length === 1 ? '' : 's'} need{cases.length === 1 ? 's' : ''} a human payment check.
            </p>
          </div>
        </div>
        <Button type="button" onClick={onRefresh} disabled={loading} variant="outline" className="min-h-11 rounded-xl">
          <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </header>

      <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
        This queue flags stale or inconsistent records only. It never marks an order paid; confirm payments with the provider before changing order status.
      </p>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Payment review data is unavailable: {error}
        </p>
      ) : cases.length ? (
        <ul className="space-y-3">
          {cases.map(item => (
            <li key={item.orderId} className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-black text-slate-900">Order #{item.orderId}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{item.provider}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{item.reason}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Created {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
                <span className="text-sm font-black text-slate-900">{formatPrice(item.amountKsh)}</span>
                <Link href="/admin/orders" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-primary hover:text-primary">
                  Review order
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          No stale or inconsistent online-payment orders were found in the latest 500 records.
        </p>
      )}
    </Card>
  );
}
