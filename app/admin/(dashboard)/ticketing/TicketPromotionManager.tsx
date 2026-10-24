'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgePercent, LoaderCircle, Plus, RefreshCw } from 'lucide-react';

type Promotion = {
  id: string;
  event_id: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  currency: string;
  max_redemptions: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  redemptions: number;
};

async function readResponse(response: Response) {
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || `Promotion request failed (${response.status}).`);
  return result;
}

function localDateInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function TicketPromotionManager({ eventId }: { eventId: string }) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await readResponse(await fetch(`/api/admin/ticketing/promotions?eventId=${encodeURIComponent(eventId)}`, {
        cache: 'no-store'
      })) as { promotions: Promotion[] };
      setPromotions(result.promotions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Promotions could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function createPromotion(formData: FormData) {
    setSaving(true);
    setError('');
    setNotice('');
    const discountType = formData.get('discountType') === 'percentage' ? 'percentage' : 'fixed';
    const enteredValue = Number(formData.get('discountValue'));
    try {
      await readResponse(await fetch('/api/admin/ticketing/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          eventId,
          code: formData.get('code'),
          discountType,
          discountValue: discountType === 'fixed' ? Math.round(enteredValue * 100) : enteredValue,
          maxRedemptions: formData.get('maxRedemptions') || null,
          startsAt: formData.get('startsAt') ? new Date(String(formData.get('startsAt'))).toISOString() : null,
          endsAt: formData.get('endsAt') ? new Date(String(formData.get('endsAt'))).toISOString() : null,
          active: formData.get('active') === 'on'
        })
      }));
      setNotice('Promo code created.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Promo code could not be created.');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(promotion: Promotion) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await readResponse(await fetch('/api/admin/ticketing/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_active',
          eventId,
          promotionId: promotion.id,
          active: !promotion.active
        })
      }));
      setNotice(`${promotion.code} ${promotion.active ? 'paused' : 'activated'}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Promo code status could not be changed.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'mt-1.5 min-h-10 w-full rounded-lg border border-white/10 bg-[#17121e] px-3 text-xs text-white outline-none focus:border-amber-300';
  const labelClass = 'block text-[10px] font-bold text-slate-300';

  return (
    <section aria-label={`Promo codes for ${eventId}`} className="mb-5 rounded-xl border border-amber-200/10 bg-amber-100/[0.025] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BadgePercent className="text-amber-200" size={16} />
          <h4 className="text-xs font-black text-white">Promo codes</h4>
          <span className="text-[10px] text-slate-400">event-specific · applied and verified at checkout</span>
        </div>
        <button type="button" aria-label="Refresh promo codes" onClick={() => void load()} disabled={loading || saving} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-300/20 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-950/20 p-3 text-xs text-emerald-200">{notice}</p>}

      {loading ? <p className="mt-3 text-xs text-slate-400">Loading event promo codes…</p> : (
        <div className="mt-3 space-y-2">
          {!promotions.length && <p className="text-xs text-slate-400">No promo codes for this event yet.</p>}
          {promotions.map(promotion => (
            <div key={promotion.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/10 px-3 py-2">
              <div>
                <p className="text-xs font-black text-white">{promotion.code}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-bold ${promotion.active ? 'bg-emerald-300/10 text-emerald-200' : 'bg-white/5 text-slate-400'}`}>
                    {promotion.active ? 'Active' : 'Paused'}
                  </span>
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {promotion.discount_type === 'percentage'
                    ? `${promotion.discount_value}% off tickets`
                    : `${new Intl.NumberFormat('en-KE', { style: 'currency', currency: promotion.currency }).format(Number(promotion.discount_value) / 100)} off`}
                  {' · '}{promotion.redemptions} used{promotion.max_redemptions === null ? '' : ` of ${promotion.max_redemptions}`}
                  {promotion.ends_at ? ` · ends ${new Date(promotion.ends_at).toLocaleDateString('en-KE')}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => void setActive(promotion)} disabled={saving} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50">
                {saving ? 'Saving…' : promotion.active ? 'Pause' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}

      <form action={createPromotion} className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>Code
          <input className={fieldClass} name="code" required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}" placeholder="EARLYBIRD" />
        </label>
        <label className={labelClass}>Discount
          <div className="flex gap-2">
            <select aria-label="Discount type" className={`${fieldClass} min-w-0`} name="discountType" defaultValue="percentage">
              <option value="percentage">Percent</option>
              <option value="fixed">KES amount</option>
            </select>
            <input className={`${fieldClass} min-w-0`} name="discountValue" required type="number" min="0.01" step="0.01" max="1000000" defaultValue="10" />
          </div>
        </label>
        <label className={labelClass}>Redemption limit (optional)
          <input className={fieldClass} name="maxRedemptions" type="number" min="1" max="1000000" placeholder="Unlimited" />
        </label>
        <label className={`${labelClass} flex items-center gap-2 self-end pb-2`}>
          <input name="active" type="checkbox" defaultChecked className="accent-amber-300" />
          Activate immediately
        </label>
        <label className={labelClass}>Starts (optional)
          <input className={fieldClass} name="startsAt" type="datetime-local" min={localDateInput(new Date())} />
        </label>
        <label className={labelClass}>Ends (optional)
          <input className={fieldClass} name="endsAt" type="datetime-local" />
        </label>
        <div className="self-end sm:col-span-2 lg:col-span-2">
          <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-300 px-4 text-xs font-black text-[#170d18] hover:bg-amber-200 disabled:opacity-50">
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
            Create promo code
          </button>
        </div>
      </form>
      <p className="mt-3 text-[9px] leading-4 text-slate-500">Discounts apply to ticket subtotal, not service fees. Redemption limits are reserved atomically during checkout and released after failed payment.</p>
    </section>
  );
}
