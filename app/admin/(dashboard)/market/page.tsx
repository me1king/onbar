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
  merchant: { name: string; slug: string };
  category: { name: string } | null;
  variants: Array<{ price_minor: number; currency: string; size: string | null; color: string | null }>;
  images: Array<{ url: string; alt: string }>;
}

interface Merchant {
  id: string;
  name: string;
  slug: string;
  status: 'approved' | 'suspended';
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
  merchant: { name: string; slug: string };
  variant: { size: string | null; color: string | null };
  messages: Array<{ actor: string; action: string; amount_minor: number | null; message: string | null; created_at: string }>;
}

export default function MarketOperationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [offerCounterAmounts, setOfferCounterAmounts] = useState<Record<string, string>>({});
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

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [applicationResponse, productResponse, merchantResponse, campaignResponse, offerResponse] = await Promise.all([
        fetch('/api/admin/market/applications', { cache: 'no-store' }),
        fetch('/api/admin/market/products', { cache: 'no-store' }),
        fetch('/api/admin/market/merchants', { cache: 'no-store' }),
        fetch('/api/admin/market/campaign', { cache: 'no-store' }),
        fetch('/api/admin/market/offers', { cache: 'no-store' })
      ]);
      const [applicationResult, productResult, merchantResult, campaignResult, offerResult] = await Promise.all([
        applicationResponse.json() as Promise<{ applications?: Application[]; error?: string }>,
        productResponse.json() as Promise<{ products?: ProductListing[]; error?: string }>,
        merchantResponse.json() as Promise<{ merchants?: Merchant[]; error?: string }>,
        campaignResponse.json() as Promise<{ campaign?: MarketCampaign; error?: string }>,
        offerResponse.json() as Promise<{ offers?: MarketOffer[]; error?: string }>
      ]);
      if (!applicationResponse.ok) throw new Error(applicationResult.error || 'Could not load seller applications.');
      if (!productResponse.ok) throw new Error(productResult.error || 'Could not load product listings.');
      if (!merchantResponse.ok) throw new Error(merchantResult.error || 'Could not load merchants.');
      if (!campaignResponse.ok || !campaignResult.campaign) throw new Error(campaignResult.error || 'Could not load Market campaign settings.');
      if (!offerResponse.ok) throw new Error(offerResult.error || 'Could not load marketplace offers.');
      setApplications(applicationResult.applications || []);
      setProducts(productResult.products || []);
      setMerchants(merchantResult.merchants || []);
      setOffers(offerResult.offers || []);
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

  async function reviewProduct(product: ProductListing, status: 'published' | 'rejected') {
    setWorkingProductId(product.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, status })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this listing.');
      setMessage(`${product.name} was ${status === 'published' ? 'published' : 'declined'}.`);
      await loadApplications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this listing.');
    } finally {
      setWorkingProductId(null);
    }
  }

  async function respondToOffer(offer: MarketOffer, action: 'accept' | 'counter' | 'decline') {
    const amountMinor = Math.round(Number(offerCounterAmounts[offer.id]) * 100);
    if (action === 'counter' && (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > offer.listed_price_minor)) {
      setError('Enter a counteroffer between KSh 1 and the listed price.');
      return;
    }
    setWorkingOfferId(offer.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id, action, amountMinor })
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
        <Link href="/admin/waitlist" className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
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
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Catalog moderation</p>
          <h2 className="mt-2 text-2xl font-black">Product listings</h2>
        </div>
        {!loading && products.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No products are waiting for review.</div>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={product.id}>
              {product.images[0] && <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-xl"><Image className="object-cover" src={product.images[0].url} alt={product.images[0].alt} fill unoptimized sizes="(max-width: 800px) 100vw, 50vw" /></div>}
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{product.merchant.name} · {product.category?.name || 'Uncategorized'}</p>
              <h3 className="mt-2 text-lg font-bold text-slate-900">{product.name}</h3>
              {product.description && <p className="mt-2 text-sm text-slate-600">{product.description}</p>}
              {product.variants[0] && <p className="mt-2 font-semibold text-slate-800">KSh {(product.variants[0].price_minor / 100).toLocaleString('en-KE')}</p>}
              <div className="mt-4 flex gap-2">
                <Button disabled={workingProductId === product.id} onClick={() => void reviewProduct(product, 'published')} className="gap-2 bg-emerald-700 hover:bg-emerald-800"><Check size={15} /> Publish</Button>
                <Button disabled={workingProductId === product.id} onClick={() => void reviewProduct(product, 'rejected')} variant="outline" className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"><X size={15} /> Decline</Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Price negotiation</p>
          <h2 className="mt-2 text-2xl font-black">Customer offers</h2>
          <p className="mt-2 text-sm text-slate-500">Review every buyer offer and seller response. Acceptances record a non-binding price agreement; checkout, orders and payments are not active.</p>
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
                <span>{offer.buyer_name} · {offer.buyer_email}{offer.buyer_phone ? ` · ${offer.buyer_phone}` : ''}</span>
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
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <Button disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'accept')} className="bg-emerald-700 hover:bg-emerald-800">Accept current price</Button>
                  <label className="grid gap-2 text-xs font-semibold text-slate-600">
                    Counteroffer (KSh)
                    <input type="number" min="1" max={offer.listed_price_minor / 100} step="1" value={offerCounterAmounts[offer.id] || ''} onChange={(event) => setOfferCounterAmounts({ ...offerCounterAmounts, [offer.id]: event.target.value })} className="rounded-lg border border-slate-200 p-2" />
                  </label>
                  <Button disabled={workingOfferId === offer.id || !offerCounterAmounts[offer.id]} onClick={() => void respondToOffer(offer, 'counter')} variant="outline">Send counteroffer</Button>
                  <Button disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'decline')} variant="outline" className="border-rose-200 text-rose-700">Decline</Button>
                </div>
              )}
              {offer.status === 'accepted' && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Agreed price: KSh {((offer.accepted_amount_minor || offer.latest_amount_minor) / 100).toLocaleString('en-KE')}. This is not an order or payment.</p>}
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
