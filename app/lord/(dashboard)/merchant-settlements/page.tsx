'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Store,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Policy = {
  id: string;
  version: number;
  merchant_share_bps: number;
  minimum_payout_kes: number;
  is_active: boolean;
};

type Destination = {
  id: string;
  method: 'mpesa';
  masked_account: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  is_current: boolean;
};

type Merchant = {
  id: string;
  merchant_code: string | null;
  business_name: string;
  email: string;
  policy: Policy | null;
  destination: Destination | null;
};

type Settlement = {
  id: string;
  application_id: string;
  amount_kes: number;
  status: 'requested' | 'approved' | 'processing' | 'paid' | 'rejected' | 'failed';
  provider_reference: string | null;
  mpesa_receipt: string | null;
  failure_message: string | null;
  created_at: string;
  businessName: string;
  merchantCode: string | null;
  destination: Destination | null;
};

type AdminData = {
  applications: Merchant[];
  settlements: Settlement[];
  provider: { configured: boolean; missing: string[] };
};

async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || `Settlement request failed (${response.status}).`);
  return result as T;
}

function money(value: number) {
  return `KSh ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

function settlementStatusClass(status: Settlement['status']) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-800';
  if (status === 'requested' || status === 'approved' || status === 'processing') return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-800';
}

export default function MerchantSettlementsPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [minimums, setMinimums] = useState<Record<string, string>>({});
  const [adjustmentAmounts, setAdjustmentAmounts] = useState<Record<string, string>>({});
  const [adjustmentReasons, setAdjustmentReasons] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await readJson<AdminData>(await fetch('/api/admin/merchant-settlements', {
        cache: 'no-store'
      }));
      setData(result);
      setShares(previous => Object.fromEntries(result.applications.map(merchant => [
        merchant.id,
        previous[merchant.id] ?? (merchant.policy ? (merchant.policy.merchant_share_bps / 100).toFixed(2) : '')
      ])));
      setMinimums(previous => Object.fromEntries(result.applications.map(merchant => [
        merchant.id,
        previous[merchant.id] ?? (merchant.policy ? String(merchant.policy.minimum_payout_kes) : '')
      ])));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Settlement data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sendAction = async (
    key: string,
    action: string,
    fields: Record<string, unknown>,
    successMessage: string
  ) => {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      await readJson(await fetch('/api/admin/merchant-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...fields })
      }));
      setMessage(successMessage);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The settlement action could not be completed.');
    } finally {
      setBusy('');
    }
  };

  const savePolicy = (event: FormEvent<HTMLFormElement>, merchant: Merchant, enabled: boolean) => {
    event.preventDefault();
    const shareBps = Math.round(Number(shares[merchant.id]) * 100);
    const minimumPayoutKes = Number(minimums[merchant.id]);
    void sendAction(`policy:${merchant.id}`, 'set_policy', {
      applicationId: merchant.id,
      merchantShareBps: shareBps,
      minimumPayoutKes,
      enabled
    }, enabled ? `Settlement terms saved for ${merchant.business_name}.` : `Settlement terms disabled for ${merchant.business_name}.`);
  };

  const reviewDestination = (destination: Destination, decision: 'verify' | 'reject') => {
    const note = decision === 'reject' ? window.prompt('Reason for rejecting this payout number (at least 5 characters):') : '';
    if (decision === 'reject' && (!note || note.trim().length < 5)) return;
    void sendAction(`destination:${destination.id}`, 'review_destination', {
      destinationId: destination.id,
      decision,
      note: note?.trim() || ''
    }, `Payout destination ${decision === 'verify' ? 'verified' : 'rejected'}.`);
  };

  const reviewSettlement = (settlement: Settlement, decision: 'approve' | 'reject') => {
    const note = decision === 'reject' ? window.prompt('Reason for rejecting this payout request (at least 5 characters):') : '';
    if (decision === 'reject' && (!note || note.trim().length < 5)) return;
    void sendAction(`settlement:${settlement.id}`, 'review_settlement', {
      settlementId: settlement.id,
      decision,
      note: note?.trim() || ''
    }, `Payout request ${decision === 'approve' ? 'approved' : 'rejected'}.`);
  };

  const createAdjustment = (event: FormEvent<HTMLFormElement>, merchant: Merchant) => {
    event.preventDefault();
    void sendAction(`adjustment:${merchant.id}`, 'adjustment', {
      applicationId: merchant.id,
      amountKes: Number(adjustmentAmounts[merchant.id]),
      reason: adjustmentReasons[merchant.id]?.trim() || '',
      idempotencyKey: crypto.randomUUID()
    }, `Adjustment recorded for ${merchant.business_name}.`);
  };

  const settlements = data?.settlements || [];

  return (
    <main className="min-w-0 space-y-7 bg-slate-50 p-4 text-left sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-primary">
            <ShieldCheck className="h-4 w-4" /> Finance-controlled workflow
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-950">Merchant Settlements</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Configure documented seller-share terms, reconcile verified deliveries, review payout destinations and authorize each transfer.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-amber-800">
            This ledger currently applies a merchant share to traced delivered item values. It does not separately calculate tax, platform-fee, or cash-refund deductions; returned quantities are reduced only when recorded in the stock ledger. Do not enable transfers until Finance has approved rules that this calculation supports and completed a sandbox reconciliation.
          </p>
        </div>
        <Button onClick={() => void refresh()} variant="outline" disabled={loading || Boolean(busy)} className="h-11 rounded-xl bg-white">
          <RefreshCcw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
        </Button>
      </header>

      <div role="status" aria-live="polite" className="space-y-3">
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">{error}</p>}
        {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</p>}
      </div>

      <section className={cn(
        'rounded-2xl border p-5',
        data?.provider.configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
      )}>
        <div className="flex items-start gap-3">
          {data?.provider.configured
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
          <div>
            <h2 className="font-black text-slate-950">Daraja B2C {data?.provider.configured ? 'configuration detected' : 'transfers are disabled'}</h2>
            {data?.provider.configured
              ? <p className="mt-1 text-sm leading-5 text-emerald-900">A payout remains subject to approval and Safaricom&apos;s verified result callback.</p>
              : <p className="mt-1 text-sm leading-5 text-amber-950">No transfer can be sent until the listed requirements are completed and the sandbox flow is verified.</p>}
            {!!data?.provider.missing.length && <ul className="mt-2 list-inside list-disc text-xs font-semibold text-amber-950">
              {data.provider.missing.map(item => <li key={item}>{item}</li>)}
            </ul>}
          </div>
        </div>
      </section>

      {loading && !data && <p role="status" className="rounded-xl bg-white p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading settlement records…</p>}
      {!loading && !data && !error && <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">No settlement data is available.</p>}

      {!!data?.applications.length && <section className="space-y-5">
        <div className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /><h2 className="text-xl font-black text-slate-950">Merchant terms and payable controls</h2></div>
        <div className="grid gap-5 xl:grid-cols-2">
          {data.applications.map(merchant => {
            const share = shares[merchant.id] ?? '';
            const minimum = minimums[merchant.id] ?? '';
            const shareBps = Math.round(Number(share) * 100);
            const validTerms = Number.isSafeInteger(shareBps) && shareBps >= 1 && shareBps <= 10000
              && Number.isSafeInteger(Number(minimum)) && Number(minimum) >= 1 && Number(minimum) <= 250000;
            const destination = merchant.destination;
            const policyBusy = busy === `policy:${merchant.id}`;
            return <Card key={merchant.id} className="space-y-5 rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 font-black text-slate-950"><Store className="h-4 w-4 text-primary" />{merchant.business_name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{merchant.merchant_code || merchant.id} · {merchant.email}</p>
                </div>
                <span className={cn('rounded-full px-3 py-1 text-[10px] font-black uppercase', merchant.policy?.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                  {merchant.policy?.is_active ? `Terms v${merchant.policy.version} active` : 'Terms not active'}
                </span>
              </div>

              <form onSubmit={event => savePolicy(event, merchant, true)} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <h4 className="text-xs font-black uppercase tracking-wide text-slate-700">Commercial terms · set explicitly</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Merchant share (%)
                    <Input required type="number" min="0.01" max="100" step="0.01" inputMode="decimal" value={share}
                      onChange={event => setShares(previous => ({ ...previous, [merchant.id]: event.target.value }))}
                      className="mt-1 bg-white" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">Minimum payout (KES)
                    <Input required type="number" min="1" max="250000" step="1" inputMode="numeric" value={minimum}
                      onChange={event => setMinimums(previous => ({ ...previous, [merchant.id]: event.target.value }))}
                      className="mt-1 bg-white" />
                  </label>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">The share is applied to verified, delivered, traced item values. Confirm the commercial agreement and deductions before saving.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!validTerms || Boolean(busy)} className="rounded-lg">
                    {policyBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save and enable terms
                  </Button>
                  {merchant.policy?.is_active && <Button type="button" variant="outline" disabled={!validTerms || Boolean(busy)}
                    onClick={() => void sendAction(`policy:${merchant.id}`, 'set_policy', {
                      applicationId: merchant.id,
                      merchantShareBps: shareBps,
                      minimumPayoutKes: Number(minimum),
                      enabled: false
                    }, `Settlement terms disabled for ${merchant.business_name}.`)} className="rounded-lg">Pause terms</Button>}
                  <Button type="button" variant="outline" disabled={!merchant.policy?.is_active || Boolean(busy)}
                    onClick={() => void sendAction(`generate:${merchant.id}`, 'generate_payables', { applicationId: merchant.id }, 'Verified delivered orders reconciled into the payable ledger.')}
                    className="rounded-lg">
                    <CircleDollarSign className="mr-2 h-4 w-4" />Reconcile deliveries
                  </Button>
                </div>
              </form>

              <div className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-700">Current M-Pesa destination</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{destination?.masked_account || 'Not submitted'}</p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-[10px] font-black uppercase',
                    destination?.verification_status === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                      destination?.verification_status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600')}>
                    {destination?.verification_status || 'No destination'}
                  </span>
                </div>
                {destination?.verification_status === 'pending' && <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" disabled={Boolean(busy)} onClick={() => reviewDestination(destination, 'verify')} className="rounded-lg">Verify out of band</Button>
                  <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => reviewDestination(destination, 'reject')} className="rounded-lg">Reject</Button>
                </div>}
                <p className="mt-2 text-[11px] leading-5 text-slate-500">Verify the account holder and number using your approved finance procedure before marking it verified.</p>
              </div>

              <form onSubmit={event => createAdjustment(event, merchant)} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_2fr_auto]">
                <label className="text-xs font-bold text-slate-600">Adjustment (KES)
                  <Input required type="number" step="0.01" min="-10000000" max="10000000" value={adjustmentAmounts[merchant.id] || ''}
                    onChange={event => setAdjustmentAmounts(previous => ({ ...previous, [merchant.id]: event.target.value }))}
                    className="mt-1" />
                </label>
                <label className="text-xs font-bold text-slate-600">Reason
                  <Input required minLength={5} maxLength={500} value={adjustmentReasons[merchant.id] || ''}
                    onChange={event => setAdjustmentReasons(previous => ({ ...previous, [merchant.id]: event.target.value }))}
                    className="mt-1" />
                </label>
                <Button type="submit" disabled={Boolean(busy)} variant="outline" className="self-end rounded-lg">Record adjustment</Button>
              </form>
            </Card>;
          })}
        </div>
      </section>}

      <section className="space-y-4">
        <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /><h2 className="text-xl font-black text-slate-950">Payout review queue</h2></div>
        {settlements.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No merchant payout requests have been submitted.</p>}
        {settlements.map(settlement => <article key={settlement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-black text-slate-950">{settlement.businessName} · {money(Number(settlement.amount_kes))}</h3>
              <p className="mt-1 text-xs text-slate-500">{settlement.merchantCode || settlement.application_id} · {settlement.destination?.masked_account || 'Destination unavailable'} · {new Date(settlement.created_at).toLocaleString()}</p>
              {settlement.mpesa_receipt && <p className="mt-1 text-xs font-bold text-emerald-800">M-Pesa receipt: {settlement.mpesa_receipt}</p>}
              {settlement.provider_reference && <p className="mt-1 text-xs text-slate-500">Provider reference: {settlement.provider_reference}</p>}
              {settlement.failure_message && <p className="mt-2 text-xs text-rose-700">Review note: {settlement.failure_message}</p>}
            </div>
            <span className={cn('rounded-full px-3 py-1 text-[10px] font-black uppercase', settlementStatusClass(settlement.status))}>{settlement.status}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {settlement.status === 'requested' && <>
              <Button type="button" disabled={Boolean(busy)} onClick={() => reviewSettlement(settlement, 'approve')} className="rounded-lg">Approve request</Button>
              <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => reviewSettlement(settlement, 'reject')} className="rounded-lg">Reject with reason</Button>
            </>}
            {settlement.status === 'approved' && <Button type="button" disabled={Boolean(busy) || !data?.provider.configured}
              onClick={() => void sendAction(`execute:${settlement.id}`, 'execute_payout', { settlementId: settlement.id }, 'Payout request submitted to Daraja. Awaiting verified provider callback.')}
              className="rounded-lg">
              {busy === `execute:${settlement.id}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit M-Pesa payout
            </Button>}
          </div>
        </article>)}
      </section>
    </main>
  );
}
