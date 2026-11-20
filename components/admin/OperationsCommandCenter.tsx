'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, Bell, ClipboardList, FileCheck2, RefreshCcw, ShoppingBag, Truck, Users, WalletCards, type LucideIcon } from 'lucide-react';
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
  battery_level: number | null;
  battery_updated_at?: string | null;
  current_speed?: number;
};

type DispatchMapData = {
  riders: DispatchMapRider[];
  demandZones: Array<{ lat: number; lng: number; intensity: number }>;
};

type FlowStage = { status: string; label: string };
type OrderFlow = {
  id: number;
  status: string;
  createdAt: string;
  paymentMethod: string | null;
  riderName: string | null;
  riderPhone: string | null;
  retryableCustomerChannels: string[];
  failedCustomerChannels: string[];
  retryableMerchantAlerts: number;
  events: FlowEvent[];
  stages: {
    order: FlowStage;
    payment: FlowStage;
    merchant: FlowStage;
    dispatch: FlowStage;
    delivery: FlowStage;
    notifications: FlowStage;
    merchantNotifications: FlowStage;
  };
};
type FlowEvent = {
  id: string;
  orderId: number;
  stage: string;
  title: string;
  detail: string;
  status: string;
  occurredAt: string;
  channel?: string;
  notificationStatus?: string;
};
type DiagnosticLink = { href: string; label: string; external?: boolean };
type DiagnosticPanel = {
  title: string;
  summary: string;
  details: string[];
  links?: DiagnosticLink[];
  orderId?: number;
  events?: FlowEvent[];
  channels?: string[];
};
type RiderCandidate = {
  riderPhone: string;
  riderName: string;
  activeLoad: number;
  maxDeliveries: number;
  distanceKm: number | null;
  etaMinutes: number | null;
};
type FlowData = {
  checkedAt: string;
  summary: {
    recentOrders: number;
    paymentsVerified: number;
    merchantsReady: number;
    ridersAssigned: number;
    dispatchManualReview: number;
    customerNotificationsSent: number;
    customerNotificationsFailed: number;
    merchantNotificationsSent: number;
    merchantNotificationsFailed: number;
    flowsNeedingAttention: number;
  };
  orders: OrderFlow[];
  timeline: FlowEvent[];
  workers: Array<{ key: string; status: string; lastSeenAt: string | null; diagnostic: string; requirements: string[] }>;
  providers: Record<string, boolean>;
  providerDiagnostics: Record<string, { diagnostic: string; requirements: string[] }>;
  internalNotificationBridge: boolean;
  internalNotificationBridgeDiagnostic: string;
  internalNotificationBridgeRequirements: string[];
  permissions: { manageOrders: boolean; manageCommunications: boolean };
  notificationRules: {
    enabledStatuses: number;
    totalStatuses: number;
    enabledChannels: string[];
    available: boolean;
    diagnostic: string;
  };
  warnings: string[];
};

function flowStatusStyle(status: string) {
  if (status === 'success' || status === 'online' || status === 'configured') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'failed' || status === 'stale' || status === 'unavailable') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (status === 'info') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

const modules = [
  { title: 'Fleet Command', description: 'Live rider map, compliance, assignment, and delivery controls.', href: '/lord/dispatch', icon: Truck },
  { title: 'Rider compliance', description: 'Review verification status, licence, vehicle, and fresh GPS activity.', href: '/lord/riders', icon: FileCheck2 },
  { title: 'Delivery ledger', description: 'Monitor delivery events, waiting orders, active trips, and completed deliveries.', href: '/lord/delivery', icon: WalletCards },
  { title: 'Dispatch queue', description: 'Review payment-confirmed orders and assign eligible riders.', href: '/lord/orders', icon: Truck },
  { title: 'Notification automation', description: 'Configure customer message rules and inspect channel delivery attempts.', href: '/lord/communications/automation', icon: Bell },
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
  const [flow, setFlow] = React.useState<FlowData | null>(null);
  const [flowError, setFlowError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<{ orderId: number; message: string; error: boolean } | null>(null);
  const [diagnosticPanel, setDiagnosticPanel] = React.useState<DiagnosticPanel | null>(null);
  const [confirmRetryChannel, setConfirmRetryChannel] = React.useState<string | null>(null);
  const [reassignOrder, setReassignOrder] = React.useState<OrderFlow | null>(null);
  const [riderCandidates, setRiderCandidates] = React.useState<RiderCandidate[]>([]);
  const [replacementRiderPhone, setReplacementRiderPhone] = React.useState('');
  const [reassignmentReason, setReassignmentReason] = React.useState('');
  const [reassignmentLoading, setReassignmentLoading] = React.useState(false);
  const [reassignmentError, setReassignmentError] = React.useState<string | null>(null);

  const refreshFlow = React.useCallback(async () => {
    try {
      const response = await fetch('/api/admin/operations/flow', { cache: 'no-store' });
      const result = await response.json() as FlowData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Order-to-notification flow could not be loaded.');
      setFlow(result);
      setFlowError(null);
    } catch (error) {
      console.error('[Operations] Could not load order-to-notification flow:', error);
      setFlow(null);
      setFlowError(error instanceof Error ? error.message : 'Order-to-notification flow could not be loaded.');
    }
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    void refreshFlow();
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
  }, [refreshFlow]);

  const sendAdminAction = async (
    order: OrderFlow,
    operation: string,
    label: string,
    extra: Record<string, string> = {}
  ) => {
    const key = `${operation}:${order.id}`;
    setActionBusy(key);
    setActionNotice(null);
    try {
      const response = await fetch('/api/admin/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, operation, ...extra }),
        cache: 'no-store'
      });
      const result = await response.json() as {
        error?: string;
        warning?: string;
        message?: string;
        allocation?: { fully_allocated?: boolean };
      };
      if (!response.ok) throw new Error(result.error || `${label} could not be completed.`);
      setActionNotice({
        orderId: order.id,
        message: result.warning || result.message || `${label} completed.`,
        error: Boolean(result.warning || result.allocation?.fully_allocated === false)
      });
      await refreshFlow();
    } catch (error) {
      console.error(`[Operations] ${label} failed for order #${order.id}:`, error);
      setActionNotice({
        orderId: order.id,
        message: error instanceof Error ? error.message : `${label} could not be completed.`,
        error: true
      });
    } finally {
      setActionBusy(null);
    }
  };

  const retryCustomerNotice = async (order: OrderFlow, channel: string) => {
    const key = `customer:${order.id}:${channel}`;
    setActionBusy(key);
    setActionNotice(null);
    try {
      const response = await fetch('/api/admin/notify-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status: order.status, retryChannel: channel }),
        cache: 'no-store'
      });
      const result = await response.json() as {
        error?: string;
        skipped?: string[];
        results?: Array<{ status?: string; error?: string; channel?: string }>;
      };
      const failedResult = result.results?.find(item => item.status === 'failed' || item.status === 'skipped');
      if (!response.ok) throw new Error(failedResult?.error || result.error || 'Customer notification could not be retried.');
      const failed = result.results?.some(item => item.status === 'failed' || item.status === 'skipped');
      setActionNotice({
        orderId: order.id,
        message: result.skipped?.join(', ') || failedResult?.error
          || (failed ? 'Retry returned a failed or skipped channel; check notification settings and consent.' : `${channel} retry completed.`),
        error: Boolean(result.skipped?.length || failed)
      });
      await refreshFlow();
    } catch (error) {
      console.error(`[Operations] Customer ${channel} retry failed for order #${order.id}:`, error);
      setActionNotice({
        orderId: order.id,
        message: error instanceof Error ? error.message : 'Customer notification could not be retried.',
        error: true
      });
    } finally {
      setActionBusy(null);
    }
  };

  const openSystemDiagnostic = (
    title: string,
    summary: string,
    details: string[],
    links: DiagnosticLink[] = []
  ) => {
    setConfirmRetryChannel(null);
    setDiagnosticPanel({ title, summary, details, links });
  };

  const openOrderDiagnostic = (order: OrderFlow, stageLabel?: string) => {
    const stageKey = stageLabel?.toLowerCase();
    const stageNames: Record<string, string[]> = {
      order: ['order'],
      payment: ['payment'],
      merchant: ['merchant'],
      dispatch: ['dispatch'],
      delivery: ['delivery'],
      'customer notice': ['customer_notification'],
      'merchant alert': ['merchant_notification']
    };
    const stageKeys: Record<string, keyof OrderFlow['stages']> = {
      order: 'order',
      payment: 'payment',
      merchant: 'merchant',
      dispatch: 'dispatch',
      delivery: 'delivery',
      'customer notice': 'notifications',
      'merchant alert': 'merchantNotifications'
    };
    const events = order.events.filter(event => !stageKey || stageNames[stageKey]?.includes(event.stage));
    const failedEvents = events.filter(event => event.stage === 'customer_notification' && event.status === 'failed');
    const channels = [...new Set(failedEvents.map(event => event.channel).filter((channel): channel is string => Boolean(channel)))];
    const stage = stageKey ? stageKeys[stageKey] : undefined;
    setConfirmRetryChannel(null);
    setDiagnosticPanel({
      title: stageLabel ? `Order #${order.id} · ${stageLabel} diagnosis` : `Order #${order.id} · diagnosis`,
      summary: stageLabel
        ? `${stageLabel}: ${stage ? order.stages[stage].label : order.status}. Current order status: ${order.status}.`
        : `Current status: ${order.status}. Review the recorded events and delivery errors below.`,
      details: events.length ? [] : ['No event-level diagnosis was recorded for this stage. Open the order record to review its current data.'],
      links: [
        { href: `/lord/orders?orderId=${order.id}`, label: 'Open order record' },
        { href: '/lord/communications/automation', label: 'Open messaging and delivery history' }
      ],
      orderId: order.id,
      events,
      channels
    });
  };

  const openMetricDiagnostic = (label: string, value: number) => {
    const allEvents = flow?.orders.flatMap(order => order.events) || [];
    const relevantEvents = label.toLowerCase().includes('customer notice')
      ? allEvents.filter(event => event.stage === 'customer_notification' && (label.includes('failed') ? event.status === 'failed' : event.status === 'success'))
      : label.toLowerCase().includes('merchant alert')
        ? allEvents.filter(event => event.stage === 'merchant_notification' && (label.includes('failed') ? event.status === 'failed' : event.status === 'success'))
        : label.toLowerCase().includes('dispatch')
          ? allEvents.filter(event => event.stage === 'dispatch' && (label.includes('review') ? event.status === 'failed' : event.status === 'success'))
          : allEvents;
    setConfirmRetryChannel(null);
    setDiagnosticPanel({
      title: `${label} · diagnosis`,
      summary: `${value} recorded in the latest order flow. Select an event below for its recorded reason and order details.`,
      details: relevantEvents.length ? [] : ['No matching order events are available in the latest 20 orders.'],
      links: [{ href: '/lord/communications/automation', label: 'Open messaging and delivery history' }],
      events: relevantEvents
    });
  };

  const openRiderReassignment = async (order: OrderFlow) => {
    setReassignOrder(order);
    setRiderCandidates([]);
    setReplacementRiderPhone('');
    setReassignmentReason('');
    setReassignmentError(null);
    setReassignmentLoading(true);
    try {
      const response = await fetch(`/api/admin/dispatch?orderId=${order.id}`, { cache: 'no-store' });
      const result = await response.json() as {
        error?: string;
        job?: { riderCandidates?: RiderCandidate[]; fulfillment?: { ready: boolean; reasons: string[] } };
      };
      if (!response.ok || !result.job) throw new Error(result.error || 'Replacement rider options could not be loaded.');
      if (!result.job.fulfillment?.ready) {
        throw new Error(result.job.fulfillment?.reasons.join(' ') || 'Merchant readiness could not be verified.');
      }
      const candidates = (result.job.riderCandidates || [])
        .filter(candidate => candidate.riderPhone !== order.riderPhone);
      setRiderCandidates(candidates);
      setReplacementRiderPhone(candidates[0]?.riderPhone || '');
      if (!candidates.length) setReassignmentError('No verified, online rider with capacity and a valid route is available.');
    } catch (error) {
      setReassignmentError(error instanceof Error ? error.message : 'Replacement rider options could not be loaded.');
    } finally {
      setReassignmentLoading(false);
    }
  };

  const submitRiderReassignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reassignOrder) return;
    setReassignmentLoading(true);
    setReassignmentError(null);
    setActionNotice(null);
    try {
      const response = await fetch('/api/admin/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: reassignOrder.id,
          operation: 'reassign_rider',
          riderPhone: replacementRiderPhone,
          reason: reassignmentReason
        }),
        cache: 'no-store'
      });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error || 'Rider reassignment could not be completed.');
      setReassignOrder(null);
      setActionNotice({
        orderId: reassignOrder.id,
        message: result.warning || 'Rider reassigned.',
        error: Boolean(result.warning)
      });
      await refreshFlow();
    } catch (error) {
      console.error(`[Operations] Rider reassignment failed for order #${reassignOrder.id}:`, error);
      setReassignmentError(error instanceof Error ? error.message : 'Rider reassignment could not be completed.');
    } finally {
      setReassignmentLoading(false);
    }
  };

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
  const diagnosticOrder = diagnosticPanel?.orderId
    ? flow?.orders.find(order => order.id === diagnosticPanel.orderId)
    : undefined;
  const diagnosticFailedNotices = (diagnosticPanel?.events || [])
    .filter(event => event.stage === 'customer_notification' && event.status === 'failed');

  return (
    <main className="min-h-screen min-w-0 bg-slate-50 p-3 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Operations control room</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tighter text-slate-950 sm:text-4xl">Run the shift</h1>
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

      <section className="mt-8">
        <Card className="min-w-0 rounded-2xl border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">End-to-end automation</p>
              <h2 className="mt-1 text-xl font-black uppercase tracking-tight">Order → notification flow</h2>
              <p className="mt-1 text-xs text-slate-500">Recent orders, verified payment, merchant fulfillment, rider dispatch, delivery, and actual notification attempts.</p>
            </div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {flow && (
                <span aria-hidden="true" className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
              {flow?.checkedAt ? `Live · checked ${new Date(flow.checkedAt).toLocaleTimeString()}` : 'Checking flow...'}
            </p>
          </div>

          {flowError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{flowError}</p>}

          {flow && (
            <>
              {flow.warnings.length > 0 && (
                <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-800">Flow data needs setup</p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-800">
                    {flow.warnings.map(warning => (
                      <li key={warning}>
                        <button
                          type="button"
                          onClick={() => openSystemDiagnostic(
                            'Order-flow data warning',
                            warning,
                            ['The required migration or permission is not available to the operations query. Confirm it is installed in the same Supabase project used by this deployment.'],
                            [{ href: '/lord/settings?tab=integrations', label: 'Open connection diagnostics' }]
                          )}
                          className="text-left underline decoration-amber-500/50 underline-offset-2 hover:text-amber-950"
                        >
                          {warning}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {flow.workers.map(worker => (
                  <button
                    key={worker.key}
                    type="button"
                    onClick={() => openSystemDiagnostic(
                      worker.key === 'order-dispatch' ? 'Auto-dispatch worker diagnosis' : 'Merchant alert worker diagnosis',
                      worker.diagnostic,
                      worker.requirements,
                      [
                        { href: '/lord/settings?tab=integrations', label: 'Open connection diagnostics' },
                        { href: 'https://vercel.com/gimee1/onbar/settings/environment-variables', label: 'Open Vercel environment variables', external: true }
                      ]
                    )}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-700">
                        {worker.key === 'order-dispatch' ? 'Auto-dispatch worker' : 'Merchant alert worker'}
                      </p>
                      <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase', flowStatusStyle(worker.status))}>{worker.status}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {worker.lastSeenAt ? `Heartbeat ${new Date(worker.lastSeenAt).toLocaleTimeString()}` : 'No heartbeat recorded'}
                    </p>
                    <span className="mt-2 block text-[9px] font-black uppercase tracking-wide text-primary">Tap to diagnose</span>
                  </button>
                ))}
                {Object.entries(flow.providers).map(([provider, configured]) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => {
                      const diagnostic = flow.providerDiagnostics[provider];
                      openSystemDiagnostic(
                        `${provider} notification diagnosis`,
                        diagnostic?.diagnostic || 'Provider readiness details are unavailable.',
                        diagnostic?.requirements || [],
                        [
                          { href: '/lord/communications/automation', label: 'Open messaging center' },
                          { href: '/lord/settings?tab=integrations', label: 'Open connection diagnostics' },
                          ...(!configured ? [{ href: 'https://vercel.com/gimee1/onbar/settings/environment-variables', label: 'Open Vercel environment variables', external: true }] : [])
                        ]
                      );
                    }}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-700">{provider} notifications</p>
                      <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase', flowStatusStyle(configured ? 'configured' : 'unavailable'))}>
                        {configured ? 'configured' : 'not configured'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Readiness only; delivery results are shown below.</p>
                    <span className="mt-2 block text-[9px] font-black uppercase tracking-wide text-primary">Tap to diagnose</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => openSystemDiagnostic(
                    'Internal notification bridge diagnosis',
                    flow.internalNotificationBridgeDiagnostic,
                    flow.internalNotificationBridgeRequirements,
                    [{ href: '/lord/settings?tab=integrations', label: 'Open connection diagnostics' }]
                  )}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-700">Internal notification bridge</p>
                    <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase', flowStatusStyle(flow.internalNotificationBridge ? 'configured' : 'unavailable'))}>
                      {flow.internalNotificationBridge ? 'configured' : 'missing secret'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">Required for checkout and delivery updates to trigger customer messages.</p>
                  <span className="mt-2 block text-[9px] font-black uppercase tracking-wide text-primary">Tap to diagnose</span>
                </button>
                <button
                  type="button"
                  onClick={() => openSystemDiagnostic(
                    'Notification rules diagnosis',
                    flow.notificationRules.diagnostic,
                    flow.notificationRules.available ? [] : ['Check the customer_messaging settings record and database permissions.'],
                    [{ href: '/lord/communications/automation', label: 'Open notification rules' }]
                  )}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-700">Notification rules</p>
                    <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase', flowStatusStyle(
                      !flow.notificationRules.available || !flow.notificationRules.enabledStatuses ? 'unavailable' : 'configured'
                    ))}>
                      {flow.notificationRules.available
                        ? `${flow.notificationRules.enabledStatuses}/${flow.notificationRules.totalStatuses} active`
                        : 'unavailable'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {flow.notificationRules.enabledChannels.length
                      ? `Channels in rules: ${flow.notificationRules.enabledChannels.join(', ')}`
                      : 'No enabled notification channels'}
                  </p>
                  <span className="mt-2 block text-[9px] font-black uppercase tracking-wide text-primary">Tap to diagnose</span>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
                {[
                  { label: 'Latest orders', value: flow.summary.recentOrders },
                  { label: 'Payment verified', value: flow.summary.paymentsVerified },
                  { label: 'Merchants ready', value: flow.summary.merchantsReady },
                  { label: 'Riders assigned', value: flow.summary.ridersAssigned },
                  { label: 'Dispatch review', value: flow.summary.dispatchManualReview },
                  { label: 'Customer notices sent', value: flow.summary.customerNotificationsSent },
                  { label: 'Customer notices failed', value: flow.summary.customerNotificationsFailed },
                  { label: 'Merchant alerts sent', value: flow.summary.merchantNotificationsSent },
                  { label: 'Merchant alerts failed', value: flow.summary.merchantNotificationsFailed }
                ].map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => openMetricDiagnostic(item.label, item.value)}
                    className="rounded-xl border border-slate-100 p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{item.value}</p>
                    <span className="mt-1 block text-[9px] font-black uppercase tracking-wide text-primary">Tap to inspect</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Order stage tracking · {flow.orders.length} recent orders</h3>
                    <span className={cn(
                      'rounded-full border px-2 py-1 text-[9px] font-black uppercase',
                      flow.summary.flowsNeedingAttention ? flowStatusStyle('failed') : flowStatusStyle('success')
                    )}>
                      {flow.summary.flowsNeedingAttention} needing attention
                    </span>
                  </div>
                  <div className="space-y-3">
                    {flow.orders.map((order, orderIndex) => {
                      const stages: Array<[string, FlowStage]> = [
                        ['Order', order.stages.order],
                        ['Payment', order.stages.payment],
                        ['Merchant', order.stages.merchant],
                        ['Dispatch', order.stages.dispatch],
                        ['Delivery', order.stages.delivery],
                        ['Customer notice', order.stages.notifications],
                        ['Merchant alert', order.stages.merchantNotifications]
                      ];
                      const operationalStages = stages.slice(0, 5);
                      const failedStageIndex = operationalStages.findIndex(([, stage]) => stage.status === 'failed');
                      const activeStageIndex = failedStageIndex >= 0
                        ? failedStageIndex
                        : operationalStages.findIndex(([, stage]) => stage.status === 'pending');
                      const currentStage = activeStageIndex >= 0
                        ? `${operationalStages[activeStageIndex][0]} · ${operationalStages[activeStageIndex][1].label}`
                        : order.status;
                      const canRetryMerchantAllocation = flow.permissions.manageOrders
                        && !order.riderPhone
                        && ['Paid', 'Confirmed'].includes(order.status)
                        && (order.stages.merchant.status !== 'success' || order.stages.dispatch.status === 'failed');
                      const canRetryMerchantAlert = flow.permissions.manageOrders
                        && !order.riderPhone
                        && ['Paid', 'Confirmed'].includes(order.status)
                        && order.retryableMerchantAlerts > 0;
                      const canReplaceRider = flow.permissions.manageOrders
                        && order.status === 'Dispatched'
                        && Boolean(order.riderPhone);
                      const canBuzzRider = flow.permissions.manageOrders
                        && order.status === 'Dispatched'
                        && Boolean(order.riderPhone);
                      const canRetryCustomer = flow.permissions.manageOrders || flow.permissions.manageCommunications;
                      const customerRetryChannels = canRetryCustomer ? order.retryableCustomerChannels : [];
                      const hasRecoveryActions = customerRetryChannels.length > 0
                        || canRetryMerchantAllocation
                        || canRetryMerchantAlert
                        || canReplaceRider
                        || canBuzzRider;
                      return (
                      <div
                        key={order.id}
                        className="animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none rounded-xl border border-slate-100 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
                        style={{ animationDelay: `${orderIndex * 50}ms` }}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/lord/orders?orderId=${order.id}`} className="text-xs font-black text-primary hover:underline">Order #{order.id}</Link>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className={cn(
                              'rounded-full border px-2 py-1 text-[9px] font-black uppercase',
                              failedStageIndex >= 0 ? flowStatusStyle('failed') : flowStatusStyle('info')
                            )}>
                              Current · {currentStage}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-600">{order.status}</span>
                            <Button type="button" size="sm" variant="outline" onClick={() => openOrderDiagnostic(order)} className="min-h-9">
                              Diagnose
                            </Button>
                          </div>
                        </div>
                        <div aria-hidden="true" className="mb-3 hidden overflow-x-auto sm:block">
                          <div className="flex min-w-[650px] items-center px-1 py-2">
                            {stages.map(([label, stage], index) => (
                              <React.Fragment key={label}>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className={cn(
                                    'relative h-2.5 w-2.5 shrink-0 rounded-full',
                                    stage.status === 'success' && 'bg-emerald-500',
                                    stage.status === 'failed' && 'bg-rose-500',
                                    stage.status === 'info' && 'bg-blue-500',
                                    stage.status === 'pending' && 'bg-amber-400'
                                  )}>
                                    {index === activeStageIndex && stage.status === 'pending' && (
                                      <span className="absolute inset-0 rounded-full bg-amber-400 motion-safe:animate-ping motion-reduce:animate-none" />
                                    )}
                                  </span>
                                  <span className={cn(
                                    'whitespace-nowrap text-[8px] font-bold uppercase tracking-wide',
                                    stage.status === 'failed' ? 'text-rose-600' : 'text-slate-500'
                                  )}>{label}</span>
                                </div>
                                {index < stages.length - 1 && (
                                  <span className={cn(
                                    'mx-2 h-px min-w-3 flex-1',
                                    stage.status === 'success' ? 'bg-emerald-300' : 'bg-slate-200'
                                  )} />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-7">
                          {stages.map(([label, stage]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => openOrderDiagnostic(order, label)}
                              className="min-w-0 rounded-lg p-1 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                              <span className={cn('mt-1 inline-flex max-w-full rounded-full border px-2 py-1 text-[9px] font-bold capitalize', flowStatusStyle(stage.status))}>
                                <span className="truncate">{stage.label}</span>
                              </span>
                              <span className="mt-1 block text-[8px] font-bold uppercase text-primary">Details / actions</span>
                            </button>
                          ))}
                        </div>
                        {hasRecoveryActions && (
                          <div className="mt-4 border-t border-slate-100 pt-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Recovery actions</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {customerRetryChannels.map(channel => {
                                const key = `customer:${order.id}:${channel}`;
                                return (
                                  <Button
                                    key={channel}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={Boolean(actionBusy)}
                                    onClick={() => void retryCustomerNotice(order, channel)}
                                    className="min-h-11 w-full justify-start whitespace-normal text-left text-[10px] font-bold sm:h-8 sm:min-h-8 sm:w-auto sm:justify-center sm:whitespace-nowrap sm:text-center"
                                  >
                                    {actionBusy === key ? 'Retrying…' : `Retry customer ${channel}`}
                                  </Button>
                                );
                              })}
                              {canRetryMerchantAlert && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(actionBusy)}
                                  onClick={() => void sendAdminAction(order, 'retry_merchant_alerts', 'Merchant alert retry')}
                                  className="min-h-11 w-full justify-start whitespace-normal text-left text-[10px] font-bold sm:h-8 sm:min-h-8 sm:w-auto sm:justify-center sm:whitespace-nowrap sm:text-center"
                                >
                                  {actionBusy === `retry_merchant_alerts:${order.id}` ? 'Retrying…' : `Retry ${order.retryableMerchantAlerts} merchant alert${order.retryableMerchantAlerts === 1 ? '' : 's'}`}
                                </Button>
                              )}
                              {canRetryMerchantAllocation && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(actionBusy)}
                                  onClick={() => void sendAdminAction(order, 'retry_merchant_allocation', 'Supplier reallocation')}
                                  className="min-h-11 w-full justify-start whitespace-normal text-left text-[10px] font-bold sm:h-8 sm:min-h-8 sm:w-auto sm:justify-center sm:whitespace-nowrap sm:text-center"
                                >
                                  {actionBusy === `retry_merchant_allocation:${order.id}` ? 'Checking suppliers…' : 'Find replacement supplier'}
                                </Button>
                              )}
                              {canReplaceRider && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(actionBusy) || reassignmentLoading}
                                  onClick={() => void openRiderReassignment(order)}
                                  className="min-h-11 w-full justify-start whitespace-normal text-left text-[10px] font-bold sm:h-8 sm:min-h-8 sm:w-auto sm:justify-center sm:whitespace-nowrap sm:text-center"
                                >
                                  Replace rider
                                </Button>
                              )}
                              {canBuzzRider && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(actionBusy)}
                                  onClick={() => void sendAdminAction(order, 'buzz_rider', 'Rider buzz')}
                                  className="min-h-11 w-full justify-start whitespace-normal text-left text-[10px] font-bold text-amber-900 hover:bg-amber-50 sm:h-8 sm:min-h-8 sm:w-auto sm:justify-center sm:whitespace-nowrap sm:text-center"
                                >
                                  {actionBusy === `buzz_rider:${order.id}` ? 'Buzzing rider…' : 'Buzz rider to open app'}
                                </Button>
                              )}
                            </div>
                            {actionNotice?.orderId === order.id && (
                              <p role={actionNotice.error ? 'alert' : 'status'} className={cn(
                                'mt-2 rounded-lg border p-2 text-[10px] font-semibold',
                                actionNotice.error
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              )}>
                                {actionNotice.message}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })}
                    {!flow.orders.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No recent orders to trace yet.</p>}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-700">Latest order & notification events</h3>
                  <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                    {flow.timeline.slice(0, 18).map((event, eventIndex) => {
                      const eventOrder = flow.orders.find(order => order.id === event.orderId);
                      const stageLabel: Record<string, string> = {
                        order: 'Order',
                        payment: 'Payment',
                        merchant: 'Merchant',
                        dispatch: 'Dispatch',
                        delivery: 'Delivery',
                        customer_notification: 'Customer notice',
                        merchant_notification: 'Merchant alert'
                      };
                      return <button
                        key={event.id}
                        type="button"
                        onClick={() => eventOrder && openOrderDiagnostic(eventOrder, stageLabel[event.stage])}
                        className="animate-in fade-in slide-in-from-right-2 duration-500 motion-reduce:animate-none flex w-full gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-primary/30 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={{ animationDelay: `${eventIndex * 35}ms` }}
                      >
                        <span className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', {
                          'bg-emerald-500': event.status === 'success',
                          'bg-rose-500': event.status === 'failed',
                          'bg-amber-500': event.status === 'pending',
                          'bg-blue-500': event.status === 'info'
                        })} />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-[11px] font-black text-slate-800">{event.title}</strong>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500">Order #{event.orderId} · {event.detail}</span>
                          <time className="mt-1 block text-[9px] text-slate-400">{new Date(event.occurredAt).toLocaleString()}</time>
                        </span>
                      </button>;
                    })}
                    {!flow.timeline.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No order or notification events have been recorded.</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
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

      {diagnosticPanel && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
          onClick={() => setDiagnosticPanel(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="operations-diagnostic-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Operations diagnosis</p>
                <h2 id="operations-diagnostic-title" className="mt-1 text-xl font-black text-slate-950">{diagnosticPanel.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{diagnosticPanel.summary}</p>
              </div>
              <Button type="button" variant="outline" className="min-h-10 shrink-0" onClick={() => setDiagnosticPanel(null)}>
                Close
              </Button>
            </div>

            {diagnosticPanel.details.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-amber-900">What to check</p>
                <ul className="mt-2 space-y-2 text-sm leading-5 text-amber-950">
                  {diagnosticPanel.details.map(detail => <li key={detail}>• {detail}</li>)}
                </ul>
              </div>
            )}

            {diagnosticPanel.events && (
              <div className="mt-5 space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Recorded events and exact errors</h3>
                {diagnosticPanel.events.length ? diagnosticPanel.events.map(event => (
                  <article key={event.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-900">{event.title}</p>
                      <span className={cn('rounded-full border px-2 py-1 text-[9px] font-black uppercase', flowStatusStyle(event.status))}>{event.status}</span>
                    </div>
                    <p className="mt-2 break-words text-sm leading-5 text-slate-700">{event.detail}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{new Date(event.occurredAt).toLocaleString()}</p>
                    {event.notificationStatus && (
                      <p className="mt-1 text-[10px] font-semibold text-slate-500">
                        Message template status: {event.notificationStatus}{event.channel ? ` · channel: ${event.channel}` : ''}
                      </p>
                    )}
                  </article>
                )) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No matching event record was found for this item.</p>}
              </div>
            )}

            {diagnosticOrder && diagnosticPanel.channels && diagnosticPanel.channels.length > 0 && (
              <section className="mt-5 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-rose-900">Resend options</h3>
                <p className="mt-1 text-xs leading-5 text-rose-800">
                  Choose a channel to resend the order’s current status. The server will re-check notification rules, provider setup, and customer consent before sending.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {diagnosticPanel.channels.map(channel => {
                    const isCurrentFailure = diagnosticOrder.retryableCustomerChannels.includes(channel);
                    const failedStatuses = [...new Set(diagnosticFailedNotices
                      .filter(event => event.channel === channel)
                      .map(event => event.notificationStatus)
                      .filter((status): status is string => Boolean(status)))];
                    return (
                      <div key={channel} className="w-full rounded-lg border border-rose-200 bg-white p-3">
                        <p className="text-xs font-bold text-slate-800">
                          {isCurrentFailure ? `Failed ${diagnosticOrder.status} message` : `Earlier failure: ${failedStatuses.join(', ') || 'status not recorded'}`}
                        </p>
                        {!isCurrentFailure && (
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            The order is now {diagnosticOrder.status}. Resending will send the current status template, not an outdated message.
                          </p>
                        )}
                        {flow?.permissions.manageOrders || flow?.permissions.manageCommunications ? (
                          confirmRetryChannel === channel ? (
                            <div className="mt-3 rounded-lg bg-rose-50 p-3">
                              <p className="text-xs font-semibold leading-5 text-rose-900">
                                Confirm resend of “{diagnosticOrder.status}” via {channel}? Consent and channel settings are checked again before delivery.
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={Boolean(actionBusy)}
                                  onClick={() => void retryCustomerNotice(diagnosticOrder, channel)}
                                >
                                  {actionBusy === `customer:${diagnosticOrder.id}:${channel}` ? 'Sending…' : `Confirm resend via ${channel}`}
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRetryChannel(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={Boolean(actionBusy)}
                              onClick={() => setConfirmRetryChannel(channel)}
                              className="mt-3 min-h-10"
                            >
                              Resend via {channel}
                            </Button>
                          )
                        ) : <p className="mt-2 text-xs text-slate-500">Your account does not have permission to resend notifications.</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {diagnosticOrder && diagnosticOrder.retryableMerchantAlerts > 0 && flow?.permissions.manageOrders && (
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(actionBusy)}
                onClick={() => void sendAdminAction(diagnosticOrder, 'retry_merchant_alerts', 'Merchant alert retry')}
                className="mt-4 min-h-10"
              >
                {actionBusy === `retry_merchant_alerts:${diagnosticOrder.id}`
                  ? 'Retrying merchant alerts…'
                  : `Retry ${diagnosticOrder.retryableMerchantAlerts} failed merchant alert${diagnosticOrder.retryableMerchantAlerts === 1 ? '' : 's'}`}
              </Button>
            )}

            {diagnosticOrder && actionNotice?.orderId === diagnosticOrder.id && (
              <p role={actionNotice.error ? 'alert' : 'status'} className={cn(
                'mt-4 rounded-lg border p-3 text-sm font-semibold',
                actionNotice.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              )}>
                {actionNotice.message}
              </p>
            )}

            {diagnosticPanel.links && diagnosticPanel.links.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {diagnosticPanel.links.map(link => link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-primary hover:bg-slate-50"
                  >
                    {link.label} <ArrowRight className="ml-2 h-3 w-3" />
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-primary hover:bg-slate-50"
                  >
                    {link.label} <ArrowRight className="ml-2 h-3 w-3" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {reassignOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-rider-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Pre-pickup recovery</p>
                <h2 id="reassign-rider-title" className="mt-1 text-xl font-black">Replace rider · order #{reassignOrder.id}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Current rider: {reassignOrder.riderName || reassignOrder.riderPhone}. This is allowed only before pickup.
                </p>
              </div>
              <Button type="button" variant="outline" disabled={reassignmentLoading} onClick={() => setReassignOrder(null)}>
                Close
              </Button>
            </div>

            {reassignmentLoading && <p role="status" className="mt-4 text-sm text-slate-500">Checking fulfillment and eligible riders…</p>}
            <form onSubmit={event => void submitRiderReassignment(event)} className="mt-4 space-y-4">
              <label className="block text-xs font-bold text-slate-700">
                Replacement rider
                <select
                  required
                  disabled={reassignmentLoading || !riderCandidates.length}
                  value={replacementRiderPhone}
                  onChange={event => setReplacementRiderPhone(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {riderCandidates.map(candidate => (
                    <option key={candidate.riderPhone} value={candidate.riderPhone}>
                      {candidate.riderName} · {candidate.activeLoad}/{candidate.maxDeliveries} deliveries
                      {candidate.distanceKm === null ? '' : ` · ${candidate.distanceKm} km`}
                      {candidate.etaMinutes === null ? '' : ` · ${candidate.etaMinutes} min`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Reason for reassignment
                <textarea
                  required
                  minLength={8}
                  maxLength={500}
                  value={reassignmentReason}
                  onChange={event => setReassignmentReason(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"
                  placeholder="Explain why the assigned rider must be replaced."
                />
              </label>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                The order stays in Dispatched status. Pickup, out-for-delivery, and completed orders cannot be reassigned here.
                You must contact the previous rider to prevent a duplicate collection.
              </p>
              {reassignmentError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{reassignmentError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={reassignmentLoading} onClick={() => setReassignOrder(null)}>Cancel</Button>
                <Button type="submit" disabled={reassignmentLoading || !riderCandidates.length || reassignmentReason.trim().length < 8}>
                  {reassignmentLoading ? 'Saving…' : 'Confirm replacement'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
