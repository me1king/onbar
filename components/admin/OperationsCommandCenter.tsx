'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, ClipboardList, FileCheck2, RefreshCcw, ShoppingBag, Truck, Users, WalletCards, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import CustomerLiveLocationMapPanel from '@/components/admin/CustomerLiveLocationMapPanel';

const LiveDispatchMap = dynamic(() => import('@/components/admin/dispatch/LiveDispatchMap'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center rounded-2xl bg-slate-100 text-xs font-black uppercase tracking-widest text-slate-400">Loading live fleet map...</div>
});

type LiveData = {
  metrics?: {
    activeSessions: number;
    ordersToday: number;
    activeDeliveries: number;
    cartsWithItems: number;
  };
  orders?: Array<{ id: number; status: string; customer_name: string | null; created_at: string }>;
  error?: string;
};

type DispatchMapRider = {
  id: number | string;
  lat?: number | null;
  lng?: number | null;
  status: string;
  rider_name: string;
  battery_level: number;
  current_speed?: number;
};

type DispatchMapData = {
  riders: DispatchMapRider[];
  demandZones: Array<{ lat: number; lng: number; intensity: number }>;
};

const modules = [
  { title: 'Fleet Command', description: 'Live rider map, compliance, assignment, and delivery controls.', href: '/lord/dispatch', icon: Truck },
  { title: 'Rider compliance', description: 'Review verification status, licence, vehicle, and fresh GPS activity.', href: '/lord/riders', icon: FileCheck2 },
  { title: 'Delivery ledger', description: 'Monitor delivery events, waiting orders, active trips, and completed deliveries.', href: '/lord/delivery', icon: WalletCards },
  { title: 'Dispatch queue', description: 'Review payment-confirmed orders and assign eligible riders.', href: '/lord/orders', icon: Truck },
  { title: 'Live customer feed', description: 'See active sessions, checkouts, carts, and order events.', href: '/lord/behavior/live', icon: Activity },
  { title: 'Merchant onboarding', description: 'Review approved businesses and their fulfillment status.', href: '/lord/merchants', icon: ShoppingBag },
  { title: 'Task control', description: 'Create and close internal operations work.', href: '/lord/operations/tasks', icon: ClipboardList },
  { title: 'Cellar hubs', description: 'Manage regional inventory and rider coverage.', href: '/lord/operations/hubs', icon: Users },
  { title: 'Supply network', description: 'Open vendors, sourcing, and distributor operations.', href: '/lord/operations/vendors', icon: ShoppingBag }
];

export default function OperationsCommandCenter() {
  const [data, setData] = React.useState<LiveData>({});
  const [dispatchMap, setDispatchMap] = React.useState<DispatchMapData>({ riders: [], demandZones: [] });
  const [dispatchError, setDispatchError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [liveResponse, dispatchResponse] = await Promise.all([
        fetch('/api/admin/behavior/live', { cache: 'no-store' }),
        fetch('/api/admin/dispatch', { cache: 'no-store' })
      ]);
      const result = await liveResponse.json() as LiveData;
      const dispatchResult = await dispatchResponse.json() as {
        error?: string;
        riders?: DispatchMapRider[];
        demandZones?: DispatchMapData['demandZones'];
      };
      if (!liveResponse.ok) throw new Error(result.error || 'Live operations data could not be loaded.');
      setData(result);
      if (!dispatchResponse.ok) {
        setDispatchError(dispatchResult.error || 'Live fleet map data could not be loaded.');
      } else {
        setDispatchError(null);
        setDispatchMap({
          riders: dispatchResult.riders || [],
          demandZones: dispatchResult.demandZones || []
        });
      }
    } catch (error) {
      console.error('[Operations] Could not load live operations:', error);
      setData({ error: error instanceof Error ? error.message : 'Live operations data could not be loaded.' });
      setDispatchError(error instanceof Error ? error.message : 'Live fleet map data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const metrics = data.metrics || { activeSessions: 0, ordersToday: 0, activeDeliveries: 0, cartsWithItems: 0 };
  const metricCards: Array<{ label: string; value: number; Icon: LucideIcon }> = [
    { label: 'People online', value: metrics.activeSessions, Icon: Users },
    { label: 'Orders today', value: metrics.ordersToday, Icon: ShoppingBag },
    { label: 'Active deliveries', value: metrics.activeDeliveries, Icon: Truck },
    { label: 'Carts waiting', value: metrics.cartsWithItems, Icon: ClipboardList }
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Operations control room</p>
          <h1 className="mt-2 text-4xl font-black uppercase tracking-tighter text-slate-950">Run the shift</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">One live starting point for customers, orders, riders, merchants, and supply operations.</p>
        </div>
        <Button onClick={() => void refresh()} variant="outline" className="h-11 rounded-xl bg-white text-xs font-black uppercase">
          <RefreshCcw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </header>

      {data.error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{data.error}</p>}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map(({ label, value, Icon }) => (
          <Card key={String(label)} className="rounded-2xl border-slate-100 bg-white p-5 shadow-sm">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-5 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
          </Card>
        ))}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="rounded-2xl border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-primary">Live order flow</p><h2 className="mt-1 text-xl font-black uppercase tracking-tight">Orders needing attention</h2></div>
            <Link href="/lord/orders" className="text-xs font-black uppercase text-primary">Open queue <ArrowRight className="ml-1 inline h-3 w-3" /></Link>
          </div>
          <div className="mt-5 space-y-3">
            {!data.orders?.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No orders are visible in the live feed yet.</p>}
            {data.orders?.slice(0, 6).map(order => (
              <Link key={order.id} href={`/lord/orders?orderId=${order.id}`} className="flex items-center justify-between rounded-xl border border-slate-100 p-4 transition hover:border-primary/30 hover:bg-primary/[0.03]">
                <div><p className="text-sm font-black text-slate-900">Order #{order.id}</p><p className="text-xs text-slate-500">{order.customer_name || 'Customer'} · {new Date(order.created_at).toLocaleTimeString()}</p></div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-600">{order.status}</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="rounded-2xl border-slate-100 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Operational modules</p>
          <div className="mt-5 space-y-2">
            {modules.map(module => {
              const Icon = module.icon;
              return <Link key={module.href} href={module.href} className="flex items-center gap-3 rounded-xl border border-white/10 p-3 transition hover:bg-white/10"><Icon className="h-4 w-4 text-amber-300" /><span className="min-w-0 flex-1"><strong className="block text-xs font-black uppercase">{module.title}</strong><small className="block truncate text-[10px] text-white/50">{module.description}</small></span><ArrowRight className="h-3 w-3 text-white/40" /></Link>;
            })}
          </div>
        </Card>
      </section>

      <section className="mt-5">
        <CustomerLiveLocationMapPanel />
      </section>

      <section className="mt-5">
        <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Current operational map</p>
              <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Fleet position and demand</h2>
              <p className="mt-1 text-xs text-slate-500">The same verified rider GPS and demand zones used by Fleet Command.</p>
            </div>
            <Link href="/lord/dispatch" className="text-xs font-black uppercase text-primary">Open Fleet Command <ArrowRight className="ml-1 inline h-3 w-3" /></Link>
          </div>
          {dispatchError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{dispatchError}</p>}
          <div className="mt-5 h-[420px] overflow-hidden rounded-2xl">
            <LiveDispatchMap riders={dispatchMap.riders} demandZones={dispatchMap.demandZones} showDemand />
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {[
          { title: 'Dispatch rule', text: 'Only verified riders with a fresh heartbeat, valid location, capacity, and compliant merchant allocation can be assigned.', href: '/lord/dispatch' },
          { title: 'Compliance gate', text: 'Use Rider Fleet to review verification and location freshness before changing operational status.', href: '/lord/riders' },
          { title: 'Evidence trail', text: 'Assignments and delivery state changes are recorded in the dispatch and delivery event history.', href: '/lord/delivery' }
        ].map(item => (
          <Link key={item.title} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md">
            <p className="text-xs font-black uppercase tracking-widest text-primary">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
            <span className="mt-4 inline-flex items-center text-xs font-black uppercase text-slate-900">Open module <ArrowRight className="ml-1 h-3 w-3" /></span>
          </Link>
        ))}
      </section>
    </main>
  );
}
