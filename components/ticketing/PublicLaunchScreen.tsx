'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock3, Ticket } from 'lucide-react';

type LaunchStatus = { active: boolean; releaseAt: string | null };

function getTimeLeft(milliseconds: number) {
  const secondsTotal = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(secondsTotal / 3600);
  const minutes = Math.floor((secondsTotal % 3600) / 60);
  const seconds = secondsTotal % 60;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return {
    hours: String(remainingHours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    days
  };
}

export default function PublicLaunchScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<LaunchStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const response = await fetch('/api/public-launch-gate', { cache: 'no-store' });
        const result = await response.json() as LaunchStatus & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Launch status could not be loaded.');
        if (active) {
          setStatus(result);
          setError('');
          if (!result.active) router.replace('/');
        }
      } catch (cause) {
        console.error('[PublicLaunchScreen] Could not load public launch status:', cause);
        if (active) setError(cause instanceof Error ? cause.message : 'Launch status could not be loaded.');
      }
    }
    void loadStatus();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = window.setInterval(() => void loadStatus(), 15_000);
    return () => {
      active = false;
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, [router]);

  const releaseAt = status?.releaseAt ? Date.parse(status.releaseAt) : null;
  const remaining = releaseAt === null ? null : Math.max(0, releaseAt - now);
  const timeLeft = remaining === null ? null : getTimeLeft(remaining);

  useEffect(() => {
    if (timeLeft && remaining === 0) router.replace('/');
  }, [remaining, router, timeLeft]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0a12] px-4 py-12 text-white sm:px-6">
      <div aria-hidden="true" className="pointer-events-none fixed -left-40 top-10 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none fixed -right-40 bottom-0 h-96 w-96 rounded-full bg-blue-500/10 blur-[120px]" />
      <section className="relative w-full max-w-3xl rounded-[2rem] border border-violet-300/20 bg-[#17121e]/95 p-7 text-center shadow-2xl shadow-black/40 sm:p-12">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-200">
          <Clock3 size={26} />
        </span>
        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.28em] text-violet-200">Apex Market · Launch countdown</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">We’re opening soon</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
          This part of Apex Market is not open yet. Come back when the countdown ends. Ticketing is still open in the meantime.
        </p>

        {timeLeft ? (
          <div role="timer" aria-live="off" aria-label="Time remaining until the rest of the site opens" className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              { label: timeLeft.days ? 'Days' : 'Hours', value: timeLeft.days ? String(timeLeft.days).padStart(2, '0') : String(Number(timeLeft.hours) + timeLeft.days * 24).padStart(2, '0') },
              { label: 'Minutes', value: timeLeft.minutes },
              { label: 'Seconds', value: timeLeft.seconds }
            ].map(unit => (
              <div key={unit.label} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-5 sm:py-7">
                <p className="font-mono text-4xl font-black tabular-nums text-white sm:text-6xl">{unit.value}</p>
                <p className="mt-2 text-[9px] font-black uppercase tracking-[0.2em] text-violet-200 sm:text-xs">{unit.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div role="status" className="mx-auto mt-8 max-w-lg rounded-2xl border border-white/10 bg-black/20 px-5 py-6">
            <p className="font-mono text-2xl font-black text-white">Opening soon</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {error || (status?.active
                ? 'The site is being held in ticketing-only mode until the owner releases it.'
                : 'Checking whether the site is ready to open…')}
            </p>
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-xs text-rose-300">We could not refresh the countdown: {error}</p>}

        <Link href="/tickets" className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-black text-white transition hover:bg-violet-500">
          <Ticket size={16} /> Continue to ticketing
        </Link>
      </section>
    </main>
  );
}
