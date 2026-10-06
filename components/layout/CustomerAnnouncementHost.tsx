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
    let didLogFailure = false;

    const loadAnnouncement = async () => {
      try {
        const response = await fetch('/api/customer-announcements', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Announcement request failed (${response.status}).`);
        const result = await response.json() as {
          announcements?: CustomerAnnouncement[];
          degraded?: boolean;
        };
        if (!active) return;

        if (result.degraded) {
          setAnnouncement(null);
          return;
        }

        const latest = result.announcements?.[0] || null;
        const dismissedId = sessionStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY);
        setAnnouncement(latest && latest.id !== dismissedId ? latest : null);
      } catch (error) {
        if (!didLogFailure) {
          console.error('[CustomerAnnouncement] Could not load live announcements:', error);
          didLogFailure = true;
        }
      }
    };

    void loadAnnouncement();
    const interval = window.setInterval(loadAnnouncement, 30_000);
    window.addEventListener('focus', loadAnnouncement);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadAnnouncement);
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
            sessionStorage.setItem(DISMISSED_ANNOUNCEMENT_KEY, announcement.id);
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
