'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, PackageSearch, ShieldCheck, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MerchantDocument {
  id: string;
  type: string;
  name: string;
  expiresAt?: string;
}

interface MerchantApplication {
  id: string;
  merchant_code: string | null;
  business_name: string;
  trading_name: string | null;
  business_type: string;
  email: string;
  phone: string;
  owner_name: string;
  owner_role: string;
  address: string;
  country: string;
  county: string;
  town: string;
  operating_areas: string[];
  operating_hours: Record<string, string>;
  cuisine_or_category: string | null;
  preparation_capacity: number | null;
  delivery_radius_km: number | null;
  collection_available: boolean;
  documents: MerchantDocument[];
  status: string;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface MerchantStoreData {
  application: MerchantApplication;
  applicationEvents: Array<{ id: number; event_type: string; actor: string; details: Record<string, unknown>; created_at: string }>;
  batches: Array<{
    id: string;
    product_id: number;
    lot_code: string;
    supplier_name: string | null;
    received_at: string;
    expiry_at: string | null;
    quantity_received: number;
    storage_notes: string | null;
    product: { id: number; name: string; sku: string | null } | null;
    movements: Array<{ id: number; movement_type: string; quantity_delta: number; actor: string; note: string | null; created_at: string }>;
    holds: Array<{ id: number; reason: string; placed_by: string; placed_at: string; released_by: string | null; released_at: string | null; release_note: string | null }>;
    orders: Array<{ id: number; quantity: number; created_at: string; order: { id: number; status: string; created_at: string } | null }>;
  }>;
  fulfillment: Array<{ id: number; order_id: number; event_type: string; actor: string; details: Record<string, unknown>; occurred_at: string; order: { id: number; status: string; created_at: string } | null }>;
  incidents: Array<{
    id: string;
    incident_code: string;
    batch_id: string | null;
    order_id: number | null;
    category: string;
    description: string;
    status: string;
    severity: string;
    resolution_note: string | null;
    created_at: string;
    order: { id: number; status: string; created_at: string } | null;
    events: Array<{ id: number; event_type: string; actor: string; details: Record<string, unknown>; created_at: string }>;
  }>;
}

function dateTime(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value || 'Not provided'}</p></div>;
}

export default function MerchantStorePage() {
  const params = useParams<{ id: string }>();
  const merchantId = params.id;
  const [data, setData] = useState<MerchantStoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);

  const loadStore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/merchant-store/${encodeURIComponent(merchantId)}`, { cache: 'no-store' });
      const result = await response.json() as Partial<MerchantStoreData> & { error?: string };
      if (!response.ok || !result.application) throw new Error(result.error || 'Merchant store could not be loaded.');
      setData(result as MerchantStoreData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Merchant store could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => { void loadStore(); }, [loadStore]);

  const openDocument = async (document: MerchantDocument) => {
    const tab = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!tab) {
      setError('Allow pop-ups for this admin page to securely view merchant documents.');
      return;
    }
    setOpeningDocument(document.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/merchant-applications?id=${encodeURIComponent(merchantId)}&document=${encodeURIComponent(document.id)}`, { cache: 'no-store' });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || 'Merchant document could not be opened.');
      tab.location.href = result.url;
    } catch (openError) {
      tab.close();
      setError(openError instanceof Error ? openError.message : 'Merchant document could not be opened.');
    } finally {
      setOpeningDocument(null);
    }
  };

  if (loading && !data) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm font-semibold text-slate-500"><Loader2 className="mr-2 animate-spin" />Loading merchant store...</div>;
  }
  if (!data) {
    return <div className="p-4 sm:p-8"><Link href="/admin/merchants" className="inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft size={16} /> Merchant network</Link><div role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error || 'Merchant store could not be loaded.'}</div><Button onClick={() => void loadStore()} className="mt-4 rounded-xl">Try again</Button></div>;
  }

  const application = data.application;
  const availableCount = (batch: MerchantStoreData['batches'][number]) => Math.max(
    0,
    batch.movements.reduce((total, movement) => total + movement.quantity_delta, 0)
  );

  return (
    <main className="min-h-screen bg-slate-50 p-4 pb-24 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/merchants" className="mb-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-primary"><ArrowLeft size={15} /> Merchant network</Link>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-primary"><Store size={15} /> Read-only merchant store</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{application.trading_name || application.business_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{application.merchant_code || 'Pending merchant code'} · {application.status.replaceAll('_', ' ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black uppercase text-emerald-800"><ShieldCheck size={15} /> View only</span>
          <Link href="/admin/traceability" className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary"><PackageSearch size={15} className="mr-2" /> Traceability</Link>
        </div>
      </header>

      {error && <div role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
      {loading && <p className="mb-4 flex items-center text-xs font-semibold text-slate-500"><Loader2 size={14} className="mr-2 animate-spin" />Refreshing store details...</p>}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Detail label="Merchant type" value={application.business_type.replaceAll('_', ' ')} />
        <Detail label="Contact" value={`${application.email} · ${application.phone}`} />
        <Detail label="Owner" value={`${application.owner_name} · ${application.owner_role}`} />
        <Detail label="Location" value={`${application.address}, ${application.town}, ${application.county}, ${application.country}`} />
        <Detail label="Operating areas" value={application.operating_areas?.join(', ')} />
        <Detail label="Category" value={application.cuisine_or_category} />
        <Detail label="Preparation capacity" value={application.preparation_capacity} />
        <Detail label="Delivery radius" value={application.delivery_radius_km ? `${application.delivery_radius_km} km` : null} />
        <Detail label="Collection" value={application.collection_available ? 'Available' : 'Not listed'} />
        <Detail label="Application submitted" value={dateTime(application.submitted_at)} />
        <Detail label="Last reviewed" value={application.reviewed_at ? `${dateTime(application.reviewed_at)} by ${application.reviewed_by || 'Admin'}` : null} />
        <Detail label="Latest review note" value={application.review_note} />
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl border-0 p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-black uppercase text-slate-900"><FileText size={16} /> Business documents</h2>
          <div className="space-y-2">
            {application.documents.map(document => (
              <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div><p className="text-sm font-bold text-slate-800">{document.name}</p><p className="text-xs text-slate-500">{document.type.replaceAll('_', ' ')} · Expires {document.expiresAt || 'not recorded'}</p></div>
                <Button variant="outline" disabled={openingDocument === document.id} onClick={() => void openDocument(document)} className="h-9 rounded-lg text-xs">
                  {openingDocument === document.id ? <Loader2 size={14} className="animate-spin" /> : 'View securely'}
                </Button>
              </div>
            ))}
            {application.documents.length === 0 && <p className="text-sm text-slate-500">No documents were submitted.</p>}
          </div>
        </Card>
        <Card className="rounded-2xl border-0 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-black uppercase text-slate-900">Operating hours</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(application.operating_hours || {}).map(([day, hours]) => <Detail key={day} label={day} value={hours} />)}
            {!Object.keys(application.operating_hours || {}).length && <p className="text-sm text-slate-500">No operating hours were provided.</p>}
          </div>
        </Card>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-xl font-black uppercase text-slate-900">Store inventory</h2><p className="text-sm text-slate-500">Read-only catalog and lot history.</p></div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600">{data.batches.length} tracked lots</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.batches.map(batch => (
            <Card key={batch.id} className="rounded-2xl border-0 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-black text-slate-900">{batch.product?.name || `Product #${batch.product_id}`}</h3><p className="text-xs text-slate-500">{batch.product?.sku || 'No SKU'} · Lot {batch.lot_code}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${batch.holds.some(hold => !hold.released_at) ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{batch.holds.some(hold => !hold.released_at) ? 'On hold' : `${availableCount(batch)} available`}</span>
              </div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                <p>Received: {batch.quantity_received} on {dateTime(batch.received_at)}</p><p>Expires: {batch.expiry_at || 'Not recorded'}</p>
                <p>Supplier: {batch.supplier_name || 'Not recorded'}</p><p>Orders traced: {batch.orders.length}</p>
                {batch.storage_notes && <p className="sm:col-span-2">Storage notes: {batch.storage_notes}</p>}
              </div>
              {!!batch.orders.length && <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-1 text-[10px] font-black uppercase text-slate-500">Traced orders</p>{batch.orders.map(order => <p key={order.id} className="text-xs text-slate-700">Order #{order.order?.id || '—'} · {order.quantity} units · {order.order?.status || 'Status unavailable'} · {dateTime(order.order?.created_at || order.created_at)}</p>)}</div>}
              {!!batch.holds.length && <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-1 text-[10px] font-black uppercase text-slate-500">Hold history</p>{batch.holds.map(hold => <p key={hold.id} className="text-xs text-slate-700">{hold.reason} · {hold.released_at ? `Released ${dateTime(hold.released_at)}` : `Active since ${dateTime(hold.placed_at)}`}</p>)}</div>}
              {!!batch.movements.length && <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-1 text-[10px] font-black uppercase text-slate-500">Inventory movements</p>{batch.movements.slice(0, 8).map(movement => <p key={movement.id} className="text-xs text-slate-700">{movement.movement_type.replaceAll('_', ' ')} · {movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta} · {dateTime(movement.created_at)}{movement.note ? ` · ${movement.note}` : ''}</p>)}</div>}
            </Card>
          ))}
          {!data.batches.length && <Card className="rounded-2xl border-0 p-6 text-sm text-slate-500 shadow-sm">No tracked inventory has been recorded for this merchant.</Card>}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl border-0 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-black uppercase text-slate-900">Fulfilment history</h2>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {data.fulfillment.map(event => <div key={event.id} className="border-l-2 border-primary/30 pl-3"><p className="text-sm font-bold text-slate-800">Order #{event.order_id} · {event.event_type.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{dateTime(event.occurred_at)} · {event.actor}{event.order ? ` · Order status: ${event.order.status}` : ''}</p>{Object.keys(event.details || {}).length > 0 && <p className="mt-1 break-words text-xs text-slate-500">{JSON.stringify(event.details)}</p>}</div>)}
            {!data.fulfillment.length && <p className="text-sm text-slate-500">No fulfilment events have been recorded.</p>}
          </div>
        </Card>
        <Card className="rounded-2xl border-0 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-black uppercase text-slate-900">Incidents</h2>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {data.incidents.map(incident => <div key={incident.id} className="rounded-xl border border-slate-100 p-3"><p className="font-bold text-slate-900">{incident.incident_code} · {incident.status.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">{incident.category.replaceAll('_', ' ')} · {incident.severity} · {dateTime(incident.created_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{incident.description}</p>{incident.resolution_note && <p className="mt-2 text-xs text-slate-600">Resolution: {incident.resolution_note}</p>}{incident.events.map(event => <p key={event.id} className="mt-2 text-xs text-slate-500">{event.event_type} · {event.actor} · {dateTime(event.created_at)}</p>)}</div>)}
            {!data.incidents.length && <p className="text-sm text-slate-500">No incidents recorded.</p>}
          </div>
        </Card>
        <Card className="rounded-2xl border-0 p-5 shadow-sm xl:col-span-2">
          <h2 className="mb-4 text-sm font-black uppercase text-slate-900">Merchant audit history</h2>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {data.applicationEvents.map(event => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-xs"><span className="font-bold text-slate-700">{event.event_type.replaceAll('_', ' ')} · {event.actor}{Object.keys(event.details || {}).length > 0 ? ` · ${JSON.stringify(event.details)}` : ''}</span><time className="text-slate-400">{dateTime(event.created_at)}</time></div>)}
            {!data.applicationEvents.length && <p className="text-sm text-slate-500">No audit history recorded.</p>}
          </div>
        </Card>
      </section>
    </main>
  );
}
