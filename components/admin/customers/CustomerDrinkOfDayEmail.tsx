'use client';

import * as React from 'react';
import { Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type DrinkProduct = {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number | null;
};

type OptionsResponse = {
  customer: {
    name: string;
    email: string;
    eligible: boolean;
    reasons: string[];
    ageCheckRecorded: boolean;
  };
  emailConfigured: boolean;
  products: DrinkProduct[];
  suggestedProductId: string | null;
  error?: string;
};

export default function CustomerDrinkOfDayEmail({ phone }: { phone: string }) {
  const [data, setData] = React.useState<OptionsResponse | null>(null);
  const [productId, setProductId] = React.useState('');
  const [customMessage, setCustomMessage] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  React.useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/customers/${encodeURIComponent(phone)}/drink-of-day`, {
      cache: 'no-store',
      signal: controller.signal
    }).then(async response => {
      const result = await response.json() as OptionsResponse;
      if (!response.ok) throw new Error(result.error || 'Email campaign options could not be loaded.');
      setData(result);
      setProductId(result.suggestedProductId || result.products[0]?.id || '');
    }).catch(loadError => {
      if (loadError instanceof Error && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : 'Email campaign options could not be loaded.');
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [phone]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productId) {
      setError('Choose a drink before sending.');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}/drink-of-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, customMessage }),
        cache: 'no-store'
      });
      const result = await response.json() as { sent?: boolean; campaignId?: string; error?: string };
      if (!response.ok) {
        if (result.sent) {
          setSent(true);
          setNotice(result.error || 'The email was sent, but tracking needs attention.');
          return;
        }
        throw new Error(result.error || 'The personalized email could not be sent.');
      }
      setSent(true);
      setNotice('Drink of the Day email sent. Its campaign and delivery are recorded in the Email Center.');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The personalized email could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-50 p-3 text-sky-700"><Mail className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Send this customer their Drink of the Day</h2>
          <p className="mt-1 text-sm text-slate-600">The email uses their name, the selected drink, a personal reveal link, and an unsubscribe link.</p>
        </div>
      </header>

      {loading && <p className="text-sm text-slate-500">Checking consent, email, and age eligibility…</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {!loading && data && (
        <>
          <div className={`rounded-xl border p-4 text-sm ${data.customer.eligible && data.emailConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
            <p className="font-bold">{data.customer.name} · {data.customer.email || 'No email on profile'}</p>
            {data.customer.eligible
              ? <p className="mt-1">Marketing and personalization consent, active email opt-in, age 18+ date of birth, and a delivery ID check are recorded.</p>
              : <ul className="mt-1 list-inside list-disc">{data.customer.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
            {!data.emailConfigured && <p className="mt-1">Email provider is not configured.</p>}
          </div>

          {data.customer.eligible && data.emailConfigured && data.products.length > 0 && (
            <form onSubmit={send} className="space-y-4">
              <label className="block text-sm font-semibold text-slate-800">
                Drink
                <select
                  required
                  disabled={sending || sent}
                  value={productId}
                  onChange={event => setProductId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {data.products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.category}{product.price === null ? '' : ` · KSh ${Math.round(product.price).toLocaleString('en-KE')}`}
                    </option>
                  ))}
                </select>
                {productId === data.suggestedProductId && <span className="mt-1 block text-xs font-normal text-slate-500">Suggested from the customer’s saved category preference.</span>}
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Personal note (optional)
                <Textarea
                  value={customMessage}
                  maxLength={500}
                  disabled={sending || sent}
                  onChange={event => setCustomMessage(event.target.value)}
                  placeholder={`Add a short note for ${data.customer.name.split(/\s+/)[0] || 'the customer'}…`}
                  className="mt-2 min-h-24"
                />
              </label>
              <Button type="submit" disabled={sending || sent || !productId}>
                <Send className="mr-2 h-4 w-4" />
                {sent ? 'Email sent' : sending ? 'Sending…' : 'Send personalized email'}
              </Button>
            </form>
          )}

          {data.customer.eligible && data.products.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No currently visible drinks are available to choose.</p>
          )}

          <p className="text-[11px] leading-5 text-slate-500">
            Age-restricted products still require the appropriate age controls at the point of sale. The 30-day reveal link is private and expires.
          </p>
        </>
      )}
    </section>
  );
}
