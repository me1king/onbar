'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  Loader2,
  PackageSearch,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminContext';

interface Merchant {
  id: string;
  merchant_code: string | null;
  business_name: string;
  business_type: string;
  town: string;
  county: string;
  status?: string;
}
interface Product {
  id: number;
  name: string;
  sku: string | null;
}
interface Movement {
  id: number;
  movement_type: string;
  quantity_delta: number;
  order_id: number | null;
  actor: string;
  note: string | null;
  created_at: string;
}
interface Hold {
  id: number;
  reason: string;
  placed_by: string;
  placed_at: string;
  released_by: string | null;
  released_at: string | null;
  release_note: string | null;
}
interface Batch {
  id: string;
  application_id: string;
  product_id: number;
  lot_code: string;
  supplier_name: string | null;
  received_at: string;
  expiry_at: string | null;
  quantity_received: number;
  storage_notes: string | null;
  merchant: Merchant | null;
  product: Product | null;
  movements: Movement[];
  holds: Hold[];
  orders?: Array<{ id: number; quantity: number; order: { id: number; customer: string; status: string; created_at: string } | null }>;
}
interface OrderItem {
  id: number;
  product_id: number | null;
  quantity: number;
  unit_price: number;
  size: string | null;
  status: string | null;
  product: Product | null;
  batches: Array<{ id: number; quantity: number; batch: Batch | null }>;
}
interface Incident {
  id: string;
  incident_code: string;
  application_id: string;
  batch_id: string | null;
  category: string;
  description: string;
  status: string;
  severity: string;
  resolution_note: string | null;
  created_at: string;
  events: Array<{ id: number; event_type: string; actor: string; created_at: string }>;
}
interface CustomerComplaint {
  id: string;
  order_item_id: number | null;
  category: string;
  description: string;
  created_at: string;
}
interface TraceResult {
  order?: {
    id: number;
    total_price: number;
    status: string;
    created_at: string;
    customer: { name: string; phone: string | null; email: string | null };
    delivery: { riderName: string | null; riderPhone: string | null };
  };
  items?: OrderItem[];
  fulfillment?: Array<{ id: number; application_id: string; event_type: string; actor: string; occurred_at: string; details: Record<string, unknown>; merchant: Merchant | null }>;
  customerComplaints?: CustomerComplaint[];
  incidents?: Incident[];
  batches?: Batch[];
}
interface Catalog {
  merchants: Merchant[];
  products: Product[];
  stockCatalog: Array<{
    productId: number;
    name: string;
    sku: string | null;
    available: number;
    vendorCount: number;
    vendors: Array<{
      applicationId: string;
      name: string;
      merchantCode: string | null;
      available: number;
      updatedAt: string | null;
    }>;
    updatedAt: string | null;
  }>;
  stockActivity: Array<{
    productId: number;
    productName: string;
    merchantName: string;
    movementType: string;
    quantityDelta: number;
    actor: string;
    note: string | null;
    createdAt: string;
  }>;
  stockError: string | null;
}

const incidentCategories = ['product_quality', 'food_safety', 'delivery', 'conduct', 'other'];
const incidentStatuses = ['reported', 'triaged', 'investigating', 'action_required', 'resolved', 'closed'];
const incidentTransitions: Record<string, string[]> = {
  reported: ['reported', 'triaged'],
  triaged: ['triaged', 'investigating', 'action_required'],
  investigating: ['investigating', 'action_required', 'resolved'],
  action_required: ['action_required', 'investigating', 'resolved'],
  resolved: ['resolved', 'investigating', 'closed'],
  closed: ['closed']
};
const fulfillmentTransitions: Record<string, string[]> = {
  start: ['accepted', 'rejected'],
  accepted: ['preparing', 'cancelled', 'exception'],
  preparing: ['ready', 'cancelled', 'exception'],
  ready: ['handed_to_rider', 'collected', 'cancelled', 'exception'],
  handed_to_rider: ['delivered', 'exception'],
  collected: ['delivered'],
  exception: ['preparing', 'ready', 'cancelled'],
  rejected: [],
  delivered: [],
  cancelled: []
};

export default function MerchantTraceabilityPage() {
  const { role, permissions } = useAdmin();
  const canManageInventory = role === 'owner' || role === 'admin' || permissions.can_manage_settings;
  const [orderSearch, setOrderSearch] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [result, setResult] = useState<TraceResult | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({
    merchants: [],
    products: [],
    stockCatalog: [],
    stockActivity: [],
    stockError: null
  });
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<string | null>(null);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [allocationBatch, setAllocationBatch] = useState<Record<number, string>>({});
  const [allocationQuantity, setAllocationQuantity] = useState<Record<number, string>>({});
  const [holdBatch, setHoldBatch] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentCategory, setIncidentCategory] = useState('product_quality');
  const [incidentSeverity, setIncidentSeverity] = useState('unassessed');
  const [fulfillmentEvent, setFulfillmentEvent] = useState('accepted');
  const [fulfillmentApplicationId, setFulfillmentApplicationId] = useState('');
  const [fulfillmentNote, setFulfillmentNote] = useState('');
  const [receive, setReceive] = useState({
    applicationId: '',
    productId: '',
    lotCode: '',
    supplierName: '',
    quantity: '',
    expiryAt: '',
    storageNotes: ''
  });

  const loadCatalog = useCallback(async () => {
    setCatalogRefreshing(true);
    try {
      const response = await fetch('/api/admin/traceability?catalog=1&includeStock=1', { cache: 'no-store' });
      const payload = await response.json() as Partial<Catalog> & {
        merchants?: Merchant[];
        products?: Product[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Inventory setup could not be loaded.');
      setCatalog({
        merchants: payload.merchants || [],
        products: payload.products || [],
        stockCatalog: payload.stockCatalog || [],
        stockActivity: payload.stockActivity || [],
        stockError: payload.stockError || null
      });
      setCatalogUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Inventory setup could not be loaded.');
    } finally {
      setCatalogRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!canManageInventory) return;
    void loadCatalog();
    const interval = window.setInterval(() => void loadCatalog(), 15_000);
    return () => window.clearInterval(interval);
  }, [canManageInventory, loadCatalog]);

  const visibleStockCatalog = catalog.stockCatalog.filter(item =>
    !catalogSearch.trim()
    || `${item.name} ${item.sku || ''} ${item.vendors.map(vendor => vendor.name).join(' ')}`
      .toLowerCase().includes(catalogSearch.trim().toLowerCase())
  );

  const lookup = async (kind: 'order' | 'batch', value: string) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const query = kind === 'order'
        ? `orderId=${encodeURIComponent(value.trim())}`
        : `batch=${encodeURIComponent(value.trim())}`;
      const response = await fetch(`/api/admin/traceability?${query}`, { cache: 'no-store' });
      const payload = await response.json() as TraceResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Trace lookup failed.');
      setResult(payload);
      if (kind === 'order') {
        const merchants = [...new Map((payload.items || []).flatMap(item => item.batches)
          .filter(trace => trace.batch?.merchant)
          .map(trace => [trace.batch!.application_id, trace.batch!.merchant!])).values()];
        if (merchants.length && !merchants.some(merchant => merchant.id === fulfillmentApplicationId)) {
          setFulfillmentApplicationId(merchants[0].id);
        }
      }
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Trace lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const action = async (payload: Record<string, unknown>) => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/traceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Traceability action failed.');
      setMessage('Traceability record saved.');
      if (payload.action === 'hold') setHoldReason('');
      if (payload.action === 'release') setReleaseReason('');
      if (payload.action === 'incident') setIncidentDescription('');
      if (payload.action === 'fulfillment') setFulfillmentNote('');
      if (payload.action === 'allocate') {
        setAllocationBatch({});
        setAllocationQuantity({});
      }
      if (payload.action === 'receive') {
        setReceive({ applicationId: '', productId: '', lotCode: '', supplierName: '', quantity: '', expiryAt: '', storageNotes: '' });
        if (canManageInventory) await loadCatalog();
      }
      if (result?.order) await lookup('order', String(result.order.id));
      if (result?.batches?.[0]) await lookup('batch', result.batches[0].lot_code);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Traceability action failed.');
    } finally {
      setWorking(false);
    }
  };

  const receiveBatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void action({
      action: 'receive',
      applicationId: receive.applicationId,
      productId: Number(receive.productId),
      lotCode: receive.lotCode,
      supplierName: receive.supplierName,
      quantity: Number(receive.quantity),
      expiryAt: receive.expiryAt || null,
      storageNotes: receive.storageNotes
    });
  };

  const reportIncident = (applicationId: string, orderId?: number, batchId?: string) => {
    if (incidentDescription.trim().length < 10) {
      setError('Describe the incident in at least 10 characters.');
      return;
    }
    void action({
      action: 'incident',
      applicationId,
      orderId,
      batchId,
      category: incidentCategory,
      severity: incidentSeverity,
      description: incidentDescription
    });
  };

  const updateIncident = async (incidentId: string, status: string, resolutionNote?: string) => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/traceability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId, status, resolutionNote })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Incident status could not be updated.');
      setMessage('Incident status updated and recorded.');
      if (result?.order) await lookup('order', String(result.order.id));
      if (result?.batches?.[0]) await lookup('batch', result.batches[0].lot_code);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Incident status could not be updated.');
    } finally {
      setWorking(false);
    }
  };

  const addFulfillmentEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!result?.order) return;
    if (fulfillmentEvent === 'accepted' && fulfillmentNote.trim().length < 8) {
      setError('Record how and when the merchant confirmed acceptance before marking this order accepted.');
      return;
    }
    const applicationId = fulfillmentApplicationId;
    if (!applicationId) {
      setError('Link a verified merchant batch to an order item before recording fulfilment events.');
      return;
    }
    void action({
      action: 'fulfillment',
      orderId: result.order.id,
      applicationId,
      eventType: fulfillmentEvent,
      note: fulfillmentNote
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 text-left sm:p-8">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-primary"><PackageSearch size={15} /> Merchant network</p>
        <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">Traceability & incidents</h1>
        <p className="mt-2 text-sm text-slate-600">Trace orders, lots, merchants, inventory movements, fulfilment, holds, and incidents.</p>
      </header>

      {canManageInventory && (
        <Card className="mb-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Shared stock source</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">Live merchant catalog</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Available stock comes from vendor batch movements—the same inventory used by order reservations and dispatch. Held, expired, and already-allocated units are excluded.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadCatalog()} disabled={catalogRefreshing} className="h-10 rounded-xl">
              <RefreshCcw size={15} className={`mr-2 ${catalogRefreshing ? 'animate-spin' : ''}`} /> Refresh stock
            </Button>
          </div>

          {catalog.stockError && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              {catalog.stockError}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Available units', catalog.stockCatalog.reduce((total, item) => total + item.available, 0).toLocaleString('en-KE')],
              ['Products with stock', catalog.stockCatalog.filter(item => item.available > 0).length.toLocaleString('en-KE')],
              ['Products out of stock', catalog.stockCatalog.filter(item => item.available === 0).length.toLocaleString('en-KE')]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-2xl font-black text-slate-900">{value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              value={catalogSearch}
              onChange={event => setCatalogSearch(event.target.value)}
              placeholder="Find a product or merchant"
              aria-label="Filter live stock catalog"
              className="h-11 max-w-md rounded-xl"
            />
            <p className="text-xs text-slate-500">
              Auto-refreshes every 15 seconds{catalogUpdatedAt ? ` · Updated ${new Date(catalogUpdatedAt).toLocaleTimeString()}` : ''}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="px-4 py-3">Merchants with stock</th>
                  <th className="px-4 py-3">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleStockCatalog.map(item => (
                  <tr key={item.productId} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      {item.sku && <p className="mt-1 text-xs text-slate-500">SKU {item.sku}</p>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${item.available > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {item.available.toLocaleString('en-KE')} units
                      </span>
                    </td>
                    <td className="max-w-[30rem] px-4 py-4">
                      <p className="font-semibold text-slate-800">{item.vendorCount} merchant{item.vendorCount === 1 ? '' : 's'} with stock</p>
                      {item.vendors.length > 0
                        ? <ul className="mt-2 space-y-1 text-xs text-slate-600">
                            {item.vendors.map(vendor => (
                              <li key={vendor.applicationId}>
                                {vendor.name}: <strong className="text-slate-900">{vendor.available} available</strong>
                              </li>
                            ))}
                          </ul>
                        : <p className="mt-1 text-xs text-slate-500">No merchant stock batches recorded.</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'No stock update'}
                    </td>
                  </tr>
                ))}
                {!visibleStockCatalog.length && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No matching catalog products.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Recent stock activity</h3>
            {catalog.stockActivity.length
              ? <ul className="mt-3 space-y-2">
                  {catalog.stockActivity.slice(0, 8).map((activity, index) => (
                    <li key={`${activity.createdAt}-${activity.productId}-${activity.merchantName}-${index}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 pt-2 text-xs">
                      <span className="text-slate-700">
                        <strong>{activity.merchantName}</strong> · {activity.productName} ·{' '}
                        <strong className={activity.quantityDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {activity.quantityDelta > 0 ? '+' : ''}{activity.quantityDelta} units
                        </strong>
                        {activity.note ? ` · ${activity.note}` : ''}
                      </span>
                      <time className="text-slate-500">{new Date(activity.createdAt).toLocaleString()}</time>
                    </li>
                  ))}
                </ul>
              : <p className="mt-2 text-xs text-slate-500">No merchant stock updates have been recorded yet.</p>}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={event => { event.preventDefault(); void lookup('order', orderSearch); }} className="flex gap-2">
          <Input value={orderSearch} onChange={event => setOrderSearch(event.target.value)} inputMode="numeric" placeholder="Order ID" className="h-12 rounded-xl bg-white" />
          <Button disabled={loading || !orderSearch.trim()} className="h-12 shrink-0 rounded-xl"><PackageSearch size={16} className="mr-2" /> Trace order</Button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void lookup('batch', batchSearch); }} className="flex gap-2">
          <Input value={batchSearch} onChange={event => setBatchSearch(event.target.value)} placeholder="Batch ID or exact lot code" className="h-12 rounded-xl bg-white" />
          <Button disabled={loading || !batchSearch.trim()} variant="outline" className="h-12 shrink-0 rounded-xl"><PackageSearch size={16} className="mr-2" /> Trace lot</Button>
        </form>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</p>}
      {loading && <div className="py-14 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" />Loading trace...</div>}

      {!loading && result?.order && (
        <div className="mt-6 space-y-5">
          <Card className="rounded-2xl border-0 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-primary">Order #{result.order.id}</p>
                <h2 className="mt-1 text-2xl font-black text-slate-900">{result.order.customer.name}</h2>
                {result.order.customer.phone && <p className="text-sm text-slate-500">{result.order.customer.phone}</p>}
                <p className="mt-2 text-xs text-slate-500">Created {new Date(result.order.created_at).toLocaleString()} · Status {result.order.status}</p>
              </div>
              <div className="text-right"><p className="font-black text-slate-900">KSh {Number(result.order.total_price).toLocaleString()}</p><p className="text-xs text-slate-500">{result.order.delivery.riderName || 'No rider recorded'}</p></div>
            </div>
          </Card>

          {(result.items || []).map(item => (
            <Card key={item.id} className="space-y-4 rounded-2xl border-0 p-5 shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <div><h3 className="font-black text-slate-900">{item.product?.name || `Product #${item.product_id || 'unknown'}`}</h3><p className="text-xs text-slate-500">Order item #{item.id} · Qty {item.quantity} · {item.size || 'Standard'}</p></div>
                <p className="text-xs font-bold text-slate-500">{item.status || 'Pending'}</p>
              </div>
              <div className="space-y-3">
                {item.batches.map(trace => (
                  <div key={trace.id} className="rounded-xl border border-slate-200 p-4">
                    {trace.batch ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-slate-800">Lot {trace.batch.lot_code} · traced quantity {trace.quantity}</p>
                            <p className="mt-1 text-xs text-slate-600">{trace.batch.product?.name || 'Product'} · {trace.batch.merchant?.merchant_code || trace.batch.merchant?.business_name || 'Merchant unavailable'}</p>
                            <p className="text-xs text-slate-500">Source: {trace.batch.supplier_name || 'Not recorded'} · Received {new Date(trace.batch.received_at).toLocaleDateString()} · Expiry {trace.batch.expiry_at || 'Not recorded'}</p>
                          </div>
                          {trace.batch.holds?.some(hold => !hold.released_at)
                            ? <span className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase text-rose-800"><ShieldAlert size={13} /> On hold</span>
                            : <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-800"><ShieldCheck size={13} /> Clear</span>}
                        </div>
                        <HoldControls batch={trace.batch} working={working} holdReason={holdReason} setHoldReason={setHoldReason} releaseReason={releaseReason} setReleaseReason={setReleaseReason} action={action} setHoldBatch={setHoldBatch} holdBatch={holdBatch} />
                        <MovementList movements={trace.batch.movements} />
                      </>
                    ) : <p className="text-xs text-amber-700">Batch details are unavailable for trace record {trace.id}.</p>}
                  </div>
                ))}
                {!item.batches.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No batch/lot has been linked to this order item yet.</p>}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                <Input value={allocationBatch[item.id] || ''} onChange={event => setAllocationBatch(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Batch UUID" className="h-10 rounded-lg font-mono text-xs" />
                <Input type="number" min="1" value={allocationQuantity[item.id] || ''} onChange={event => setAllocationQuantity(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Quantity" className="h-10 rounded-lg" />
                <Button disabled={working || !allocationBatch[item.id] || !allocationQuantity[item.id]} onClick={() => void action({ action: 'allocate', orderItemId: item.id, batchId: allocationBatch[item.id], quantity: Number(allocationQuantity[item.id]) })} variant="outline" className="h-10 rounded-lg">Link batch</Button>
              </div>
            </Card>
          ))}

          <section aria-label="Customer issue reports" className="space-y-3">
            <h2 className="px-1 text-sm font-black uppercase tracking-wide text-slate-800">Customer issue reports</h2>
            {(result.customerComplaints || []).length ? (result.customerComplaints || []).map(complaint => {
              const item = result.items?.find(orderItem => orderItem.id === complaint.order_item_id);
              return (
                <Card key={complaint.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-slate-900">{complaint.category.replaceAll('_', ' ')} · {item?.product?.name || (complaint.order_item_id ? `Order item #${complaint.order_item_id}` : 'Entire order')}</p>
                      <p className="mt-1 text-xs text-slate-500">Report {complaint.id} · {new Date(complaint.created_at).toLocaleString()}</p>
                    </div>
                    {item && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">Qty {item.quantity} · order item #{item.id}</span>}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{complaint.description}</p>
                  {item && <p className="mt-3 text-xs font-semibold text-slate-600">Use this item&apos;s batch trace above to identify its supplying merchant and recorded supplier.</p>}
                </Card>
              );
            }) : (
              <Card className="rounded-2xl border-0 p-5 shadow-sm"><p className="text-sm text-slate-500">No customer issue reports are linked to this order.</p></Card>
            )}
          </section>

          <IncidentForm applicationId={result.items?.flatMap(item => item.batches).find(trace => trace.batch)?.batch?.application_id || ''} orderId={result.order.id} description={incidentDescription} setDescription={setIncidentDescription} category={incidentCategory} setCategory={setIncidentCategory} severity={incidentSeverity} setSeverity={setIncidentSeverity} submit={reportIncident} working={working} />
          <FulfillmentForm applicationId={fulfillmentApplicationId} setApplicationId={setFulfillmentApplicationId} merchants={[...new Map((result.items || []).flatMap(item => item.batches).filter(trace => trace.batch?.merchant).map(trace => [trace.batch!.application_id, trace.batch!.merchant!])).values()]} eventType={fulfillmentEvent} setEventType={setFulfillmentEvent} note={fulfillmentNote} setNote={setFulfillmentNote} submit={addFulfillmentEvent} events={result.fulfillment || []} working={working} canRecord={result.items?.some(item => item.batches.some(trace => trace.batch)) === true} />
          <IncidentList incidents={result.incidents || []} update={updateIncident} working={working} />
        </div>
      )}

      {!loading && result?.batches && (
        <div className="mt-6 space-y-5">
          {result.batches.map(batch => (
            <Card key={batch.id} className="space-y-5 rounded-2xl border-0 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary">Batch {batch.id}</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Lot {batch.lot_code}</h2>
                  <p className="text-sm text-slate-600">{batch.product?.name || 'Product'} · {batch.merchant?.merchant_code || batch.merchant?.business_name || 'Merchant unavailable'}</p>
                  <p className="mt-1 text-xs text-slate-500">{batch.merchant?.town}, {batch.merchant?.county} · Supplier {batch.supplier_name || 'Not recorded'}</p>
                  <p className="text-xs text-slate-500">Received {new Date(batch.received_at).toLocaleString()} · Expiry {batch.expiry_at || 'Not recorded'} · Qty received {batch.quantity_received}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${batch.holds.some(hold => !hold.released_at) ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {batch.holds.some(hold => !hold.released_at) ? 'Hold active' : 'Not held'}
                </span>
              </div>
              <HoldControls batch={batch} working={working} holdReason={holdReason} setHoldReason={setHoldReason} releaseReason={releaseReason} setReleaseReason={setReleaseReason} action={action} setHoldBatch={setHoldBatch} holdBatch={holdBatch} />
              <div>
                <h3 className="mb-2 text-xs font-black uppercase text-slate-700">Related orders</h3>
                {batch.orders?.length ? batch.orders.map(trace => (
                  <button key={trace.id} onClick={() => void lookup('order', String(trace.order?.id || ''))} className="mr-2 mb-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold hover:bg-slate-200">
                    Order #{trace.order?.id} · {trace.quantity} units · {trace.order?.customer} · {trace.order?.status}
                  </button>
                )) : <p className="text-xs text-slate-500">No associated orders have been traced.</p>}
              </div>
              <MovementList movements={batch.movements} />
              <IncidentForm applicationId={batch.application_id} batchId={batch.id} description={incidentDescription} setDescription={setIncidentDescription} category={incidentCategory} setCategory={setIncidentCategory} severity={incidentSeverity} setSeverity={setIncidentSeverity} submit={reportIncident} working={working} />
            </Card>
          ))}
        </div>
      )}

      {result?.order && (result.fulfillment || []).length > 0 && (
        <Card className="mt-5 rounded-2xl border-0 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-black uppercase">Fulfilment timeline</h3>
          <ol className="space-y-2">
            {result.fulfillment?.map(event => <li key={event.id} className="flex items-center justify-between gap-3 text-sm"><span><strong>{event.event_type.replaceAll('_', ' ')}</strong> · {event.actor}</span><time className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString()}</time></li>)}
          </ol>
        </Card>
      )}

      {canManageInventory && <Card className="mt-8 rounded-2xl border-0 p-5 shadow-sm sm:p-7">
        <h2 className="flex items-center gap-2 text-lg font-black uppercase text-slate-900"><ArrowDownToLine size={19} /> Receive a tracked batch</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Only verified merchants can receive stock. Every receipt creates an immutable inventory movement.</p>
        <form onSubmit={receiveBatch} className="grid gap-3 md:grid-cols-2">
          <select required value={receive.applicationId} onChange={event => setReceive(current => ({ ...current, applicationId: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select verified merchant</option>
            {catalog.merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.merchant_code} · {merchant.business_name}</option>)}
          </select>
          <select required value={receive.productId} onChange={event => setReceive(current => ({ ...current, productId: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">Select live product</option>
            {catalog.products.map(product => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}
          </select>
          <Input required value={receive.lotCode} onChange={event => setReceive(current => ({ ...current, lotCode: event.target.value }))} maxLength={120} placeholder="Batch / supplier lot code" className="h-11 rounded-xl" />
          <Input required type="number" min="1" max="1000000" value={receive.quantity} onChange={event => setReceive(current => ({ ...current, quantity: event.target.value }))} placeholder="Quantity received" className="h-11 rounded-xl" />
          <Input value={receive.supplierName} onChange={event => setReceive(current => ({ ...current, supplierName: event.target.value }))} maxLength={160} placeholder="Supplier / source" className="h-11 rounded-xl" />
          <Input type="date" value={receive.expiryAt} onChange={event => setReceive(current => ({ ...current, expiryAt: event.target.value }))} className="h-11 rounded-xl" />
          <Input value={receive.storageNotes} onChange={event => setReceive(current => ({ ...current, storageNotes: event.target.value }))} maxLength={1000} placeholder="Storage notes (optional)" className="h-11 rounded-xl md:col-span-2" />
          <Button disabled={working || !catalog.merchants.length || !catalog.products.length} className="h-11 rounded-xl font-black uppercase md:col-span-2">{working ? <Loader2 className="animate-spin" /> : 'Record receipt'}</Button>
        </form>
      </Card>}

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={() => { setResult(null); void loadCatalog(); }} className="rounded-xl text-slate-500"><RefreshCcw size={15} className="mr-2" /> Clear trace</Button>
      </div>
    </div>
  );
}

function HoldControls({
  batch, working, holdReason, setHoldReason, releaseReason, setReleaseReason, action, setHoldBatch, holdBatch
}: {
  batch: Batch;
  working: boolean;
  holdReason: string;
  setHoldReason: (value: string) => void;
  releaseReason: string;
  setReleaseReason: (value: string) => void;
  action: (payload: Record<string, unknown>) => Promise<void>;
  setHoldBatch: (id: string | null) => void;
  holdBatch: string | null;
}) {
  const activeHold = batch.holds.find(hold => !hold.released_at);
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      {activeHold ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={releaseReason} onChange={event => setReleaseReason(event.target.value)} maxLength={2000} placeholder={`Hold: ${activeHold.reason} · note to release`} className="h-10 rounded-lg" />
          <Button disabled={working || releaseReason.trim().length < 5} onClick={() => void action({ action: 'release', batchId: batch.id, releaseNote: releaseReason })} variant="outline" className="h-10 rounded-lg">Release hold</Button>
        </div>
      ) : holdBatch === batch.id ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={holdReason} onChange={event => setHoldReason(event.target.value)} maxLength={2000} placeholder="Reason for placing this batch on hold" className="h-10 rounded-lg" />
          <Button disabled={working || holdReason.trim().length < 5} onClick={() => { void action({ action: 'hold', batchId: batch.id, reason: holdReason }); setHoldBatch(null); }} variant="destructive" className="h-10 rounded-lg">Confirm hold</Button>
          <Button onClick={() => setHoldBatch(null)} variant="ghost" className="h-10 rounded-lg">Cancel</Button>
        </div>
      ) : (
        <Button onClick={() => setHoldBatch(batch.id)} variant="outline" className="h-9 rounded-lg text-rose-700"><ShieldAlert size={14} className="mr-2" /> Place batch on hold</Button>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
        {batch.holds.map(hold => <span key={hold.id}>Hold by {hold.placed_by} on {new Date(hold.placed_at).toLocaleDateString()}{hold.released_at ? ` · released ${new Date(hold.released_at).toLocaleDateString()}` : ' · ACTIVE'}</span>)}
      </div>
    </div>
  );
}

function MovementList({ movements }: { movements: Movement[] }) {
  if (!movements.length) return <p className="mt-3 text-xs text-slate-500">No inventory movements recorded.</p>;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase text-slate-500"><Clock3 size={13} /> Inventory ledger</p>
      <div className="space-y-1">
        {movements.map(movement => <p key={movement.id} className="flex justify-between gap-2 text-xs text-slate-600"><span>{movement.movement_type} · {movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta} · {movement.actor}{movement.note ? ` · ${movement.note}` : ''}</span><time className="shrink-0">{new Date(movement.created_at).toLocaleString()}</time></p>)}
      </div>
    </div>
  );
}

function IncidentForm({
  applicationId, orderId, batchId, description, setDescription, category, setCategory, severity, setSeverity, submit, working
}: {
  applicationId: string;
  orderId?: number;
  batchId?: string;
  description: string;
  setDescription: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  severity: string;
  setSeverity: (value: string) => void;
  submit: (applicationId: string, orderId?: number, batchId?: string) => void;
  working: boolean;
}) {
  if (!applicationId) return null;
  return (
    <Card className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5 shadow-none">
      <h3 className="flex items-center gap-2 font-black uppercase text-amber-950"><AlertTriangle size={17} /> Report / update incident</h3>
      <p className="mb-3 mt-1 text-xs text-amber-900">Record observed facts. This report does not automatically determine cause or product safety.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={category} onChange={event => setCategory(event.target.value)} className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm">{incidentCategories.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
        <select value={severity} onChange={event => setSeverity(event.target.value)} className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm">{['unassessed', 'low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{value}</option>)}</select>
      </div>
      <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} rows={3} placeholder="Describe the report (minimum 10 characters)" className="mt-2 w-full rounded-lg border border-amber-200 p-3 text-sm" />
      <Button disabled={working || description.trim().length < 10} onClick={() => submit(applicationId, orderId, batchId)} variant="outline" className="mt-2 rounded-lg border-amber-300">Record incident</Button>
    </Card>
  );
}

function FulfillmentForm({
  applicationId, setApplicationId, merchants, eventType, setEventType, note, setNote, submit, events, working, canRecord
}: {
  applicationId: string;
  setApplicationId: (value: string) => void;
  merchants: Merchant[];
  eventType: string;
  setEventType: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  events: TraceResult['fulfillment'];
  working: boolean;
  canRecord: boolean;
}) {
  const merchantEvents = events?.filter(event => event.application_id === applicationId) || [];
  const lastEvent = merchantEvents[merchantEvents.length - 1]?.event_type;
  const availableEvents = fulfillmentTransitions[lastEvent || 'start'] || fulfillmentTransitions.start;
  useEffect(() => {
    if (availableEvents.length && !availableEvents.includes(eventType)) {
      setEventType(availableEvents[0]);
    }
  }, [availableEvents, eventType, setEventType]);
  return (
    <Card className="rounded-2xl border-0 p-5 shadow-sm">
      <h3 className="mb-3 font-black uppercase text-slate-900">Fulfilment timeline</h3>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
        <select value={applicationId} onChange={event => setApplicationId(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">{merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.merchant_code || merchant.business_name}</option>)}</select>
        <select value={availableEvents.includes(eventType) ? eventType : availableEvents[0] || ''} onChange={event => setEventType(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">{availableEvents.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
        <Input value={note} onChange={event => setNote(event.target.value)} maxLength={1000} placeholder={eventType === 'accepted' ? 'Merchant confirmation details (required)' : 'Event note (optional)'} className="h-10 rounded-lg" />
        <Button disabled={working || !canRecord || !availableEvents.length || (eventType === 'accepted' && note.trim().length < 8)} className="h-10 rounded-lg">Record event</Button>
      </form>
      {!canRecord && <p className="mt-2 text-xs text-slate-500">A merchant batch must first be linked to an order item.</p>}
      {eventType === 'accepted' && <p className="mt-2 text-xs text-amber-700">This records an admin-confirmed merchant response; it does not contact or notify the merchant. Include the confirmation channel/time.</p>}
      <ol className="mt-4 space-y-2">
        {events?.map(event => <li key={event.id} className="flex justify-between gap-3 text-xs"><span><strong>{event.event_type.replaceAll('_', ' ')}</strong> · {event.merchant?.merchant_code || event.merchant?.business_name || 'Merchant'} · {event.actor}</span><time className="text-slate-500">{new Date(event.occurred_at).toLocaleString()}</time></li>)}
        {!events?.length && <p className="text-xs text-slate-500">No fulfilment events have been recorded.</p>}
      </ol>
    </Card>
  );
}

function IncidentList({ incidents, update, working }: { incidents: Incident[]; update: (id: string, status: string, resolutionNote?: string) => void; working: boolean }) {
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  if (!incidents.length) return <Card className="rounded-2xl border-0 p-5 shadow-sm"><p className="text-sm text-slate-500">No incident reports linked to this order.</p></Card>;
  return (
    <div className="space-y-3">
      {incidents.map(incident => (
        <Card key={incident.id} className="rounded-2xl border-0 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-black text-slate-900">{incident.incident_code} · {incident.category.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{incident.severity} · {new Date(incident.created_at).toLocaleString()}</p><p className="mt-2 text-sm text-slate-700">{incident.description}</p></div>
            <div className="flex flex-col gap-2">
              {['resolved', 'closed'].includes(incident.status) && <p className="text-xs text-emerald-700">Resolution: {incident.resolution_note || 'recorded'}</p>}
              <Input value={resolutionNotes[incident.id] || ''} onChange={event => setResolutionNotes(current => ({ ...current, [incident.id]: event.target.value }))} maxLength={2000} placeholder="Resolution note to close" className="h-9 rounded-lg text-xs" />
              <select disabled={working} value={incident.status} onChange={event => {
                const status = event.target.value;
                const resolutionNote = resolutionNotes[incident.id] || '';
                update(incident.id, status, resolutionNote);
              }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold">{(incidentTransitions[incident.status] || incidentStatuses).map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">{incident.events.map(event => <span key={event.id}><CheckCircle2 size={12} className="mr-1 inline" />{event.event_type} by {event.actor} · {new Date(event.created_at).toLocaleString()}</span>)}</div>
        </Card>
      ))}
    </div>
  );
}
