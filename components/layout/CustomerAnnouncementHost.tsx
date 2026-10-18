'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface CustomerAnnouncement {
  id: string;
  title: string;
  message: string;
}

const DISMISSED_ANNOUNCEMENT_KEY = 'onlinebar_dismissed_announcement';

export default function CustomerAnnouncementHost() {
  const [announcement, setAnnouncement] = useState<CustomerAnnouncement | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let failures = 0;
    let didLogFailure = false;
    let lastAttemptAt = 0;
    let retryTimer: number | undefined;
    let requestController: AbortController | undefined;

    const loadAnnouncement = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      lastAttemptAt = Date.now();
      requestController = new AbortController();
      const timeout = window.setTimeout(() => requestController?.abort(), 10_000);

      try {
        const response = await fetch('/api/customer-announcements', {
          cache: 'no-store',
          signal: requestController.signal
        });
        if (!response.ok) throw new Error(`Announcement request failed (${response.status}).`);
        const result = await response.json() as {
          announcements?: CustomerAnnouncement[];
          degraded?: boolean;
        };
        if (!active) return;

        if (result.degraded) {
          setAnnouncement(null);
          failures = 0;
          didLogFailure = false;
          return;
        }

        const latest = result.announcements?.[0] || null;
        let dismissedId: string | null = null;
        try {
          dismissedId = sessionStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY);
        } catch (storageError) {
          console.warn('[CustomerAnnouncement] Session storage is unavailable; announcement dismissal will not persist.', storageError);
        }
        setAnnouncement(latest && latest.id !== dismissedId ? latest : null);
        failures = 0;
        didLogFailure = false;
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          failures += 1;
          if (!didLogFailure) {
            console.warn('[CustomerAnnouncement] Announcement service is temporarily unreachable; retrying with backoff.', error);
            didLogFailure = true;
          }
        }
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (active && failures > 0) {
          const delay = Math.min(5 * 60_000, 15_000 * (2 ** Math.min(failures - 1, 5)));
          retryTimer = window.setTimeout(loadAnnouncement, delay);
        }
      }
    };

    void loadAnnouncement();
    const interval = window.setInterval(() => {
      if (failures === 0) void loadAnnouncement();
    }, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAttemptAt >= 60_000) {
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        void loadAnnouncement();
      }
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      requestController?.abort();
      window.clearInterval(interval);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  if (!announcement) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="relative z-[120] border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">{announcement.title}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{announcement.message}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISSED_ANNOUNCEMENT_KEY, announcement.id);
            } catch (error) {
              console.warn('[CustomerAnnouncement] Could not persist the announcement dismissal.', error);
            }
            setAnnouncement(null);
          }}
          className="rounded-full p-2 text-amber-800 transition-colors hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
