'use client';

import { FormEvent, useState } from 'react';
import { AlertTriangle, Clock3, Eye, Package, Search, Store, Truck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';

type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  unit_price: number;
  size: string | null;
  status: string | null;
};

type PersonViewOrder = {
  id: number;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total_price: number | string;
  created_at: string;
  payment_method: string;
  payment_verified_at: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  delivery_address?: string | null;
  delivery_area?: string | null;
  delivery_landmark?: string | null;
  delivery_instructions?: string | null;
  delivery_eta_minutes?: number | null;
  delivery_eta_updated_at?: string | null;
  rider_handover_verified_at?: string | null;
  items: OrderItem[];
  payment: {
    verified: boolean;
    onlineConfirmation: { provider: string; amount_kobo: number; currency: string; verified_at: string } | null;
    doorstepAttempt: {
      provider: string;
      payment_method: string;
      status: string;
      amount_ksh: number;
      error_message: string | null;
      created_at: string;
    } | null;
  };
  statusEvents: Array<{
    from_status: string | null;
    to_status: string;
    actor_type: string;
    reason: string | null;
    created_at: string;
  }>;
  deliveryEvents: Array<{
    from_status: string | null;
    to_status: string;
    actor_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  merchants: Array<{
    id: string;
    name: string;
    phone: string | null;
    items: Array<{ name: string; quantity: number }>;
    events: Array<{ event_type: string; occurred_at: string; actor: string | null }>;
  }>;
  rider: {
    rider_name: string;
    rider_phone: string;
    vehicle_type: string | null;
    vehicle_reg: string | null;
    verification_status: string;
    status: string;
    last_known_lat: number | null;
    last_known_lng: number | null;
    location_updated_at: string | null;
  } | null;
};

type ViewMode = 'customer' | 'rider' | 'merchant';
type SupportResponse = { order?: PersonViewOrder; diagnostics?: string[]; error?: string };

function isPayAtDelivery(method: string) {
  return ['cash', 'cash on delivery', 'cod'].includes(method.trim().toLowerCase());
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

export default function SupportViewPage() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState<PersonViewOrder | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d+$/.test(orderId.trim())) {
      setError('Enter the numeric order number.');
      return;
    }
    setLoading(true);
    setError('');
    setOrder(null);
    setDiagnostics([]);
    try {
      const response = await fetch(`/api/admin/support-view?orderId=${encodeURIComponent(orderId.trim())}`, {
        cache: 'no-store'
      });
      const result = await response.json() as SupportResponse;
      if (!response.ok || !result.order) throw new Error(result.error || 'Order details could not be loaded.');
      setOrder(result.order);
      setDiagnostics(result.diagnostics || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Order details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  const modes: Array<{ id: ViewMode; label: string; icon: typeof UserRound }> = [
    { id: 'customer', label: 'Customer screen', icon: UserRound },
    { id: 'rider', label: 'Rider screen', icon: Truck },
    { id: 'merchant', label: 'Merchant screen', icon: Store }
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="flex items-start gap-4">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Eye className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Support tools</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">View an order as they see it</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Enter an order number to inspect the customer tracking view, rider mission, and each allocated merchant&apos;s order view.
            This is a read-only support snapshot; it does not sign in as another person or change their order.
          </p>
        </div>
      </header>

      <Card className="rounded-2xl border-slate-200 p-5 shadow-sm">
        <form onSubmit={event => void loadOrder(event)} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="support-order-id" className="sr-only">Order number</label>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="support-order-id"
              value={orderId}
              onChange={event => setOrderId(event.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Order number, e.g. 123"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button type="submit" disabled={loading || !orderId.trim()} className="h-12 rounded-xl px-6 font-bold">
            {loading ? 'Loading order…' : 'Open support view'}
          </Button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}
      </Card>

      {order && (
        <>
          <Card className="rounded-2xl border-slate-200 p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Order #{order.id}</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{order.status}</h2>
                <p className="mt-1 text-sm text-slate-500">Placed {dateLabel(order.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  {isPayAtDelivery(order.payment_method) && !['Delivered', 'Completed'].includes(order.status) ? 'Due at delivery' : 'Order total'}
                </p>
                <p className="mt-1 text-xl font-black text-slate-950">{formatPrice(Number(order.total_price))}</p>
                <p className="text-xs text-slate-500">{order.payment_method}</p>
              </div>
            </div>
            {diagnostics.length > 0 && (
              <div role="status" className="mt-5 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                {diagnostics.map(message => <p key={message} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{message}</p>)}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose whose view to inspect">
            {modes.map(mode => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={view === mode.id}
                  onClick={() => setView(mode.id)}
                  className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${view === mode.id ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                >
                  <Icon className="h-4 w-4" />{mode.label}
                </button>
              );
            })}
          </div>

          {view === 'customer' && (
            <section role="tabpanel" aria-label="Exact customer tracking screen" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-950">
                  This is the actual customer tracking page for order #{order.id}, loaded from <code>/track</code>. It refreshes with live order data and does not imitate the customer account.
                </p>
                <a
                  href={`/track?supportOrderId=${encodeURIComponent(String(order.id))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900"
                >
                  Open full screen
                </a>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
                <iframe
                  key={order.id}
                  title={`Exact customer tracking screen for order ${order.id}`}
                  src={`/track?supportOrderId=${encodeURIComponent(String(order.id))}`}
                  className="h-[82vh] min-h-[760px] w-full bg-white"
                  referrerPolicy="same-origin"
                />
              </div>
            </section>
          )}

          {view === 'rider' && (
            <section role="tabpanel" aria-label="Rider screen preview">
              {!order.rider && (
                <Card className="rounded-2xl border-dashed border-slate-300 p-8 text-center">
                  <Truck className="mx-auto h-8 w-8 text-slate-400" />
                  <h3 className="mt-3 font-black text-slate-900">No rider assigned</h3>
                  <p className="mt-1 text-sm text-slate-500">The rider app will not show a mission for this order until dispatch assigns one.</p>
                </Card>
              )}
              {order.rider && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      This is the actual rider dashboard in read-only support mode, showing order #{order.id}.
                    </p>
                    <a
                      href={`/rider/dashboard?supportOrderId=${encodeURIComponent(String(order.id))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800"
                    >
                      Open rider screen
                    </a>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#080c0b] shadow-sm">
                    <iframe
                      key={order.id}
                      title={`Read-only rider dashboard for order ${order.id}`}
                      src={`/rider/dashboard?supportOrderId=${encodeURIComponent(String(order.id))}`}
                      className="h-[82vh] min-h-[760px] w-full"
                      referrerPolicy="same-origin"
                    />
                  </div>
                </section>
              )}
            </section>
          )}

          {view === 'merchant' && (
            <section role="tabpanel" aria-label="Merchant screen preview" className="space-y-4">
              {order.merchants.length === 0 && (
                <Card className="rounded-2xl border-dashed border-slate-300 p-8 text-center">
                  <Store className="mx-auto h-8 w-8 text-slate-400" />
                  <h3 className="mt-3 font-black text-slate-900">No merchant stock is linked</h3>
                  <p className="mt-1 text-sm text-slate-500">No allocated merchant order is visible in the partner workspace for this order.</p>
                </Card>
              )}
              {order.merchants.map(merchant => (
                <Card key={merchant.id} className="rounded-3xl border-slate-200 p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Merchant order view · /merchant/network</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{merchant.name}</h3>
                      <p className="text-sm text-slate-500">Order #{order.id} · Customer {order.customer_name}</p>
                      {merchant.phone && <p className="text-sm text-slate-500">{merchant.phone}</p>}
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{order.status}</span>
                  </div>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Items allocated to this merchant</p>
                      <ul className="mt-3 space-y-2 text-sm text-slate-800">
                        {merchant.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Merchant updates</p>
                      {merchant.events.length === 0
                        ? <p className="mt-3 text-sm text-amber-700">No accept/decline or preparation update has been recorded.</p>
                        : <ul className="mt-3 space-y-2 text-sm text-slate-700">
                          {merchant.events.map((event, index) => <li key={`${event.event_type}-${index}`}><strong>{event.event_type.replaceAll('_', ' ')}</strong> · {dateLabel(event.occurred_at)}</li>)}
                        </ul>}
                    </div>
                  </div>
                </Card>
              ))}
            </section>
          )}

          <Card className="rounded-2xl border-slate-200 p-5 shadow-sm">
            <h3 className="flex items-center gap-2 font-black text-slate-950"><Clock3 className="h-4 w-4" /> Support timeline</h3>
            {[...order.statusEvents.map(event => ({
              at: event.created_at,
              title: `${event.from_status || 'Order created'} → ${event.to_status}`,
              detail: [event.actor_type, event.reason].filter(Boolean).join(' · ')
            })), ...order.deliveryEvents.map(event => ({
              at: event.created_at,
              title: `${event.from_status || 'Delivery'} → ${event.to_status}`,
              detail: event.actor_type
            }))].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).length === 0
              ? <p className="mt-3 text-sm text-slate-500">No detailed timeline is available. The current order state is shown above.</p>
              : <ol className="mt-4 space-y-3">
                {[...order.statusEvents.map(event => ({
                  at: event.created_at,
                  title: `${event.from_status || 'Order created'} → ${event.to_status}`,
                  detail: [event.actor_type, event.reason].filter(Boolean).join(' · ')
                })), ...order.deliveryEvents.map(event => ({
                  at: event.created_at,
                  title: `${event.from_status || 'Delivery'} → ${event.to_status}`,
                  detail: event.actor_type
                }))].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).map((event, index) => (
                  <li key={`${event.at}-${index}`} className="flex gap-3 text-sm">
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span><strong className="text-slate-800">{event.title}</strong><span className="block text-xs text-slate-500">{dateLabel(event.at)}{event.detail ? ` · ${event.detail}` : ''}</span></span>
                  </li>
                ))}
              </ol>}
          </Card>
        </>
      )}
    </div>
  );
}
