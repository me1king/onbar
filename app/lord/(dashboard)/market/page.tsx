'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Check, RefreshCw, Store, X, Ban, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

interface Application {
  id: string;
  business_name: string;
  requested_slug: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  business_description: string;
  status: string;
  review_note: string | null;
  reviewed_by_email: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  submitted_at: string;
}

interface ProductListing {
  id: string;
  name: string;
  description: string | null;
  availability_status: 'available_now' | 'planned' | 'made_to_order';
  estimated_available_on: string | null;
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
  review_note: string | null;
  attributes: Record<string, string>;
  delivery_information: string | null;
  return_policy: string | null;
  merchant: { name: string; slug: string };
  category: { name: string } | null;
  variants: Array<{ price_minor: number; sale_price_minor: number | null; sku: string | null; currency: string; size: string | null; color: string | null }>;
  images: Array<{ url: string; alt: string; mediaType: 'image' | 'video' }>;
}

interface Merchant {
  id: string;
  name: string;
  slug: string;
  status: 'approved' | 'suspended';
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

interface MarketCampaign {
  title: string;
  message: string;
  published: boolean;
}

interface MarketOffer {
  id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  listed_price_minor: number;
  latest_amount_minor: number;
  accepted_amount_minor: number | null;
  status: string;
  expires_at: string;
  created_at: string;
  product: { name: string; slug: string };
  merchant: { name: string; slug: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null };
  variant: { size: string | null; color: string | null };
  messages: Array<{ actor: string; action: string; amount_minor: number | null; message: string | null; created_at: string }>;
}

interface MarketOrderRequest {
  id: string;
  reference: string;
  product_name: string;
  variant_label: string;
  quantity: number;
  unit_price_minor: number;
  total_minor: number;
  currency: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_note: string | null;
  status: 'requested' | 'confirmed' | 'preparing' | 'ready' | 'fulfilled' | 'cancelled';
  payment_status: 'unpaid' | 'paid';
  created_at: string;
  updated_at: string;
  merchant: { id: string; name: string; slug: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null };
  events: Array<{ actor: string; actor_email: string | null; action: string; from_status: string | null; to_status: string; note: string | null; created_at: string }>;
}

export default function MarketOperationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [orders, setOrders] = useState<MarketOrderRequest[]>([]);
  const [ordersError, setOrdersError] = useState('');
  const [offerCounterAmounts, setOfferCounterAmounts] = useState<Record<string, string>>({});
  const [offerAdminMessages, setOfferAdminMessages] = useState<Record<string, string>>({});
  const [orderAdminNotes, setOrderAdminNotes] = useState<Record<string, string>>({});
  const [campaign, setCampaign] = useState<MarketCampaign>({ title: '', message: '', published: false });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [workingProductId, setWorkingProductId] = useState<string | null>(null);
  const [workingMerchantId, setWorkingMerchantId] = useState<string | null>(null);
  const [campaignWorking, setCampaignWorking] = useState(false);
  const [workingOfferId, setWorkingOfferId] = useState<string | null>(null);
  const [workingOrderId, setWorkingOrderId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const orderRequest = fetch('/api/admin/market/orders', { cache: 'no-store' }).catch(() => null);
      const [applicationResponse, productResponse, merchantResponse, campaignResponse, offerResponse] = await Promise.all([
        fetch('/api/admin/market/applications', { cache: 'no-store' }),
        fetch('/api/admin/market/products', { cache: 'no-store' }),
        fetch('/api/admin/market/merchants', { cache: 'no-store' }),
        fetch('/api/admin/market/campaign', { cache: 'no-store' }),
        fetch('/api/admin/market/offers', { cache: 'no-store' })
      ]);
      const orderResponse = await orderRequest;
      const [applicationResult, productResult, merchantResult, campaignResult, offerResult] = await Promise.all([
        applicationResponse.json() as Promise<{ applications?: Application[]; error?: string }>,
        productResponse.json() as Promise<{ products?: ProductListing[]; error?: string }>,
        merchantResponse.json() as Promise<{ merchants?: Merchant[]; error?: string }>,
        campaignResponse.json() as Promise<{ campaign?: MarketCampaign; error?: string }>,
        offerResponse.json() as Promise<{ offers?: MarketOffer[]; error?: string }>
      ]);
      let orderResult: { orders?: MarketOrderRequest[]; error?: string };
      try {
        orderResult = orderResponse
          ? await orderResponse.json() as { orders?: MarketOrderRequest[]; error?: string }
          : { error: 'The marketplace order service could not be reached.' };
      } catch {
        orderResult = { error: 'Could not read the marketplace order response.' };
      }
      if (!applicationResponse.ok) throw new Error(applicationResult.error || 'Could not load seller applications.');
      if (!productResponse.ok) throw new Error(productResult.error || 'Could not load product listings.');
      if (!merchantResponse.ok) throw new Error(merchantResult.error || 'Could not load merchants.');
      if (!campaignResponse.ok || !campaignResult.campaign) throw new Error(campaignResult.error || 'Could not load Market campaign settings.');
      if (!offerResponse.ok) throw new Error(offerResult.error || 'Could not load marketplace offers.');
      setApplications(applicationResult.applications || []);
      setProducts(productResult.products || []);
      setMerchants(merchantResult.merchants || []);
      setOffers(offerResult.offers || []);
      setOrders(orderResponse?.ok ? orderResult.orders || [] : []);
      setOrdersError(orderResponse?.ok ? '' : orderResult.error || 'Could not load marketplace order requests.');
      setCampaign(campaignResult.campaign);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load seller applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadApplications(); }, [loadApplications]);

  async function review(application: Application, action: 'approve' | 'reject' | 'request_information') {
    const note = reviewNotes[application.id]?.trim() || '';
    if (action !== 'approve' && note.length < 5) {
      setError('Add at least five characters explaining the decline or information request.');
      return;
    }

    setWorkingId(application.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: application.id, action, note })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not review this application.');
      setMessage(action === 'approve'
        ? `${application.business_name} was approved.`
        : action === 'reject'
          ? `${application.business_name} was declined.`
          : `More information was requested from ${application.business_name}.`);
      await loadApplications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review this application.');
    } finally {
      setWorkingId(null);
    }
  }

  async function setMerchantStatus(merchant: Merchant, status: 'approved' | 'suspended') {
    setWorkingMerchantId(merchant.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: merchant.id, status })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this boutique.');
      setMessage(`${merchant.name} was ${status === 'suspended' ? 'suspended' : 'reactivated'}.`);
      await loadApplications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this boutique.');
    } finally {
      setWorkingMerchantId(null);
    }
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCampaignWorking(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign)
      });
      const result = await response.json() as { campaign?: MarketCampaign; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error || 'Could not save Market campaign settings.');
      setCampaign(result.campaign);
      setMessage(result.campaign.published ? 'Market campaign published.' : 'Market campaign unpublished.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save Market campaign settings.');
    } finally {
      setCampaignWorking(false);
    }
  }

  async function reviewProduct(product: ProductListing, status: ProductListing['status']) {
    const reviewNote = reviewNotes[product.id]?.trim() || '';
    if (['rejected', 'archived'].includes(status) && reviewNote.length < 5) {
      setError('Add at least five characters explaining why this listing is declined or hidden.');
      return;
    }
    setWorkingProductId(product.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, status, reviewNote })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this listing.');
      const labels: Record<ProductListing['status'], string> = {
        draft: 'saved as a draft',
        pending_review: 'returned to review',
        published: 'published',
        rejected: 'declined',
        archived: 'hidden from the marketplace'
      };
      setMessage(`${product.name} was ${labels[status]}.`);
      await loadApplications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this listing.');
    } finally {
      setWorkingProductId(null);
    }
  }

  async function updateOrder(order: MarketOrderRequest, status: 'paid' | Exclude<MarketOrderRequest['status'], 'requested'>) {
    const note = orderAdminNotes[order.id]?.trim() || '';
    if (note.length < 5) {
      setError('Add an audit note of at least five characters before changing an order.');
      return;
    }
    setWorkingOrderId(order.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status, note })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this order request.');
      setMessage(status === 'paid'
        ? `Offline payment recorded for ${order.reference}.`
        : `Order ${order.reference} moved to ${status.replace(/_/g, ' ')}.`);
      await loadApplications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this order request.');
    } finally {
      setWorkingOrderId(null);
    }
  }

  async function respondToOffer(offer: MarketOffer, action: 'accept' | 'counter' | 'decline') {
    const amountMinor = Math.round(Number(offerCounterAmounts[offer.id]) * 100);
    const adminMessage = offerAdminMessages[offer.id]?.trim() || '';
    if (action === 'counter' && (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > offer.listed_price_minor)) {
      setError('Enter a counteroffer between KSh 1 and the listed price.');
      return;
    }
    if (adminMessage.length > 500) {
      setError('Keep the coordination message under 500 characters.');
      return;
    }
    setWorkingOfferId(offer.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id, action, amountMinor, message: adminMessage })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this offer.');
      setMessage(action === 'accept' ? 'The proposed price was accepted.' : action === 'counter' ? 'Market Operations sent a counteroffer.' : 'The offer was declined.');
      await loadApplications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this offer.');
    } finally {
      setWorkingOfferId(null);
    }
  }

  return (
    <main className="p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Midnight Market</p>
          <h1 className="mt-2 text-3xl font-black">Halloween Market Desk</h1>
          <p className="mt-2 text-sm text-slate-500">Review sellers and listings, then suspend or restore any boutique. Event registration stays independent.</p>
        </div>
        <Button onClick={() => void loadApplications()} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
        <Link href="/lord/waitlist" className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Open waitlist controls
        </Link>
      </div>

      {error && <div role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
      {message && <div role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {loading && <p className="mt-8 text-sm text-slate-500">Loading applications…</p>}
      {!loading && !error && applications.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No seller applications are waiting for review.</div>
      )}

      <div className="mt-6 space-y-4">
        {applications.map((application) => (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" key={application.id}>
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-primary"><Store size={17} /><h2 className="text-xl font-bold text-slate-900">{application.business_name}</h2></div>
                <p className="mt-1 text-xs text-slate-500">Requested boutique: /market/store/{application.requested_slug}</p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{application.business_description}</p>
                <div className="mt-4 grid gap-1 text-sm text-slate-600">
                  <span>{application.contact_name} · {application.contact_email} · {application.contact_phone}</span>
                  <span>Submitted {new Date(application.submitted_at).toLocaleString()}</span>
                  <span>Review state: {application.status.replace(/_/g, ' ')}{application.reviewed_by_email ? ` · last reviewed by ${application.reviewed_by_email}` : ''}</span>
                  <span className={application.emailVerified ? 'text-emerald-700' : 'text-amber-700'}>
                    Email {application.emailVerified ? 'verified' : 'not verified'}
                  </span>
                  <span className={application.phoneVerified ? 'text-emerald-700' : 'text-amber-700'}>
                    Phone {application.phoneVerified ? 'verified' : 'not verified'}
                  </span>
                  {application.review_note && <span className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">Previous note: {application.review_note}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={workingId === application.id || !application.emailVerified || !application.phoneVerified} onClick={() => void review(application, 'approve')} className="gap-2 bg-emerald-700 hover:bg-emerald-800">
                  <Check size={15} /> Approve
                </Button>
                <Button disabled={workingId === application.id} onClick={() => void review(application, 'reject')} variant="outline" className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50">
                  <X size={15} /> Decline
                </Button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <textarea
                aria-label={`Review note for ${application.business_name}`}
                className="min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                maxLength={1000}
                placeholder="Add a note or explain what information the seller needs to provide."
                value={reviewNotes[application.id] || ''}
                onChange={(event) => setReviewNotes({ ...reviewNotes, [application.id]: event.target.value })}
              />
              <Button disabled={workingId === application.id || (reviewNotes[application.id] || '').trim().length < 5} onClick={() => void review(application, 'request_information')} variant="outline">
                Request information
              </Button>
            </div>
            {!application.emailVerified || !application.phoneVerified
              ? <p className="mt-3 text-xs text-amber-800">Approval is locked until the applicant verifies the matching email and phone on their account.</p>
              : null}
          </article>
        ))}
      </div>

      <section className="mt-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Catalog control</p>
          <h2 className="mt-2 text-2xl font-black">All product listings</h2>
          <p className="mt-2 text-sm text-slate-500">Review submissions, publish or decline products, and hide or restore any listing. Hidden products do not appear in the customer catalog.</p>
        </div>
        {!loading && products.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No marketplace listings yet.</div>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={product.id}>
              {product.images[0] && <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-xl">{product.images[0].mediaType === 'video' ? <video className="h-full w-full object-cover" src={product.images[0].url} controls aria-label={product.images[0].alt} /> : <Image className="object-cover" src={product.images[0].url} alt={product.images[0].alt} fill unoptimized sizes="(max-width: 800px) 100vw, 50vw" />}</div>}
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{product.merchant.name} · {product.category?.name || 'Uncategorized'} · {product.status.replace(/_/g, ' ')}</p>
              <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                product.availability_status === 'planned' ? 'bg-amber-100 text-amber-900'
                  : product.availability_status === 'made_to_order' ? 'bg-violet-100 text-violet-900'
                    : 'bg-emerald-100 text-emerald-900'
              }`}>
                Availability: {product.availability_status.replace(/_/g, ' ')}
                {product.estimated_available_on ? ` · estimated ${product.estimated_available_on}` : ''}
              </p>
              {product.availability_status !== 'available_now' && (
                <p className="mt-2 text-xs text-amber-900">Interest enquiries only. This listing cannot take orders or payment until its availability is changed and approved.</p>
              )}
              <h3 className="mt-2 text-lg font-bold text-slate-900">{product.name}</h3>
              {product.description && <p className="mt-2 text-sm text-slate-600">{product.description}</p>}
              {product.review_note && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Last admin note: {product.review_note}</p>}
              {product.variants[0] && <p className="mt-2 font-semibold text-slate-800">KSh {(product.variants[0].sale_price_minor ? product.variants[0].sale_price_minor / 100 : product.variants[0].price_minor / 100).toLocaleString('en-KE')}{product.variants[0].sale_price_minor && <span className="ml-2 text-sm text-slate-400 line-through">KSh {(product.variants[0].price_minor / 100).toLocaleString('en-KE')}</span>}</p>}
              {Object.entries(product.attributes || {}).filter(([, value]) => value).length > 0 && <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">{Object.entries(product.attributes).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="text-xs font-bold uppercase text-slate-500">{key.replace(/_/g, ' ')}</dt><dd className="text-slate-700">{value}</dd></div>)}</dl>}
              {product.delivery_information && <p className="mt-2 text-sm text-slate-600"><strong>Delivery:</strong> {product.delivery_information}</p>}
              {product.return_policy && <p className="mt-2 text-sm text-slate-600"><strong>Returns:</strong> {product.return_policy}</p>}
              <label className="mt-4 block text-sm font-semibold text-slate-700">Admin note (required when declining or hiding)<textarea className="mt-1 w-full rounded-lg border border-slate-300 p-3" maxLength={1000} rows={2} value={reviewNotes[product.id] || ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [product.id]: event.target.value })} placeholder="Explain what the merchant should correct or why you are hiding this listing." /></label>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.status !== 'published' && (
                  <Button disabled={workingProductId === product.id} onClick={() => void reviewProduct(product, 'published')} className="gap-2 bg-emerald-700 hover:bg-emerald-800"><Check size={15} /> Publish / restore</Button>
                )}
                {product.status === 'pending_review' && (
                  <Button disabled={workingProductId === product.id} onClick={() => void reviewProduct(product, 'rejected')} variant="outline" className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"><X size={15} /> Decline</Button>
                )}
                {product.status !== 'archived' && product.status !== 'rejected' && (
                  <Button disabled={workingProductId === product.id || (reviewNotes[product.id] || '').trim().length < 5} onClick={() => void reviewProduct(product, 'archived')} variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50">Hide listing</Button>
                )}
                {product.status === 'rejected' && (
                  <Button disabled={workingProductId === product.id || (reviewNotes[product.id] || '').trim().length < 5} onClick={() => void reviewProduct(product, 'pending_review')} variant="outline">Return to review</Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Price negotiation</p>
          <h2 className="mt-2 text-2xl font-black">Customer offers</h2>
          <p className="mt-2 text-sm text-slate-500">Review both sides of every negotiation, contact the buyer or boutique directly, and relay coordination notes in the shared offer thread. Acceptances are non-binding and do not create orders or payments.</p>
        </div>
        {!loading && offers.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No customer offers have been submitted.</div>
        )}
        <div className="mt-5 grid gap-4">
          {offers.map((offer) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" key={offer.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{offer.merchant.name} · {offer.product.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{[offer.variant.size, offer.variant.color].filter(Boolean).join(' / ') || 'Standard'} · {offer.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold text-slate-900">Current offer: KSh {(offer.latest_amount_minor / 100).toLocaleString('en-KE')}</p>
                  <p className="text-slate-500">Listed: KSh {(offer.listed_price_minor / 100).toLocaleString('en-KE')}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-1 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Buyer: {offer.buyer_name}</span>
                <span className="flex flex-wrap gap-x-3">
                  <a className="text-primary underline" href={`mailto:${offer.buyer_email}`}>{offer.buyer_email}</a>
                  {offer.buyer_phone && <a className="text-primary underline" href={`tel:${offer.buyer_phone}`}>{offer.buyer_phone}</a>}
                </span>
                <span className="font-semibold text-slate-800">Boutique: {offer.merchant.contact_name || offer.merchant.name}</span>
                <span className="flex flex-wrap gap-x-3">
                  {offer.merchant.contact_email && <a className="text-primary underline" href={`mailto:${offer.merchant.contact_email}`}>{offer.merchant.contact_email}</a>}
                  {offer.merchant.contact_phone && <a className="text-primary underline" href={`tel:${offer.merchant.contact_phone}`}>{offer.merchant.contact_phone}</a>}
                  {!offer.merchant.contact_email && !offer.merchant.contact_phone && <span>Contact details unavailable</span>}
                </span>
                <span>Submitted {new Date(offer.created_at).toLocaleString()} · Expires {new Date(offer.expires_at).toLocaleDateString()}</span>
              </div>
              <ol className="mt-4 grid gap-3 border-l border-slate-200 pl-4">
                {offer.messages.map((item, index) => (
                  <li key={`${item.created_at}-${index}`} className="text-sm">
                    <strong className="text-slate-900">{item.actor === 'admin' ? 'Market Operations' : item.actor === 'buyer' ? 'Customer' : 'Boutique'} · {item.action}</strong>
                    {item.amount_minor !== null && <span className="ml-2 text-slate-600">KSh {(item.amount_minor / 100).toLocaleString('en-KE')}</span>}
                    {item.message && <p className="mt-1 text-slate-600">{item.message}</p>}
                  </li>
                ))}
              </ol>
              {['pending_merchant', 'countered'].includes(offer.status) && (
                <div className="mt-5 grid gap-3">
                  <label className="grid max-w-2xl gap-2 text-xs font-semibold text-slate-600">
                    Coordination note for both parties (optional)
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={offerAdminMessages[offer.id] || ''}
                      onChange={(event) => setOfferAdminMessages({ ...offerAdminMessages, [offer.id]: event.target.value })}
                      placeholder="Share a message or next step with the buyer and boutique."
                      className="rounded-lg border border-slate-200 p-2 text-sm font-normal"
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <Button disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'accept')} className="bg-emerald-700 hover:bg-emerald-800">Accept current price</Button>
                    <label className="grid gap-2 text-xs font-semibold text-slate-600">
                      Counteroffer (KSh)
                      <input type="number" min="1" max={offer.listed_price_minor / 100} step="1" value={offerCounterAmounts[offer.id] || ''} onChange={(event) => setOfferCounterAmounts({ ...offerCounterAmounts, [offer.id]: event.target.value })} className="rounded-lg border border-slate-200 p-2" />
                    </label>
                    <Button disabled={workingOfferId === offer.id || !offerCounterAmounts[offer.id]} onClick={() => void respondToOffer(offer, 'counter')} variant="outline">Send counteroffer</Button>
                    <Button disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'decline')} variant="outline" className="border-rose-200 text-rose-700">Decline</Button>
                  </div>
                </div>
              )}
              {offer.status === 'accepted' && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Agreed price: KSh {((offer.accepted_amount_minor || offer.latest_amount_minor) / 100).toLocaleString('en-KE')}. This is not an order or payment.</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Sales coordination</p>
          <h2 className="mt-2 text-2xl font-black">Order control & customer requests</h2>
          <p className="mt-2 text-sm text-slate-500">Coordinate with both parties, advance or cancel order requests, and review every intervention in the audit history. These are not completed sales. Only record offline payment after independently confirming it was received.</p>
        </div>
        {!loading && orders.length === 0 && (
          ordersError
            ? <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{ordersError} The rest of Market Desk remains available.</div>
            : <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No customer order requests have been submitted.</div>
        )}
        <div className="mt-5 grid gap-4">
          {orders.map((order) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{order.reference} · {order.product_name}</p>
                  <p className="mt-1 text-sm text-slate-600">{order.variant_label} · Qty {order.quantity} · Status: {order.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold text-slate-900">Total: KSh {(order.total_minor / 100).toLocaleString('en-KE')}</p>
                  <p className={order.payment_status === 'paid' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                    {order.payment_status === 'paid' ? 'Offline payment recorded' : 'Unpaid'}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Requested {new Date(order.created_at).toLocaleString()} · Unit price KSh {(order.unit_price_minor / 100).toLocaleString('en-KE')}</p>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold text-slate-900">Customer · {order.buyer_name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3">
                    <a className="text-primary underline" href={`mailto:${order.buyer_email}`}>{order.buyer_email}</a>
                    {order.buyer_phone && <a className="text-primary underline" href={`tel:${order.buyer_phone}`}>{order.buyer_phone}</a>}
                  </div>
                  {order.buyer_note && <p className="mt-2 whitespace-pre-wrap text-slate-600">Note: {order.buyer_note}</p>}
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold text-slate-900">Boutique · {order.merchant.contact_name || order.merchant.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3">
                    {order.merchant.contact_email && <a className="text-primary underline" href={`mailto:${order.merchant.contact_email}`}>{order.merchant.contact_email}</a>}
                    {order.merchant.contact_phone && <a className="text-primary underline" href={`tel:${order.merchant.contact_phone}`}>{order.merchant.contact_phone}</a>}
                    {!order.merchant.contact_email && !order.merchant.contact_phone && <span className="text-slate-500">Contact details unavailable</span>}
                  </div>
                </div>
              </div>
              {order.events.length > 0 && (
                <details className="mt-4 rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-bold text-slate-800">Order history ({order.events.length})</summary>
                  <ol className="mt-3 grid gap-3 border-l border-slate-200 pl-4">
                    {order.events.map((event, index) => (
                      <li key={`${event.created_at}-${index}`} className="text-sm text-slate-600">
                        <strong className="text-slate-800">{event.actor === 'admin' ? `Online Bar${event.actor_email ? ` · ${event.actor_email}` : ''}` : event.actor === 'merchant' ? 'Boutique' : 'Customer'} · {event.action.replace(/_/g, ' ')}</strong>
                        {event.from_status !== event.to_status && <span> · {event.from_status || 'new'} → {event.to_status}</span>}
                        {event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}
                        <time className="mt-1 block text-xs">{new Date(event.created_at).toLocaleString()}</time>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {!['fulfilled', 'cancelled'].includes(order.status) && (
                <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Admin action note (required and audited)
                    <textarea
                      rows={2}
                      maxLength={1000}
                      minLength={5}
                      value={orderAdminNotes[order.id] || ''}
                      onChange={(event) => setOrderAdminNotes({ ...orderAdminNotes, [order.id]: event.target.value })}
                      placeholder="Record why Online Bar is changing this order or verifying offline payment."
                      className="rounded-lg border border-slate-200 bg-white p-3 font-normal"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {order.status === 'requested' && (
                      <Button disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'confirmed')} className="bg-emerald-700 hover:bg-emerald-800">Confirm request</Button>
                    )}
                    {order.status === 'confirmed' && (
                      <Button disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'preparing')} variant="outline">Start preparation</Button>
                    )}
                    {order.status === 'preparing' && (
                      <Button disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'ready')} variant="outline">Mark ready</Button>
                    )}
                    {order.status === 'ready' && (
                      <Button disabled={workingOrderId === order.id || order.payment_status !== 'paid'} onClick={() => void updateOrder(order, 'fulfilled')} variant="outline">Mark fulfilled</Button>
                    )}
                    {['confirmed', 'preparing', 'ready'].includes(order.status) && order.payment_status === 'unpaid' && (
                      <Button disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'paid')} variant="outline" className="border-emerald-300 text-emerald-800">
                        Record verified offline payment
                      </Button>
                    )}
                    {['requested', 'confirmed', 'preparing', 'ready'].includes(order.status) && (
                      <Button disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'cancelled')} variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50">
                        Cancel request
                      </Button>
                    )}
                  </div>
                  {order.status === 'ready' && order.payment_status !== 'paid' && <p className="text-xs text-amber-800">Record confirmed offline payment before fulfilment. This control does not process or verify payments automatically.</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Campaign studio</p>
          <h2 className="mt-2 text-2xl font-black">Market storefront message</h2>
          <p className="mt-2 text-sm text-slate-500">Publish or hide this message on the Market homepage without changing the Midnight Society waitlist campaign.</p>
        </div>
        <form onSubmit={saveCampaign} className="mt-5 grid max-w-3xl gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Campaign title
            <input required minLength={2} maxLength={120} value={campaign.title} onChange={(event) => setCampaign({ ...campaign, title: event.target.value })} className="rounded-lg border border-slate-200 p-3" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Homepage message
            <textarea required minLength={2} maxLength={500} rows={3} value={campaign.message} onChange={(event) => setCampaign({ ...campaign, message: event.target.value })} className="rounded-lg border border-slate-200 p-3" />
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={campaign.published} onChange={(event) => setCampaign({ ...campaign, published: event.target.checked })} />
            Publish this Market campaign
          </label>
          <div>
            <Button type="submit" disabled={loading || campaignWorking}>{campaignWorking ? 'Saving…' : campaign.published ? 'Save and publish' : 'Save as unpublished'}</Button>
          </div>
        </form>
      </section>

      <section className="mt-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Seller control</p>
          <h2 className="mt-2 text-2xl font-black">Boutiques</h2>
          <p className="mt-2 text-sm text-slate-500">Suspension immediately blocks seller uploads and removes the shop’s products from public browsing.</p>
        </div>
        {!loading && merchants.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No approved boutiques yet.</div>
        )}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {merchants.map((merchant) => (
            <article className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={merchant.id}>
              <div>
                <h3 className="font-bold text-slate-900">{merchant.name}</h3>
                <p className="text-sm text-slate-500">/market/store/{merchant.slug} · {merchant.status}</p>
                <p className="mt-2 text-sm text-slate-600">{merchant.contact_name || 'Contact name unavailable'}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
                  {merchant.contact_email && <a className="text-primary underline" href={`mailto:${merchant.contact_email}`}>{merchant.contact_email}</a>}
                  {merchant.contact_phone && <a className="text-primary underline" href={`tel:${merchant.contact_phone}`}>{merchant.contact_phone}</a>}
                  {!merchant.contact_email && !merchant.contact_phone && <span className="text-slate-500">Contact details unavailable</span>}
                </div>
              </div>
              <Button
                disabled={workingMerchantId === merchant.id}
                onClick={() => void setMerchantStatus(merchant, merchant.status === 'approved' ? 'suspended' : 'approved')}
                variant="outline"
                className={merchant.status === 'approved' ? 'gap-2 border-rose-200 text-rose-700 hover:bg-rose-50' : 'gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50'}
              >
                {merchant.status === 'approved' ? <><Ban size={15} /> Suspend</> : <><ShieldCheck size={15} /> Restore</>}
              </Button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
