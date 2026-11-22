'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { MessageSquare, Star } from 'lucide-react';

type MerchantReview = {
  id: number;
  product_id: number;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
  merchantResponse: string;
};

export default function MerchantReviewInbox({
  applicationId,
  accessToken
}: {
  applicationId: string;
  accessToken: string;
}) {
  const [reviews, setReviews] = useState<MerchantReview[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/merchant/reviews?applicationId=${encodeURIComponent(applicationId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const result = await response.json() as { reviews?: MerchantReview[]; error?: string };
      if (!response.ok || !result.reviews) throw new Error(result.error || 'Customer reviews could not be loaded.');
      setReviews(result.reviews);
      setDrafts(Object.fromEntries(result.reviews.map(review => [review.id, review.merchantResponse])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Customer reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, applicationId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function saveReply(event: FormEvent<HTMLFormElement>, review: MerchantReview) {
    event.preventDefault();
    const responseText = (drafts[review.id] || '').trim();
    if (!responseText) {
      setError('Write a reply before saving.');
      return;
    }
    setWorkingId(review.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/merchant/reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, reviewId: review.id, response: responseText })
      });
      const result = await response.json() as { response?: { response: string }; error?: string };
      if (!response.ok || !result.response) throw new Error(result.error || 'Your reply could not be saved.');
      setReviews(current => current.map(item => item.id === review.id
        ? { ...item, merchantResponse: result.response!.response }
        : item));
      setMessage(`Reply saved for the review of product #${review.product_id}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your reply could not be saved.');
    } finally {
      setWorkingId(null);
    }
  }

  return <section aria-labelledby="merchant-review-inbox" className="space-y-4 rounded-2xl border border-white/10 bg-[#1a1b1e] p-5">
    <div>
      <h3 id="merchant-review-inbox" className="font-black text-white">Verified customer reviews</h3>
      <p className="mt-1 text-xs text-zinc-400">Reviews are shown only when the verified purchase includes stock traced to your business. Replies are public.</p>
    </div>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    {loading && <p role="status" className="text-sm text-zinc-400">Loading reviews…</p>}
    {!loading && !reviews.length && <p className="text-sm text-zinc-400">No verified reviews are linked to your orders yet.</p>}
    <div className="space-y-3">
      {reviews.map(review => <article key={review.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold text-white">{review.customer_name || 'Customer'} · Product #{review.product_id}</p>
            <p className="mt-1 text-xs text-zinc-400">{new Date(review.created_at).toLocaleDateString('en-KE')}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-300"><Star size={14} fill="currentColor" aria-hidden="true" />{review.rating}/5</span>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{review.comment}</p>
        <form onSubmit={event => void saveReply(event, review)} className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <label htmlFor={`merchant-review-reply-${review.id}`} className="flex items-center gap-2 text-xs font-bold text-zinc-300"><MessageSquare size={14} aria-hidden="true" />Public merchant reply</label>
          <textarea
            id={`merchant-review-reply-${review.id}`}
            maxLength={1000}
            rows={3}
            value={drafts[review.id] || ''}
            onChange={event => setDrafts(current => ({ ...current, [review.id]: event.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-[#111214] p-3 text-sm text-white"
          />
          <div className="flex justify-end">
            <button type="submit" disabled={workingId === review.id || !(drafts[review.id] || '').trim()} className="min-h-10 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-zinc-950 disabled:opacity-50">
              {workingId === review.id ? 'Saving…' : review.merchantResponse ? 'Update reply' : 'Post reply'}
            </button>
          </div>
        </form>
      </article>)}
    </div>
  </section>;
}
