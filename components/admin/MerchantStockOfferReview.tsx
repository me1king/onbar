'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Check, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type StockOffer = {
  id: string;
  offered_quantity: number;
  offered_merchant_price: number;
  status: 'pending_review' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  created_at: string;
  product: { id: number; name: string; customer_price: number; image_url: string };
  merchant: { id: string; name: string; slug: string };
  current: { stock: number; merchant_price: number; is_listed: boolean };
  photo_url: string;
};

function money(value: number) {
  return `KES ${Number(value).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

export default function MerchantStockOfferReview() {
  const [offers, setOffers] = useState<StockOffer[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/market/merchant-stock-offers?view=admin', { cache: 'no-store' });
      const result = await response.json() as { offers?: StockOffer[]; error?: string };
      if (!response.ok || !result.offers) throw new Error(result.error || 'Could not load merchant stock offers.');
      setOffers(result.offers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load merchant stock offers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(offer: StockOffer, action: 'approve' | 'reject') {
    const note = notes[offer.id]?.trim() || '';
    if (action === 'reject' && note.length < 5) {
      setError('Add at least five characters explaining why this stock offer is rejected.');
      return;
    }
    setWorkingId(offer.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/market/merchant-stock-offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id, action, note })
      });
      const result = await response.json() as { error?: string; review?: { stock_after?: number } };
      if (!response.ok) throw new Error(result.error || 'Could not review this stock offer.');
      setNotice(action === 'approve'
        ? `${offer.product.name} approved. Merchant stock is now ${Number(result.review?.stock_after ?? (offer.current.stock + offer.offered_quantity)).toLocaleString('en-KE')} units.`
        : `${offer.product.name} offer rejected.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not review this stock offer.');
    } finally {
      setWorkingId(null);
    }
  }

  const pendingOffers = offers.filter(offer => offer.status === 'pending_review');
  const recentlyReviewed = offers.filter(offer => offer.status !== 'pending_review');

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Inventory control</p>
          <h2 className="mt-2 text-2xl font-black">Merchant stock offers</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">Review the merchant’s actual-stock photo, offered payout price, and requested additional units. Approval adds units to existing stock and applies the new payout price.</p>
        </div>
        <Button type="button" onClick={() => void load()} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh offers
        </Button>
      </div>

      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
      {loading && <p className="mt-5 text-sm text-slate-500">Loading merchant offers…</p>}
      {!loading && pendingOffers.length === 0 && !error && (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No merchant stock offers are waiting for review.</p>
      )}

      <div className="mt-5 grid gap-4">
        {pendingOffers.map(offer => {
          const nextStock = offer.current.stock + offer.offered_quantity;
          const priceDifference = offer.offered_merchant_price - offer.current.merchant_price;
          return (
            <article key={offer.id} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[180px_minmax(0,1fr)] md:p-6">
              <a href={offer.photo_url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-xl bg-slate-100">
                <Image src={offer.photo_url} alt={`${offer.product.name} stock submitted by ${offer.merchant.name}`} fill unoptimized sizes="180px" className="object-cover" />
                <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-bold text-white">Merchant stock photo</span>
              </a>
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">{offer.merchant.name}</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{offer.product.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">Submitted {new Date(offer.created_at).toLocaleString('en-KE')}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Needs review</span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">Current merchant stock</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{offer.current.stock.toLocaleString('en-KE')}</p>
                    <p className="text-xs text-slate-500">units</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-[11px] font-semibold text-emerald-800">Proposed stock addition</p>
                    <p className="mt-1 text-lg font-black text-emerald-950">+{offer.offered_quantity.toLocaleString('en-KE')}</p>
                    <p className="text-xs text-emerald-800">After approval: {nextStock.toLocaleString('en-KE')}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">Merchant payout · current → offered</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{money(offer.current.merchant_price)} → {money(offer.offered_merchant_price)}</p>
                    <p className={`mt-1 text-xs font-semibold ${priceDifference > 0 ? 'text-rose-700' : priceDifference < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {priceDifference > 0 ? '+' : ''}{money(priceDifference)} per unit
                    </p>
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-3">
                    <p className="text-[11px] font-semibold text-indigo-800">Customer sell price</p>
                    <p className="mt-1 text-lg font-black text-indigo-950">{money(offer.product.customer_price)}</p>
                    <p className="text-xs text-indigo-800">Platform price remains unchanged</p>
                  </div>
                </div>

                <label className="mt-4 block text-xs font-semibold text-slate-600">
                  Admin note {`(required to reject)`}
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={notes[offer.id] || ''}
                    onChange={event => setNotes(current => ({ ...current, [offer.id]: event.target.value }))}
                    placeholder="Optional approval note, or explain what must change before rejecting."
                    className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal text-slate-900"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" disabled={workingId === offer.id} onClick={() => void review(offer, 'approve')} className="gap-2 bg-emerald-700 hover:bg-emerald-800">
                    <Check size={15} /> {workingId === offer.id ? 'Reviewing…' : `Approve +${offer.offered_quantity} units`}
                  </Button>
                  <Button type="button" variant="outline" disabled={workingId === offer.id || (notes[offer.id] || '').trim().length < 5} onClick={() => void review(offer, 'reject')} className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50">
                    <X size={15} /> Reject offer
                  </Button>
                </div>
                {!offer.current.is_listed && <p className="mt-3 text-xs text-amber-800">Approval will make this merchant’s product offer available for sale.</p>}
              </div>
            </article>
          );
        })}
      </div>

      {!loading && recentlyReviewed.length > 0 && (
        <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">Recently reviewed ({recentlyReviewed.length})</summary>
          <div className="mt-3 divide-y divide-slate-100">
            {recentlyReviewed.map(offer => (
              <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span><strong>{offer.merchant.name}</strong> · {offer.product.name} · +{offer.offered_quantity} units · {money(offer.offered_merchant_price)} each</span>
                <span className={offer.status === 'approved' ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>{offer.status} · {offer.reviewed_by_email || 'Admin'}</span>
                {offer.review_note && <p className="w-full text-xs text-slate-500">Note: {offer.review_note}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
