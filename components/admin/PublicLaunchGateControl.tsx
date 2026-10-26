'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, LoaderCircle, LockKeyhole, UnlockKeyhole } from 'lucide-react';

type Gate = { active: boolean; releaseAt: string | null };

function toLocalInput(value: string) {
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export default function PublicLaunchGateControl() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [releaseTime, setReleaseTime] = useState(() => toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    async function loadGate() {
      try {
        const response = await fetch('/api/admin/public-launch-gate', { cache: 'no-store' });
        const result = await response.json() as { gate?: Gate; error?: string };
        if (!response.ok || !result.gate) throw new Error(result.error || 'Public launch controls could not be loaded.');
        if (!active) return;
        setGate(result.gate);
        if (result.gate.releaseAt) setReleaseTime(toLocalInput(result.gate.releaseAt));
      } catch (cause) {
        console.error('[PublicLaunchGateControl] Could not load launch controls:', cause);
        if (active) setError(cause instanceof Error ? cause.message : 'Public launch controls could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadGate();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(clock);
    };
  }, []);

  const isLocked = Boolean(gate?.active && (!gate.releaseAt || Date.parse(gate.releaseAt) > now));

  async function save(nextGate: Gate, message: string) {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/public-launch-gate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextGate)
      });
      const result = await response.json() as { gate?: Gate; error?: string };
      if (!response.ok || !result.gate) throw new Error(result.error || 'Public launch setting could not be saved.');
      setGate(result.gate);
      setNotice(message);
    } catch (cause) {
      console.error('[PublicLaunchGateControl] Could not save launch controls:', cause);
      setError(cause instanceof Error ? cause.message : 'Public launch setting could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function scheduleRelease() {
    const releaseAt = new Date(releaseTime);
    if (Number.isNaN(releaseAt.getTime()) || releaseAt.getTime() <= Date.now()) {
      setError('Choose a future date and time for the public launch.');
      return;
    }
    void save({ active: true, releaseAt: releaseAt.toISOString() }, 'Countdown scheduled. Ticketing stays open, and the rest of the public site opens automatically at the selected time.');
  }

  return (
    <section aria-labelledby="public-launch-gate-title" className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
            <LockKeyhole size={14} /> Public site access
          </p>
          <h2 id="public-launch-gate-title" className="mt-2 text-xl font-black text-slate-950">Ticketing-only launch gate</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            When enabled, visitors can use ticketing while other public pages and storefront APIs stay closed. Admin and ticketing payment/email flows remain available.
          </p>
          <p role={error ? 'alert' : 'status'} className={`mt-3 text-xs font-semibold ${error ? 'text-rose-700' : 'text-emerald-700'}`}>
            {error || notice || (loading ? 'Loading launch status…' : isLocked
              ? gate?.releaseAt
                ? `Ticketing-only mode is on. The site is scheduled to open ${new Date(gate.releaseAt).toLocaleString()}.`
                : 'Ticketing-only mode is on until you release the public site.'
              : 'The full public site is open.')}
          </p>
        </div>
        <div className="w-full max-w-xl space-y-3">
          <label htmlFor="public-launch-release-time" className="block text-xs font-bold text-slate-700">
            Schedule the rest of the site to open
            <input
              id="public-launch-release-time"
              type="datetime-local"
              value={releaseTime}
              onChange={event => setReleaseTime(event.target.value)}
              disabled={loading || saving}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 disabled:opacity-50"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={scheduleRelease}
              disabled={loading || saving}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-black text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Clock3 size={15} />}
              Start countdown
            </button>
            <button
              type="button"
              onClick={() => void save({ active: true, releaseAt: null }, 'Ticketing-only mode is on until you release the public site.')}
              disabled={loading || saving}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-xs font-black text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            >
              <LockKeyhole size={15} /> Keep ticketing only
            </button>
            <button
              type="button"
              onClick={() => void save({ active: false, releaseAt: null }, 'The full public site is now open.')}
              disabled={loading || saving}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : isLocked ? <UnlockKeyhole size={15} /> : <CheckCircle2 size={15} />}
              Release site now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
