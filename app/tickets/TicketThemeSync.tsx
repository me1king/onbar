'use client';

import { useEffect } from 'react';
import { defaultTicketTheme, isTicketThemeId } from '@/lib/ticketing/theme';

export default function TicketThemeSync() {
  useEffect(() => {
    let active = true;

    async function loadPublishedTheme() {
      try {
        const response = await fetch('/api/ticketing/theme', { cache: 'no-store' });
        const result = await response.json() as { theme?: unknown; error?: string };
        if (!response.ok) throw new Error(result.error || `Ticketing theme request failed (${response.status}).`);
        if (active && isTicketThemeId(result.theme)) {
          document.documentElement.dataset.ticketTheme = result.theme;
        }
      } catch (error) {
        console.error('[TicketingTheme] Could not apply the published customer theme:', error);
        if (active) document.documentElement.dataset.ticketTheme = defaultTicketTheme;
      }
    }

    void loadPublishedTheme();
    return () => { active = false; };
  }, []);

  return null;
}
