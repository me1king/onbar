'use client';

import { useEffect } from 'react';
import { isTicketThemeId } from '@/lib/ticketing/theme';

export default function TicketThemeSync() {
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let didLogFailure = false;

    async function loadPublishedTheme() {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch('/api/ticketing/theme', { cache: 'no-store' });
        const result = await response.json() as { theme?: unknown; error?: string };
        if (!response.ok) throw new Error(result.error || `Ticketing theme request failed (${response.status}).`);
        if (active && isTicketThemeId(result.theme)) {
          document.documentElement.dataset.ticketTheme = result.theme;
          document.querySelector<HTMLElement>('.ticket-theme-scope')?.setAttribute('data-ticket-theme', result.theme);
        }
      } catch (error) {
        if (active && !didLogFailure) {
          console.warn('[TicketingTheme] Could not refresh the published ticketing theme; keeping the last applied theme.', error);
          didLogFailure = true;
        }
      } finally {
        inFlight = false;
      }
    }

    void loadPublishedTheme();
    const interval = window.setInterval(loadPublishedTheme, 60_000);
    window.addEventListener('focus', loadPublishedTheme);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadPublishedTheme);
    };
  }, []);

  return null;
}
