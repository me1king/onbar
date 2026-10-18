'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CircleCheck } from 'lucide-react';

function formatLaunchTime(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi'
  }).format(new Date(value));
}

export default function WaitlistLaunchCountdownPreview({ launchAt }: { launchAt: string | null }) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!launchAt) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        Set a launch date and save the site settings to start the member-pass countdown.
      </div>
    );
  }

  if (now === 0) {
    return <p role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">Calculating the launch countdown…</p>;
  }

  const target = new Date(launchAt).getTime();
  if (!Number.isFinite(target)) {
    return <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">The saved launch date is invalid. Choose a new launch date and publish it.</p>;
  }

  const difference = target - now;
  if (difference <= 0 && now > 0) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Launch time passed {formatLaunchTime(launchAt)} EAT. The member dashboard should now say “We are live.” Choose a future time if you want the countdown to restart.
      </div>
    );
  }

  const seconds = Math.max(0, Math.floor(difference / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      <p className="font-bold">Countdown preview · {formatLaunchTime(launchAt)} EAT</p>
      <p className="mt-1 font-mono font-semibold">
        {days}d {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(remainingSeconds).padStart(2, '0')}s remaining
      </p>
      <p className="mt-1 text-[10px]">Save the site settings to publish this launch target to the member dashboard.</p>
    </div>
  );
}
