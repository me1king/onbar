'use client';

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatPrice, getReferralLink } from '@/lib/utils';
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  DollarSign,
  Loader2,
  MousePointerClick,
  ShoppingBag,
  Wallet
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AffiliateData {
  application: {
    business_name: string;
    verification_status: string;
    preferred_payout_method: string;
    payout_details: string;
  };
  referralCode: string;
  stats: {
    clicks: number;
    conversions: number;
    sales: number;
    earned: number;
    available: number;
    pendingOrders: number;
    pendingSales: number;
    commissionRate: number;
  };
  payouts: {
    id: number | string;
    amount: number;
    status: string;
    payment_method: string;
    created_at: string;
    processed_at: string | null;
    mpesa_receipt: string | null;
  }[];
}

export default function AffiliateDashboard() {
  const router = useRouter();
  const [data, setData] = React.useState<AffiliateData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('M-Pesa');
  const [paymentDetails, setPaymentDetails] = React.useState('');
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDashboard = React.useCallback(async () => {
    if (!supabase) {
      setMessage({ type: 'error', text: 'Affiliate services are not configured.' });
      setLoading(false);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth?mode=signin&redirect=/affiliate/dashboard');
      return;
    }

    const response = await fetch('/api/affiliate', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
    const result = await response.json();
    if (response.status === 401) {
      router.push('/auth?mode=signin&redirect=/affiliate/dashboard');
      return;
    }
    if (!response.ok) throw new Error(result.error || 'Could not load your affiliate dashboard.');
    if (result.application?.verification_status !== 'Verified') {
      router.replace('/profile');
      return;
    }
    setData(result as AffiliateData);
    setPaymentMethod(result.application.preferred_payout_method || 'M-Pesa');
    setPaymentDetails(result.application.payout_details || '');
    setLoading(false);
  }, [router]);

  React.useEffect(() => {
    loadDashboard().catch(error => {
      console.error('[AffiliateDashboard] Could not load data:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load your affiliate dashboard.' });
      setLoading(false);
    });
  }, [loadDashboard]);

  const referralUrl = data ? getReferralLink(data.referralCode) : '';

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[AffiliateDashboard] Could not copy referral link:', error);
      setMessage({ type: 'error', text: 'Could not copy the link. Select and copy it manually.' });
    }
  };

  const requestPayout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth?mode=signin&redirect=/affiliate/dashboard');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/affiliate/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          payment_method: paymentMethod,
          payment_details: paymentDetails
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not submit payout request.');
      setMessage({ type: 'success', text: 'Payout request submitted. It will be reviewed by the Online Bar team.' });
      setAmount('');
      await loadDashboard();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not submit payout request.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center gap-3"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="text-sm font-bold text-slate-500">Loading affiliate dashboard…</span></div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to profile
        </Link>
        <header className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Approved affiliate</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">{data?.application.business_name}</h1>
          <p className="text-slate-600">Share your referral link, follow completed orders, and request a payout.</p>
          <Link href="/affiliate/agreement" className="mt-1 w-fit text-sm font-semibold text-primary underline underline-offset-2">
            View Affiliate &amp; Partner Agreement draft
          </Link>
        </header>

        {message && (
          <div className={`rounded-xl border p-4 text-sm font-medium ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            {message.text}
          </div>
        )}

        <Card className="space-y-4 rounded-2xl border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-bold">Your referral link</h2>
            <p className="text-sm text-slate-500">Commission rate: {data?.stats.commissionRate}% of attributed completed order value.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input readOnly value={referralUrl} aria-label="Affiliate referral link" className="h-12 font-mono text-sm" />
            <Button onClick={copyReferralLink} className="h-12 shrink-0">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Affiliate performance">
          {[
            { label: 'Link clicks', value: data?.stats.clicks.toLocaleString() ?? '0', icon: MousePointerClick },
            { label: 'Completed orders', value: data?.stats.conversions.toLocaleString() ?? '0', icon: ShoppingBag },
            { label: 'Commission earned', value: formatPrice(data?.stats.earned ?? 0), icon: DollarSign },
            { label: 'Available for payout', value: formatPrice(data?.stats.available ?? 0), icon: Wallet }
          ].map(item => (
            <Card key={item.label} className="rounded-2xl border-slate-200 bg-white p-5">
              <item.icon className="mb-4 h-5 w-5 text-primary" />
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-black text-foreground">{item.value}</p>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-2xl border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-bold">Order attribution</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Your dashboard counts commissions only on orders marked paid, dispatched, delivered, or completed. There are currently {data?.stats.pendingOrders ?? 0} referred orders still in progress; these are not included in available earnings yet.
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-700">In-progress order value: {formatPrice(data?.stats.pendingSales ?? 0)}</p>
          </Card>

          <Card className="rounded-2xl border-slate-200 bg-white p-6">
            <h2 className="mb-2 text-lg font-bold">Request a payout</h2>
            <p className="mb-5 text-sm text-slate-500">Minimum request: KSh 1,000. Requests are reviewed and paid manually; a request is not an automatic transfer.</p>
            <form onSubmit={requestPayout} className="space-y-4">
              <label className="block space-y-2 text-sm font-semibold">
                Payout method
                <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Bank">Bank transfer</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                {paymentMethod === 'M-Pesa' ? 'M-Pesa number' : 'Bank account details'}
                <Input required maxLength={200} value={paymentDetails} onChange={event => setPaymentDetails(event.target.value)} />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                Amount (KSh)
                <Input required min={1000} max={data?.stats.available ?? 0} step="1" type="number" value={amount} onChange={event => setAmount(event.target.value)} />
              </label>
              <Button type="submit" disabled={submitting || !data || Number(amount) < 1000 || Number(amount) > data.stats.available} className="w-full">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                Submit payout request
              </Button>
            </form>
          </Card>
        </section>

        <Card className="rounded-2xl border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-bold">Payout request history</h2>
          {!data?.payouts.length ? (
            <p className="text-sm text-slate-500">You have not requested a payout yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="pb-3">Requested</th><th className="pb-3">Method</th><th className="pb-3">Amount</th><th className="pb-3">Status</th><th className="pb-3">Receipt</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.payouts.map(payout => (
                    <tr key={payout.id}>
                      <td className="py-3">{new Date(payout.created_at).toLocaleDateString()}</td>
                      <td className="py-3">{payout.payment_method}</td>
                      <td className="py-3 font-semibold">{formatPrice(payout.amount)}</td>
                      <td className="py-3">{payout.status}</td>
                      <td className="py-3">{payout.mpesa_receipt || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
