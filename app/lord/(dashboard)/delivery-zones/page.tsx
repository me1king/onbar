'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, MapPinned } from 'lucide-react';

const DeliveryAreaManager = dynamic(() => import('@/components/admin/DeliveryAreaManager'), {
  ssr: false,
  loading: () => <div className="h-[68vh] min-h-[620px] animate-pulse rounded-2xl bg-slate-100" />
});

export default function DeliveryZonesPage() {
  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-4 text-left sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/lord/delivery" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Back to Delivery Flow
          </Link>
          <div className="flex items-center gap-3">
            <MapPinned className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-950 sm:text-4xl">Delivery Zone Map</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Draw and price every delivery area on a large map. Customers’ GPS pins match these boundaries to calculate their delivery fee.
          </p>
        </div>
      </header>
      <DeliveryAreaManager />
    </main>
  );
}
