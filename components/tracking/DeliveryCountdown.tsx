'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { LOCATION_AREAS } from '@/lib/locationCatalog';

const DELIVERY_WINDOW_MS = 30 * 60 * 1000;
const STOPPED_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'canceled', 'payment failed', 'refunded', 'rejected']);
const NAIROBI_DELIVERY_AREAS = new Set(
  LOCATION_AREAS
    .filter(location => location.county === 'Nairobi')
    .map(location => location.area.trim().toLowerCase())
);

export default function DeliveryCountdown({
  createdAt,
  status,
  deliveryArea,
}: {
  createdAt: string;
  status: string;
  deliveryArea?: string | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  const createdAtMs = Date.parse(createdAt);
  const isStopped = STOPPED_STATUSES.has(status.trim().toLowerCase());

  useEffect(() => {
    if (!Number.isFinite(createdAtMs) || isStopped) return;

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [createdAtMs, isStopped]);

  if (!Number.isFinite(createdAtMs)) {
    return (
      <p role="status" className="text-sm text-slate-600">
        The delivery estimate is unavailable. Check your live order status for updates.
      </p>
    );
  }

  if (status.trim().toLowerCase() === 'delivered' || status.trim().toLowerCase() === 'completed') {
    return (
      <div className="flex items-center gap-3 text-emerald-800">
        <Clock3 className="h-5 w-5 shrink-0" />
        <p className="font-semibold">Order delivered.</p>
      </div>
    );
  }

  if (isStopped) {
    return (
      <p role="status" className="text-sm text-slate-600">
        This order is no longer active. Check the order status or contact Online Bar for help.
      </p>
    );
  }

  if (!deliveryArea || !NAIROBI_DELIVERY_AREAS.has(deliveryArea.trim().toLowerCase())) {
    return (
      <p role="status" className="text-sm leading-6 text-slate-600">
        The 30-minute estimate applies only to eligible local Nairobi delivery areas. Your delivery timing depends on the selected location and is confirmed at checkout.
      </p>
    );
  }

  const remainingMs = now === null
    ? null
    : Math.max(0, createdAtMs + DELIVERY_WINDOW_MS - now);
  const remainingSeconds = Math.ceil((remainingMs ?? 0) / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Clock3 className="h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-bold text-slate-950">30-minute estimated delivery window</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Counting from when your order was placed. This is an estimate; exact timing depends on your address and live delivery availability.
          </p>
        </div>
      </div>
      <p className="shrink-0 font-mono text-3xl font-black tabular-nums text-slate-950" aria-label={
        remainingMs === null
          ? 'Calculating time remaining in the estimated delivery window'
          : remainingMs > 0
          ? `${minutes} minutes and ${seconds} seconds remaining in the estimated delivery window`
          : 'The estimated 30-minute delivery window has passed'
      }>
        {remainingMs === null
          ? '--:--'
          : remainingMs > 0
          ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          : '00:00'}
      </p>
      {remainingMs === 0 && (
        <p role="status" className="text-sm font-semibold text-amber-900 sm:basis-full">
          The estimated 30-minute window has passed. Your order is still trackable; contact us if you need an update.
        </p>
      )}
    </div>
  );
}
