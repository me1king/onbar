'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, Plus, RefreshCcw, Save, ShieldAlert, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAdmin } from '@/context/AdminContext';
import { logAuditAction } from '@/lib/auditService';
import type { SpinCampaign, SpinCampaignPrize, SpinCampaignWin, SpinPrizeType } from '@/lib/spinCampaign';

const sampleCampaign: SpinCampaign = {
  id: 'black-november-2026',
  title: 'Black November: Spin the Bottle',
  active: false,
  starts_at: '2026-11-01T00:00:00+03:00',
  ends_at: '2026-11-30T23:59:59+03:00',
  terms_url: '/terms',
  prizes: [
    { id: 'free-delivery', label: 'Free delivery', type: 'free_delivery', value: 0, weight: 35, minimum_order: 0, max_winners: null, enabled: true },
    { id: 'ksh-100', label: 'KSh 100 off', type: 'discount', value: 100, weight: 30, minimum_order: 0, max_winners: null, enabled: true },
    { id: 'ksh-200', label: 'KSh 200 off', type: 'discount', value: 200, weight: 15, minimum_order: 0, max_winners: null, enabled: true },
    { id: 'free-mixers', label: 'Free mixers', type: 'free_mixers', value: 0, weight: 10, minimum_order: 0, max_winners: null, enabled: true },
    { id: 'ksh-500', label: 'KSh 500 off', type: 'discount', value: 500, weight: 8, minimum_order: 5000, max_winners: null, enabled: true },
    { id: 'free-bottle', label: 'Free bottle', type: 'free_bottle', value: 0, weight: 2, minimum_order: 0, max_winners: null, enabled: true }
  ]
};

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export default function SpinCampaignManager() {
  const { email } = useAdmin();
  const [campaign, setCampaign] = React.useState<SpinCampaign>(sampleCampaign);
  const [wins, setWins] = React.useState<SpinCampaignWin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [winnerPhone, setWinnerPhone] = React.useState('');
  const [winnerPrizeId, setWinnerPrizeId] = React.useState('');

  const enabledWeightTotal = campaign.prizes.filter(prize => prize.enabled).reduce((sum, prize) => sum + Number(prize.weight || 0), 0);

  const loadCampaign = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/spin-campaign', { cache: 'no-store' });
      const result = await response.json() as { campaign?: Record<string, unknown> | null; wins?: SpinCampaignWin[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'Campaign could not be loaded.');
      if (result.campaign) {
        const saved = result.campaign;
        setCampaign({
          ...sampleCampaign,
          ...saved,
          active: saved.is_active === true,
          prizes: Array.isArray(saved.prizes) ? saved.prizes as SpinCampaignPrize[] : sampleCampaign.prizes
        } as SpinCampaign);
      }
      setWins(result.wins || []);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Campaign could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  const updatePrize = (index: number, patch: Partial<SpinCampaignPrize>) => {
    setCampaign(current => ({
      ...current,
      prizes: current.prizes.map((prize, prizeIndex) => prizeIndex === index ? { ...prize, ...patch } : prize)
    }));
  };

  const saveCampaign = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/spin-campaign', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Campaign could not be saved.');
      await logAuditAction(email, 'UPDATE_SPIN_CAMPAIGN', { active: campaign.active, prizeCount: campaign.prizes.length });
      setMessage({ type: 'success', text: 'Campaign settings saved.' });
      await loadCampaign();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Campaign could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const assignWinner = async (event: React.FormEvent) => {
    event.preventDefault();
    setAssigning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/spin-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign-winner', phone: winnerPhone, prizeId: winnerPrizeId })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Winner could not be assigned.');
      await logAuditAction(email, 'ASSIGN_SPIN_CAMPAIGN_WINNER', { phone: winnerPhone, prizeId: winnerPrizeId });
      setWinnerPhone('');
      setMessage({ type: 'success', text: 'Prize assigned and a single-use code created.' });
      await loadCampaign();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Winner could not be assigned.' });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-slate-500">Loading campaign controls…</p></div>;
  }

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 pb-32 text-left sm:p-8">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary"><Sparkles className="h-4 w-4" /> Campaign controls</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Spin the Bottle</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Control the campaign, set prize odds and limits, assign winners yourself, and track every issued code.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void loadCampaign()} variant="outline" className="h-10 rounded-lg"><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button type="button" onClick={() => void saveCampaign()} disabled={saving || enabledWeightTotal !== 100} className="h-10 rounded-lg"><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save campaign'}</Button>
        </div>
      </header>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {message.type === 'success' && <CheckCircle2 className="mr-2 inline h-4 w-4" />}{message.text}
        </div>
      )}

      <Card className="space-y-5 rounded-2xl border-slate-200 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-950">Campaign setup</h2><p className="mt-1 text-sm text-slate-500">The promotion is off until you turn it on and save.</p></div>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            <input type="checkbox" checked={campaign.active} onChange={event => setCampaign({ ...campaign, active: event.target.checked })} className="h-4 w-4 accent-orange-500" />
            {campaign.active ? 'Live' : 'Paused'}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">Campaign title
            <Input value={campaign.title} maxLength={100} onChange={event => setCampaign({ ...campaign, title: event.target.value })} className="h-11 rounded-lg text-sm" />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Starts
            <Input type="datetime-local" value={toLocalDateTime(campaign.starts_at)} onChange={event => setCampaign({ ...campaign, starts_at: fromLocalDateTime(event.target.value) })} className="h-11 rounded-lg text-sm" />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Ends / code expiry
            <Input type="datetime-local" value={toLocalDateTime(campaign.ends_at)} onChange={event => setCampaign({ ...campaign, ends_at: fromLocalDateTime(event.target.value) })} className="h-11 rounded-lg text-sm" />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">Terms page path
            <Input value={campaign.terms_url} maxLength={200} onChange={event => setCampaign({ ...campaign, terms_url: event.target.value })} placeholder="/terms" className="h-11 rounded-lg text-sm" />
          </label>
        </div>
      </Card>

      <Card className="space-y-5 rounded-2xl border-slate-200 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-lg font-bold text-slate-950">Prize pool and odds</h2><p className="mt-1 text-sm text-slate-500">Every enabled prize has a chance; enabled odds must add up to exactly 100%.</p></div>
          <p className={`text-sm font-bold ${enabledWeightTotal === 100 ? 'text-emerald-700' : 'text-rose-700'}`}>{enabledWeightTotal}% total</p>
        </div>
        <div className="space-y-3">
          {campaign.prizes.map((prize, index) => (
            <div key={prize.id} className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-[minmax(160px,1.3fr)_minmax(150px,1fr)_100px_110px_120px_100px_40px]">
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Prize label
                <Input value={prize.label} maxLength={80} onChange={event => updatePrize(index, { label: event.target.value })} className="h-10 rounded-lg text-sm normal-case" />
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Prize type
                <select value={prize.type} onChange={event => updatePrize(index, { type: event.target.value as SpinPrizeType })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm normal-case">
                  <option value="discount">KSh discount</option><option value="free_delivery">Free delivery</option><option value="free_mixers">Free mixers (fulfil manually)</option><option value="free_bottle">Free bottle (fulfil manually)</option>
                </select>
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{prize.type === 'discount' ? 'KSh off' : 'Value'}
                <Input type="number" min={0} value={prize.value} disabled={prize.type !== 'discount'} onChange={event => updatePrize(index, { value: Number(event.target.value) })} className="h-10 rounded-lg text-sm" />
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Odds %
                <Input type="number" min={0} max={100} step="0.1" value={prize.weight} onChange={event => updatePrize(index, { weight: Number(event.target.value) })} className="h-10 rounded-lg text-sm" />
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Min. subtotal
                <Input type="number" min={0} value={prize.minimum_order} onChange={event => updatePrize(index, { minimum_order: Number(event.target.value) })} className="h-10 rounded-lg text-sm" />
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Winner cap
                <Input type="number" min={1} placeholder="Unlimited" value={prize.max_winners ?? ''} onChange={event => updatePrize(index, { max_winners: event.target.value ? Number(event.target.value) : null })} className="h-10 rounded-lg text-sm" />
              </label>
              <div className="flex items-center justify-between gap-2 xl:justify-center">
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-600"><input type="checkbox" checked={prize.enabled} onChange={event => updatePrize(index, { enabled: event.target.checked })} className="accent-orange-500" />On</label>
                <button type="button" title={`Remove ${prize.label}`} onClick={() => setCampaign(current => ({ ...current, prizes: current.prizes.filter((_, prizeIndex) => prizeIndex !== index) }))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => {
          const id = `prize-${Date.now().toString(36)}`;
          setCampaign(current => ({ ...current, prizes: [...current.prizes, { id, label: 'New prize', type: 'discount', value: 0, weight: 0, minimum_order: 0, max_winners: null, enabled: false }] }));
        }} className="h-10 rounded-lg"><Plus className="mr-2 h-4 w-4" />Add prize</Button>
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>Keep at least one unlimited prize enabled so every spin can still win after capped prizes sell out. Bottle and mixer prizes require staff fulfilment. Phone numbers are not OTP-verified; codes are restricted to the same number entered at spin and checkout.</p></div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card className="space-y-4 rounded-2xl border-slate-200 p-5 shadow-sm sm:p-7">
          <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><UserPlus className="h-5 w-5 text-primary" />Assign a winner</h2><p className="mt-1 text-sm text-slate-500">Issue a specific prize to a phone or replace its unredeemed result.</p></div>
          <form onSubmit={event => void assignWinner(event)} className="space-y-3">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Winner phone number
              <Input type="tel" value={winnerPhone} onChange={event => setWinnerPhone(event.target.value)} placeholder="07XXXXXXXX" required className="h-11 rounded-lg text-sm" />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-600">Prize to assign
              <select value={winnerPrizeId} onChange={event => setWinnerPrizeId(event.target.value)} required className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                <option value="">Select prize</option>
                {campaign.prizes.filter(prize => prize.enabled).map(prize => <option key={prize.id} value={prize.id}>{prize.label}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={assigning || !winnerPrizeId} className="h-11 w-full rounded-lg">{assigning ? 'Assigning…' : 'Assign and generate code'}</Button>
          </form>
        </Card>

        <Card className="space-y-4 rounded-2xl border-slate-200 p-5 shadow-sm sm:p-7">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Recent winners</h2><p className="mt-1 text-sm text-slate-500">Latest 300 results. Codes are one-time and expire with the campaign.</p></div><span className="text-sm font-bold text-slate-500">{wins.length}</span></div>
          <div className="max-h-[28rem] space-y-2 overflow-auto">
            {wins.length ? wins.map(win => (
              <div key={win.id} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0"><p className="font-bold text-slate-900">{win.prize_label}</p><p className="mt-1 text-xs text-slate-500">{win.phone} · {new Date(win.created_at).toLocaleString()}</p></div>
                <div className="text-left sm:text-right"><p className="font-mono font-bold text-primary">{win.code}</p><p className={`mt-1 text-[10px] font-bold uppercase ${win.redeemed_at ? 'text-emerald-700' : 'text-slate-500'}`}>{win.redeemed_at ? `Redeemed · #${win.redeemed_order_id}` : win.assigned_by ? 'Admin assigned' : 'Not redeemed'}</p></div>
              </div>
            )) : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No prizes have been issued yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
