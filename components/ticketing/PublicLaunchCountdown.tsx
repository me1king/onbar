'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

type LaunchStatus = { active: boolean; releaseAt: string | null };

function countdownLabel(milliseconds: number) {
  const secondsTotal = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(secondsTotal / 86400);
  const hours = Math.floor((secondsTotal % 86400) / 3600);
  const minutes = Math.floor((secondsTotal % 3600) / 60);
  const seconds = secondsTotal % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function PublicLaunchCountdown() {
  const [status, setStatus] = useState<LaunchStatus | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    async function loadStatus() {
      try {
        const response = await fetch('/api/public-launch-gate', { cache: 'no-store' });
        const result = await response.json() as LaunchStatus & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Launch countdown could not be loaded.');
        if (active) setStatus(result);
      } catch (error) {
        console.error('[PublicLaunchCountdown] Could not load launch status:', error);
      }
    }
    void loadStatus();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!status?.active || !status.releaseAt) return null;
  const remaining = Date.parse(status.releaseAt) - now;
  if (remaining <= 0) return null;

  return (
    <section role="status" className="ticket-theme-accent-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        <Clock3 size={18} className="shrink-0" />
        <div>
          <p className="ticket-theme-text text-sm font-black">More from Online Bar is opening soon</p>
          <p className="ticket-theme-copy mt-1 text-xs">Ticketing is open while the rest of the site prepares to launch.</p>
        </div>
      </div>
      <p className="ticket-theme-text font-mono text-sm font-black tabular-nums" aria-label="Time until the rest of the site opens">
        {countdownLabel(remaining)}
      </p>
    </section>
  );
}
