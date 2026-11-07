'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BatteryMedium,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatPrice } from '@/lib/utils';
import { formatBatteryTelemetry, isBatteryTelemetryFresh } from '@/lib/riderTelemetry';

const LiveDispatchMap = dynamic(() => import('@/components/admin/dispatch/LiveDispatchMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-slate-400">
      Loading live fleet map…
    </div>
  )
});

interface DeliveryOrder {
  id: number;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: string;
  total_price: number | string;
  delivery_cost: number | string | null;
  delivery_address: string | null;
  delivery_area: string | null;
  delivery_building: string | null;
  delivery_landmark: string | null;
  delivery_instructions: string | null;
  delivery_eta_minutes: number | null;
  latitude: number | string | null;
  longitude: number | string | null;
  rider_name: string | null;
  rider_phone: string | null;
}

interface DeliveryRider {
  id: number;
  rider_name: string;
  rider_phone: string;
  vehicle_type: string | null;
  vehicle_reg: string | null;
  status: string | null;
  verification_status: string;
  battery_level: number | null;
  battery_updated_at: string | null;
  last_known_lat: number | string | null;
  last_known_lng: number | string | null;
  location_updated_at: string | null;
  updated_at: string | null;
  max_deliveries: number | null;
  online: boolean;
  locationFresh: boolean;
  lat: number | null;
  lng: number | null;
}

interface DeliveryEvent {
  id: number;
  order_id: number;
  from_status: string | null;
  to_status: string;
  actor_type: string;
  actor_id: string | null;
  created_at: string;
}

interface DeliveryPayload {
  orders: DeliveryOrder[];
  riders: DeliveryRider[];
  activity: DeliveryEvent[];
  activityWarning: string | null;
  metrics: {
    waitingDispatch: number;
    inTransit: number;
    verifiedOnlineRiders: number;
    freshRiderLocations: number;
    completedDeliveries: number;
  };
  updatedAt: string;
}

interface ActiveDeliveryRoute {
  orderId: number;
  riderName: string;
  provider: 'osrm' | 'google' | 'mapbox';
  distanceKm: number;
  durationMinutes: number;
  encodedPolyline: string;
  calculatedAt: string;
}

interface DispatchCandidate {
  riderPhone: string;
  riderName: string;
  activeLoad: number;
  maxDeliveries: number;
  distanceKm: number | null;
  etaMinutes?: number | null;
  locationAvailable: boolean;
  healthScore: number;
}

interface DispatchJob {
  id: number;
  customer_name: string;
  customer_email: string | null;
  total_price: number | string;
  payment_method: string;
  fulfillment: { ready: boolean; reasons: string[] };
  riderCandidates: DispatchCandidate[];
  recommendedRider: DispatchCandidate | null;
  riderAvailabilityReason: string | null;
}

interface DispatchPayload {
  jobs: DispatchJob[];
  error?: string;
}

type QueueFilter = 'active' | 'dispatch' | 'completed' | 'all';

function statusTone(status: string) {
  if (status === 'Delivered') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Out for Delivery') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'Picked Up') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (status === 'Dispatched') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'Paid') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (status === 'Cancelled') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function statusIcon(status: string) {
  if (status === 'Delivered') return CheckCircle2;
  if (status === 'Out for Delivery') return Truck;
  if (status === 'Picked Up') return Package;
  if (status === 'Dispatched') return Route;
  return Clock3;
}

const deliveryFlowSteps = ['Paid', 'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered'];

function deliveryFlowIndex(status: string) {
  if (status === 'Confirmed' || status === 'Pending') return 0;
  return deliveryFlowSteps.indexOf(status);
}

function deliveryFlowColor(status: string) {
  if (status === 'Delivered') return '#16a34a';
  if (status === 'Out for Delivery') return '#0284c7';
  if (status === 'Picked Up') return '#7c3aed';
  if (status === 'Dispatched') return '#d97706';
  if (status === 'Cancelled') return '#e11d48';
  return '#ea580c';
}

function formatTime(value: string | null | undefined) {
  if (!value) return 'No recent update';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortAge(value: string | null | undefined) {
  if (!value) return 'No GPS';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'No GPS';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  return minutes < 1 ? 'Just now' : `${minutes}m ago`;
}

function getAddress(order: DeliveryOrder) {
  return [
    order.delivery_building,
    order.delivery_address,
    order.delivery_area,
    order.delivery_landmark ? `Near ${order.delivery_landmark}` : null
  ].filter(Boolean).join(' · ') || 'Delivery address not recorded';
}

export default function DeliveryOpsPage() {
  const [data, setData] = React.useState<DeliveryPayload | null>(null);
  const [dispatchJobs, setDispatchJobs] = React.useState<DispatchJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dispatchError, setDispatchError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<QueueFilter>('active');
  const [selectedRider, setSelectedRider] = React.useState<DeliveryRider | null>(null);
  const [activeRoute, setActiveRoute] = React.useState<ActiveDeliveryRoute | null>(null);
  const [routeLoadingOrder, setRouteLoadingOrder] = React.useState<number | null>(null);
  const [routeError, setRouteError] = React.useState<string | null>(null);
  const [actionOrder, setActionOrder] = React.useState<number | null>(null);
  const [override, setOverride] = React.useState<Record<number, { phone: string; reason: string }>>({});

  const refresh = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [deliveryResponse, dispatchResponse] = await Promise.all([
        fetch('/api/admin/delivery', { cache: 'no-store' }),
        fetch('/api/admin/dispatch', { cache: 'no-store' })
      ]);
      const deliveryResult = await deliveryResponse.json() as DeliveryPayload & { error?: string };
      if (!deliveryResponse.ok) throw new Error(deliveryResult.error || 'Delivery operations could not be loaded.');

      const dispatchResult = await dispatchResponse.json() as DispatchPayload;
      setData(deliveryResult);
      setLastUpdated(deliveryResult.updatedAt);
      setDispatchJobs(dispatchResponse.ok ? dispatchResult.jobs || [] : []);
      setDispatchError(dispatchResponse.ok ? null : dispatchResult.error || 'Dispatch readiness could not be loaded.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery operations could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 10_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const showRoute = React.useCallback(async (orderId: number) => {
    setRouteLoadingOrder(orderId);
    setRouteError(null);
    try {
      const response = await fetch('/api/admin/delivery/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const result = await response.json() as ActiveDeliveryRoute & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not calculate this delivery route.');
      setActiveRoute(result);
    } catch (cause) {
      setRouteError(cause instanceof Error ? cause.message : 'Could not calculate this delivery route.');
      setActiveRoute(null);
    } finally {
      setRouteLoadingOrder(null);
    }
  }, []);

  const assignRider = React.useCallback(async (
    job: DispatchJob,
    mode: 'automatic' | 'override',
    riderPhone?: string,
    reason?: string
  ) => {
    setActionOrder(job.id);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: job.id,
          mode,
          ...(mode === 'override' ? { riderPhone, reason } : {})
        })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Rider assignment failed.');

      let notificationWarning = '';
      try {
        const notificationResponse = await fetch('/api/admin/notify-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: job.id, status: 'Dispatched' })
        });
        const notificationResult = await notificationResponse.json() as { error?: string };
        if (!notificationResponse.ok) {
          notificationWarning = ` Assignment was saved, but customer notification failed: ${notificationResult.error || 'provider unavailable'}`;
        }
      } catch (notificationError) {
        console.error('[DeliveryOps] Customer notification failed after assignment:', notificationError);
        notificationWarning = ' Assignment was saved, but the customer notification request failed.';
      }

      setNotice({
        type: notificationWarning ? 'error' : 'success',
        text: `Order #${job.id} assigned successfully.${notificationWarning}`
      });
      await refresh(true);
    } catch (cause) {
      setNotice({ type: 'error', text: cause instanceof Error ? cause.message : 'Rider assignment failed.' });
    } finally {
      setActionOrder(null);
    }
  }, [refresh]);

  const retryAllocation = React.useCallback(async (job: DispatchJob) => {
    setActionOrder(job.id);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: job.id, operation: 'retry_merchant_allocation' })
      });
      const result = await response.json() as {
        error?: string;
        message?: string;
        allocation?: { fully_allocated?: boolean };
      };
      if (!response.ok) throw new Error(result.error || 'Merchant allocation retry failed.');
      setNotice({
        type: result.allocation?.fully_allocated ? 'success' : 'error',
        text: result.message || 'Merchant availability rechecked.'
      });
      await refresh(true);
    } catch (cause) {
      setNotice({ type: 'error', text: cause instanceof Error ? cause.message : 'Merchant allocation retry failed.' });
    } finally {
      setActionOrder(null);
    }
  }, [refresh]);

  const filteredOrders = React.useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (data?.orders || []).filter(order => {
      const matchesSearch = !normalized || [
        String(order.id),
        order.customer_name,
        order.customer_phone,
        order.rider_name || '',
        order.rider_phone || '',
        order.delivery_address || '',
        order.delivery_area || ''
      ].join(' ').toLowerCase().includes(normalized);
      if (!matchesSearch) return false;
      if (filter === 'active') return ['Dispatched', 'Picked Up', 'Out for Delivery'].includes(order.status);
      if (filter === 'dispatch') return order.status === 'Paid' && !order.rider_phone;
      if (filter === 'completed') return order.status === 'Delivered';
      return true;
    });
  }, [data, filter, search]);

  const mapRiders = React.useMemo(() => (data?.riders || [])
    .filter(rider => rider.online && rider.locationFresh && rider.lat !== null && rider.lng !== null)
    .map(rider => ({
      id: rider.id,
      rider_name: rider.rider_name,
      status: rider.status || 'Idle',
      battery_level: rider.battery_level,
      battery_updated_at: rider.battery_updated_at,
      lat: rider.lat,
      lng: rider.lng
    })), [data]);

  const dailyCompletions = React.useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      return { date, count: 0 };
    });
    for (const event of data?.activity || []) {
      if (event.to_status !== 'Delivered') continue;
      const eventDate = new Date(event.created_at);
      const day = days.find(item => item.date.toDateString() === eventDate.toDateString());
      if (day) day.count += 1;
    }
    return days;
  }, [data]);

  const maxCompletions = Math.max(1, ...dailyCompletions.map(day => day.count));
  const onlineRiders = data?.riders.filter(rider => rider.online) || [];
  const activeMapRoutes = React.useMemo(() => activeRoute ? [{
    id: String(activeRoute.orderId),
    polyline: activeRoute.encodedPolyline,
    color: deliveryFlowColor(data?.orders.find(order => order.id === activeRoute.orderId)?.status || 'Dispatched')
  }] : [], [activeRoute, data?.orders]);

  return (
    <main className="delivery-ops min-h-screen bg-[#f7f8fa] px-4 py-5 text-left text-[#10231f] selection:bg-amber-400/30 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-amber-100/70 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-800">
                  <Truck size={13} /> Online Bar · Delivery control
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Operations live
                </span>
              </div>
              <h1 className="mt-5 text-3xl font-black uppercase leading-none tracking-tight sm:text-5xl">Runner dispatch<span className="text-amber-500">.</span></h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Real-time runner deployment and delivery coordination. Every assignment remains protected by verified payment and merchant fulfilment checks.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2"><RefreshCw size={12} className={refreshing ? 'animate-spin text-amber-600' : 'text-slate-400'} /> Auto-refresh every 10 seconds</span>
                <span>Last sync: {formatTime(lastUpdated)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/lord/dispatch" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-black text-white shadow-sm transition hover:bg-amber-600">
                <Route size={15} /> Dispatch queue
              </Link>
              <Link href="/lord/orders" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                <Package size={15} /> Order desk
              </Link>
              <Link href="/lord/riders" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                <Users size={15} /> Rider fleet
              </Link>
              <Link href="/lord/delivery/scorecard" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                <Store size={15} /> Vendor scorecard
              </Link>
              <Button onClick={() => void refresh(true)} disabled={refreshing} variant="outline" className="min-h-11 rounded-xl border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <RefreshCw size={14} className={cn('mr-2', refreshing && 'animate-spin')} /> Sync
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm font-semibold text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div role={notice.type === 'error' ? 'alert' : 'status'} className={cn(
            'flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold',
            notice.type === 'success' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-amber-100'
          )}>
            {notice.type === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            {notice.text}
          </div>
        )}
        {dispatchError && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs font-semibold text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Dispatch readiness is unavailable: {dispatchError}
            <Link href="/lord/dispatch" className="ml-auto shrink-0 underline underline-offset-4">Open dispatch</Link>
          </div>
        )}
        {data?.activityWarning && (
          <div role="status" className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs font-semibold text-amber-100">
            {data.activityWarning}
          </div>
        )}
        {routeError && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
            {routeError}
          </div>
        )}

        <section aria-label="Delivery overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Orders in transit', value: data?.metrics.inTransit, detail: 'Dispatched through out for delivery', icon: Truck, color: 'text-amber-600', glow: 'bg-amber-50' },
            { label: 'Awaiting dispatch', value: data?.metrics.waitingDispatch, detail: 'Paid, not yet assigned', icon: Clock3, color: 'text-orange-600', glow: 'bg-orange-50' },
            { label: 'Riders online', value: data?.metrics.verifiedOnlineRiders, detail: `${data?.metrics.freshRiderLocations ?? 0} with fresh GPS`, icon: Users, color: 'text-emerald-700', glow: 'bg-emerald-50' },
            { label: 'Completed deliveries', value: data?.metrics.completedDeliveries, detail: 'All recorded completed orders', icon: CheckCircle2, color: 'text-violet-700', glow: 'bg-violet-50' }
          ].map(metric => (
            <article key={metric.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={cn('absolute -right-5 -top-6 h-24 w-24 rounded-full blur-2xl', metric.glow)} />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-[#10231f]">{loading ? '—' : metric.value ?? 0}</p>
                  <p className="mt-1 text-[10px] font-medium text-slate-500">{metric.detail}</p>
                </div>
                <div className={cn('rounded-xl bg-slate-50 p-3', metric.color)}><metric.icon size={18} /></div>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.75fr)]">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Fleet visibility</p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-[#10231f]">Live runner map</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-[9px] font-bold text-slate-600">
                <LocateFixed size={12} className="text-emerald-600" /> {mapRiders.length} fresh GPS positions
              </span>
            </div>
            <div className="h-[390px] p-3 sm:h-[500px] sm:p-4">
              <LiveDispatchMap
                riders={mapRiders}
                showDemand={false}
                activeRoutes={activeMapRoutes}
                onSelectRider={rider => setSelectedRider(
                  data?.riders.find(item => item.id === Number(rider.id)) || null
                )}
              />
            </div>
            {activeRoute && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-[10px] font-semibold text-slate-700 sm:px-6">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1 w-8 rounded-full" style={{ backgroundColor: activeMapRoutes[0]?.color }} />
                  OSRM route · Order #{activeRoute.orderId} · {activeRoute.riderName}
                </span>
                <span>{activeRoute.distanceKm} road km · {activeRoute.durationMinutes} min estimated</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[9px] font-semibold text-slate-500 sm:px-6">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Available</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> On delivery</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-500" /> Location older than 5 minutes hidden</span>
              <span>Approximate GPS · OpenStreetMap tiles</span>
            </div>
          </article>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <article className="rounded-2xl border border-white/[0.08] bg-[#0d1728] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-300">Service pulse</p>
                  <h2 className="mt-1 text-lg font-black tracking-tight">Recorded completions</h2>
                </div>
                <CalendarClock size={18} className="text-violet-300" />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Delivered status events · last 7 days</p>
              <div className="mt-6 flex h-32 items-end gap-2" aria-label="Daily delivered status events for the last seven days">
                {dailyCompletions.map(day => {
                  const height = Math.max(8, (day.count / maxCompletions) * 100);
                  return (
                    <div key={day.date.toISOString()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[9px] font-bold text-slate-400">{day.count}</span>
                      <div className="w-full rounded-t-md bg-gradient-to-t from-amber-600 to-amber-400" style={{ height: `${height}%` }} />
                      <span className="text-[8px] font-semibold text-slate-500">{day.date.toLocaleDateString([], { weekday: 'short' })}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 border-t border-white/[0.07] pt-3 text-[9px] leading-4 text-slate-500">
                This chart uses recorded delivery status events, not projected performance. Earlier deliveries before event logging are not included.
              </p>
            </article>

            <article className="rounded-2xl border border-white/[0.08] bg-[#0d1728] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">Verified fleet</p>
                  <h2 className="mt-1 text-lg font-black tracking-tight">Rider availability</h2>
                </div>
                <Link href="/lord/riders" className="text-[9px] font-bold text-sky-300 hover:text-sky-200">Manage fleet →</Link>
              </div>
              {selectedRider && (
                <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/[0.07] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black">{selectedRider.rider_name}</p>
                      <p className="mt-1 text-[9px] text-slate-400">{selectedRider.vehicle_type || 'Vehicle not set'} · {selectedRider.status}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedRider(null)} className="text-xs text-slate-400 hover:text-white" aria-label="Close rider details">×</button>
                  </div>
                  <p className="mt-2 text-[9px] text-slate-400">GPS {shortAge(selectedRider.location_updated_at)} · Battery {formatBatteryTelemetry(selectedRider.battery_level, selectedRider.battery_updated_at)}</p>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {onlineRiders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
                    <Users className="mx-auto h-5 w-5 text-slate-600" />
                    <p className="mt-2 text-xs font-bold text-slate-400">No verified riders have a fresh online heartbeat.</p>
                  </div>
                ) : onlineRiders.slice(0, 5).map(rider => (
                  <button
                    type="button"
                    key={rider.id}
                    onClick={() => setSelectedRider(rider)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:border-white/15 hover:bg-white/[0.05]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black', rider.status === 'Delivering' ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300')}>
                        {rider.rider_name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-black">{rider.rider_name}</span>
                        <span className="mt-1 block text-[9px] text-slate-500">{rider.vehicle_type || 'Vehicle not set'} · {rider.status}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[9px] font-bold text-slate-400">
                      <BatteryMedium size={12} className={!isBatteryTelemetryFresh(rider.battery_level, rider.battery_updated_at) ? 'text-slate-500' : Number(rider.battery_level) < 20 ? 'text-rose-300' : 'text-emerald-300'} />
                      {formatBatteryTelemetry(rider.battery_level, rider.battery_updated_at)}
                    </span>
                  </button>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
          <article className="rounded-2xl border border-white/[0.08] bg-[#0d1728]">
            <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-300">Order control</p>
                <h2 className="mt-1 text-lg font-black tracking-tight">Delivery operations</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 sm:w-56">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, customer, rider" className="h-10 rounded-xl border-white/10 bg-white/[0.04] pl-9 text-xs text-white placeholder:text-slate-500 focus-visible:ring-sky-400/30" />
                </div>
                <select
                  value={filter}
                  onChange={event => setFilter(event.target.value as QueueFilter)}
                  className="h-10 rounded-xl border border-white/10 bg-[#101d31] px-3 text-xs font-bold text-slate-200 outline-none focus:border-sky-400/40"
                  aria-label="Filter delivery orders"
                >
                  <option value="active">In progress</option>
                  <option value="dispatch">Awaiting dispatch</option>
                  <option value="completed">Delivered</option>
                  <option value="all">All statuses</option>
                </select>
              </div>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {loading ? (
                <div className="p-12 text-center text-sm font-semibold text-slate-500">Connecting to delivery operations…</div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="mx-auto h-6 w-6 text-slate-600" />
                  <p className="mt-3 text-sm font-bold text-slate-400">{error ? 'Orders are unavailable.' : 'No orders match this view.'}</p>
                </div>
              ) : filteredOrders.map(order => {
                const StatusIcon = statusIcon(order.status);
                return (
                  <article key={order.id} className="p-4 transition hover:bg-white/[0.025] sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black">Order #{order.id}</span>
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider', statusTone(order.status))}>
                            <StatusIcon size={11} /> {order.status}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-500">{formatTime(order.created_at)}</span>
                        </div>
                        <p className="mt-2 truncate text-xs font-bold text-slate-200">{order.customer_name} <span className="font-medium text-slate-500">· {order.customer_phone}</span></p>
                        <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-slate-400">
                          <MapPin size={12} className="mt-0.5 shrink-0 text-sky-300" /> {getAddress(order)}
                        </p>
                        {order.delivery_instructions && <p className="mt-1 text-[9px] text-slate-500">Note: {order.delivery_instructions}</p>}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[9px] font-semibold text-slate-500">
                          <span className="inline-flex items-center gap-1.5"><Wallet size={11} /> Total {formatPrice(Number(order.total_price))}</span>
                          <span className="inline-flex items-center gap-1.5"><Truck size={11} /> Fee {order.delivery_cost == null ? 'Not set' : formatPrice(Number(order.delivery_cost))}</span>
                          {order.delivery_eta_minutes != null && <span className="inline-flex items-center gap-1.5"><Clock3 size={11} /> ETA {order.delivery_eta_minutes} min</span>}
                        </div>
                        {order.status === 'Cancelled' ? (
                          <div className="mt-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-rose-300">
                            <span className="h-2 w-2 rounded-full bg-rose-400" /> Delivery cancelled
                          </div>
                        ) : (
                          <div className="mt-4 max-w-xl" aria-label={`Delivery progress for order ${order.id}: ${order.status}`}>
                            <div className="relative">
                              <div className="absolute left-[3%] right-[3%] top-[5px] h-1 rounded-full bg-white/10" />
                              <div
                                className="absolute left-[3%] top-[5px] h-1 rounded-full transition-all"
                                style={{
                                  width: `${Math.max(0, deliveryFlowIndex(order.status)) / (deliveryFlowSteps.length - 1) * 94}%`,
                                  backgroundColor: deliveryFlowColor(order.status)
                                }}
                              />
                              <ol className="relative flex justify-between">
                                {deliveryFlowSteps.map((step, index) => {
                                  const currentStep = deliveryFlowIndex(order.status);
                                  const passed = currentStep >= index;
                                  return (
                                    <li key={step} className="flex w-[20%] flex-col items-center gap-1.5">
                                      <span
                                        className="h-3 w-3 rounded-full border-2 border-[#0d1728]"
                                        style={{ backgroundColor: passed ? (index === currentStep ? deliveryFlowColor(order.status) : '#22c55e') : '#475569' }}
                                      />
                                      <span className={cn(
                                        'text-center text-[7px] font-bold leading-3 sm:text-[8px]',
                                        index === currentStep ? 'text-white' : passed ? 'text-emerald-300' : 'text-slate-500'
                                      )}>{step === 'Out for Delivery' ? 'On road' : step}</span>
                                    </li>
                                  );
                                })}
                              </ol>
                            </div>
                          </div>
                        )}
                        {order.rider_phone && ['Dispatched', 'Picked Up', 'Out for Delivery'].includes(order.status) && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={routeLoadingOrder === order.id}
                            onClick={() => void showRoute(order.id)}
                            className="mt-3 h-8 rounded-lg border-amber-200 bg-amber-50 px-3 text-[9px] font-bold text-amber-800 hover:bg-amber-100"
                          >
                            {routeLoadingOrder === order.id
                              ? <><RefreshCw size={11} className="mr-1.5 animate-spin" /> Calculating road route</>
                              : <><Route size={11} className="mr-1.5" /> Show OSRM route</>}
                          </Button>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {order.rider_name ? (
                          <Link href={data?.riders.find(rider => rider.rider_phone === order.rider_phone) ? `/lord/riders/${data.riders.find(rider => rider.rider_phone === order.rider_phone)?.id}` : '/lord/riders'} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">
                            <CircleDot size={12} className={order.status === 'Delivered' ? 'text-emerald-300' : 'text-sky-300'} />
                            {order.rider_name}
                          </Link>
                        ) : <span className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-[9px] font-bold text-amber-200">No rider assigned</span>}
                        <a href={`tel:${order.customer_phone}`} aria-label={`Call ${order.customer_name}`} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold text-slate-300 hover:bg-white/[0.08]">
                          <Phone size={12} /> Contact
                        </a>
                        <Link href={`/track?id=${order.id}`} target="_blank" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold text-slate-300 hover:bg-white/[0.08]">
                          <ExternalLink size={12} /> Track view
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3 text-[9px] font-semibold text-slate-500">
              <span>Showing latest {data?.orders.length || 0} operational orders</span>
              <Link href="/lord/orders" className="text-sky-300 hover:text-sky-200">Open full order desk →</Link>
            </div>
          </article>

          <article className="rounded-2xl border border-white/[0.08] bg-[#0d1728]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] p-5 sm:px-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">Guarded dispatch</p>
                <h2 className="mt-1 text-lg font-black tracking-tight">Paid orders to assign</h2>
              </div>
              <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[9px] font-black text-amber-200">{dispatchJobs.length} queued</span>
            </div>
            <div className="max-h-[650px] space-y-3 overflow-y-auto p-4 sm:p-5">
              {dispatchJobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-7 text-center">
                  <ShieldCheck className="mx-auto h-5 w-5 text-emerald-300" />
                  <p className="mt-2 text-xs font-bold text-slate-300">{dispatchError ? 'Dispatch checks unavailable.' : 'No payment-confirmed orders are ready for dispatch.'}</p>
                  <p className="mt-1 text-[9px] leading-4 text-slate-500">{dispatchError || 'Eligible orders appear here after server payment verification.'}</p>
                </div>
              ) : dispatchJobs.map(job => {
                const selectedOverride = override[job.id] || { phone: '', reason: '' };
                const recommendation = job.recommendedRider;
                const busy = actionOrder === job.id;
                return (
                  <div key={job.id} className="rounded-xl border border-white/[0.07] bg-[#101d31] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black">Order #{job.id}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{job.customer_name} · {formatPrice(Number(job.total_price))}</p>
                        <p className="mt-1 text-[9px] font-semibold text-emerald-300">Payment confirmed · {job.payment_method}</p>
                      </div>
                      <span className={cn('rounded-full border px-2 py-1 text-[8px] font-black uppercase', job.fulfillment.ready ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-amber-200')}>
                        {job.fulfillment.ready ? 'Merchant ready' : 'Review needed'}
                      </span>
                    </div>
                    {recommendation ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-sky-300/10 bg-sky-300/[0.04] p-3">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-wider text-sky-200">Recommended rider</p>
                          <p className="mt-1 text-xs font-bold">{recommendation.riderName}</p>
                        </div>
                        <div className="text-right text-[9px] text-slate-400">
                          <p>{recommendation.distanceKm == null ? 'Road distance unavailable' : `${recommendation.distanceKm} road km to pickup`}</p>
                          {recommendation.etaMinutes != null && <p className="mt-1">{recommendation.etaMinutes} min estimated pickup time</p>}
                          <p className="mt-1">{recommendation.activeLoad}/{recommendation.maxDeliveries} active</p>
                        </div>
                      </div>
                    ) : <p className="mt-3 text-[9px] text-amber-200">{job.riderAvailabilityReason || 'No eligible rider is currently available.'}</p>}
                    {!job.fulfillment.ready && job.fulfillment.reasons.length > 0 && (
                      <ul className="mt-3 space-y-1 text-[9px] leading-4 text-amber-100/80">
                        {job.fulfillment.reasons.slice(0, 3).map(reason => <li key={reason}>• {reason}</li>)}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={!job.fulfillment.ready || !recommendation || busy}
                        onClick={() => void assignRider(job, 'automatic')}
                        className="h-9 rounded-lg bg-sky-400 px-3 text-[9px] font-black uppercase tracking-wide text-[#061121] hover:bg-sky-300 disabled:opacity-40"
                      >
                        {busy ? <RefreshCw size={13} className="mr-2 animate-spin" /> : <ArrowUpRight size={13} className="mr-1.5" />}
                        Assign recommended
                      </Button>
                      {!job.fulfillment.ready && (
                        <Button type="button" variant="outline" disabled={busy} onClick={() => void retryAllocation(job)} className="h-9 rounded-lg border-amber-300/20 bg-transparent px-3 text-[9px] font-bold text-amber-100 hover:bg-amber-300/10">
                          <RefreshCw size={12} className="mr-1.5" /> Retry merchant allocation
                        </Button>
                      )}
                    </div>
                    {job.fulfillment.ready && job.riderCandidates.length > 0 && (
                      <details className="mt-3 border-t border-white/[0.07] pt-3">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[9px] font-bold text-slate-400 hover:text-white">
                          Manual override <ChevronDown size={12} />
                        </summary>
                        <div className="mt-3 space-y-2">
                          <select
                            value={selectedOverride.phone}
                            onChange={event => setOverride(previous => ({ ...previous, [job.id]: { ...selectedOverride, phone: event.target.value } }))}
                            className="h-9 w-full rounded-lg border border-white/10 bg-[#0b1423] px-3 text-[10px] text-slate-200 outline-none"
                            aria-label={`Select rider for order ${job.id}`}
                          >
                            <option value="">Choose an eligible rider</option>
                            {job.riderCandidates.map(candidate => (
                              <option key={candidate.riderPhone} value={candidate.riderPhone}>{candidate.riderName} · {candidate.activeLoad}/{candidate.maxDeliveries} active</option>
                            ))}
                          </select>
                          <Input
                            value={selectedOverride.reason}
                            onChange={event => setOverride(previous => ({ ...previous, [job.id]: { ...selectedOverride, reason: event.target.value } }))}
                            placeholder="Required override reason (min 8 characters)"
                            className="h-9 rounded-lg border-white/10 bg-[#0b1423] text-[10px] text-white placeholder:text-slate-600"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!selectedOverride.phone || selectedOverride.reason.trim().length < 8 || busy}
                            onClick={() => void assignRider(job, 'override', selectedOverride.phone, selectedOverride.reason)}
                            className="h-9 rounded-lg border-white/10 bg-white/[0.04] px-3 text-[9px] font-bold text-white hover:bg-white/[0.08] disabled:opacity-40"
                          >
                            <ArrowDownRight size={13} className="mr-1.5" /> Override with audit reason
                          </Button>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/[0.07] p-4 text-[9px] leading-4 text-slate-500">
              Assignments revalidate payment, merchant acceptance, rider verification, heartbeat and workload on the server. Overrides cannot bypass fulfilment checks.
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <article className="rounded-2xl border border-white/[0.08] bg-[#0d1728]">
            <div className="flex items-center justify-between border-b border-white/[0.07] p-5 sm:px-6">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">Audit trail</p>
                <h2 className="mt-1 text-lg font-black tracking-tight">Recent delivery activity</h2>
              </div>
              <Activity size={18} className="text-emerald-300" />
            </div>
            <div className="divide-y divide-white/[0.06]">
              {(data?.activity || []).slice(0, 8).map(event => {
                const Icon = statusIcon(event.to_status);
                return (
                  <div key={event.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-sky-300"><Icon size={14} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold text-slate-200">Order #{event.order_id} · {event.to_status}</p>
                      <p className="mt-1 text-[9px] text-slate-500">{event.actor_type}{event.actor_id ? ` · ${event.actor_id}` : ''}</p>
                    </div>
                    <time className="shrink-0 text-[9px] font-semibold text-slate-500">{formatTime(event.created_at)}</time>
                  </div>
                );
              })}
              {!data?.activity.length && (
                <p className="p-8 text-center text-xs font-semibold text-slate-500">No delivery status events recorded in the last 7 days.</p>
              )}
            </div>
            <div className="border-t border-white/[0.07] px-5 py-3 text-[9px] text-slate-500 sm:px-6">
              Status history is written by the delivery lifecycle trigger and is read-only here.
            </div>
          </article>

          <article className="rounded-2xl border border-white/[0.08] bg-[#0d1728] p-5 sm:p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-300">Operations shortcuts</p>
            <h2 className="mt-1 text-lg font-black tracking-tight">What needs attention?</h2>
            <div className="mt-4 space-y-2">
              <Link href="/lord/dispatch" className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:bg-white/[0.05]">
                <span className="flex items-center gap-3"><span className="rounded-lg bg-amber-400/10 p-2 text-amber-300"><Clock3 size={14} /></span><span><span className="block text-[10px] font-bold">Review dispatch queue</span><span className="mt-1 block text-[9px] text-slate-500">{data?.metrics.waitingDispatch ?? 0} paid orders awaiting assignment</span></span></span>
                <ArrowUpRight size={14} className="text-slate-500" />
              </Link>
              <Link href="/lord/riders" className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:bg-white/[0.05]">
                <span className="flex items-center gap-3"><span className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300"><ShieldCheck size={14} /></span><span><span className="block text-[10px] font-bold">Rider onboarding & performance</span><span className="mt-1 block text-[9px] text-slate-500">{onlineRiders.length} verified and recently online</span></span></span>
                <ArrowUpRight size={14} className="text-slate-500" />
              </Link>
              <Link href="/lord/orders" className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:bg-white/[0.05]">
                <span className="flex items-center gap-3"><span className="rounded-lg bg-violet-400/10 p-2 text-violet-300"><Package size={14} /></span><span><span className="block text-[10px] font-bold">Order support & resolution</span><span className="mt-1 block text-[9px] text-slate-500">Review payment and order exceptions</span></span></span>
                <ArrowUpRight size={14} className="text-slate-500" />
              </Link>
            </div>
            <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-4 text-slate-500">
              Road-route ETA, route optimization, customer delivery OTP, photo proof and automatic reassignment are not yet connected. This command centre reports only verified data currently available in Online Bar.
            </div>
          </article>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4 text-[9px] font-semibold text-slate-600">
          <span>Protected operations · Server-verified data · No fabricated ETA or on-time score</span>
          <span>{data?.orders.length || 0} recent orders · {data?.riders.length || 0} registered riders · {mapRiders.length} fresh locations</span>
        </footer>
      </div>
    </main>
  );
}
