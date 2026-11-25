'use client';

import * as React from 'react';
import { CalendarClock, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Offer = {
  enabled: boolean;
  launchAt: string;
};

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function toEatInput(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp + EAT_OFFSET_MS).toISOString().slice(0, 16)
    : '';
}

function fromEatInput(value: string) {
  const timestamp = Date.parse(`${value}:00+03:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

export default function CheckoutLaunchOfferControl() {
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [savedOffer, setSavedOffer] = React.useState<Offer | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/checkout-launch-offer', { cache: 'no-store' });
      const result = await response.json() as { offer?: Offer; error?: string };
      if (!response.ok || !result.offer) throw new Error(result.error || 'Launch offer settings could not be loaded.');
      setOffer(result.offer);
      setSavedOffer(result.offer);
      setNotice(null);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Launch offer settings could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!offer) return;
    if (!Number.isFinite(Date.parse(offer.launchAt))) {
      setNotice({ type: 'error', text: 'Enter a valid Nairobi launch date and time.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/checkout-launch-offer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: offer.enabled, launchAt: offer.launchAt })
      });
      const result = await response.json() as { offer?: Offer; error?: string };
      if (!response.ok || !result.offer) throw new Error(result.error || 'Launch offer settings could not be saved.');
      setOffer(result.offer);
      setSavedOffer(result.offer);
      setNotice({ type: 'success', text: result.offer.enabled ? 'Launch announcement is on.' : 'Launch announcement is off.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Launch offer settings could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const changed = Boolean(offer && savedOffer
    && (offer.enabled !== savedOffer.enabled || toEatInput(offer.launchAt) !== toEatInput(savedOffer.launchAt)));

  return (
    <Card className="space-y-4 rounded-2xl border-amber-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-800"><CalendarClock size={15} /> Checkout launch announcement</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Post-order launch offer</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Show a launch-time message and optional email/area signup on the normal order confirmation page. The form only collects town and area—never GPS.</p>
        </div>
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
          <Button type="button" onClick={() => void save()} disabled={!changed || saving || !offer} className="h-10 shrink-0 rounded-xl">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving…' : 'Save offer'}
          </Button>
        )}
      </div>

      {offer && !loading && (
        <div className="grid gap-4 sm:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)]">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">
            <input type="checkbox" checked={offer.enabled} onChange={event => setOffer(current => current ? { ...current, enabled: event.target.checked } : current)} className="h-5 w-5 accent-amber-600" />
            {offer.enabled ? 'Announcement is on' : 'Announcement is off'}
          </label>
          <label className="text-xs font-bold text-slate-600">Official launch date and time · Nairobi (EAT)
            <input
              type="datetime-local"
              value={toEatInput(offer.launchAt)}
              onChange={event => setOffer(current => current ? { ...current, launchAt: fromEatInput(event.target.value) } : current)}
              className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            />
          </label>
        </div>
      )}

      {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${notice.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{notice.text}</p>}
      <p className="text-xs leading-5 text-slate-500">The offer automatically stops appearing once its launch time has passed. Signup consent is required; admins can manage new signups in the waitlist panel.</p>
    </Card>
  );
}
