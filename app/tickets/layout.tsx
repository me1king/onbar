import type { ReactNode } from 'react';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { defaultTicketTheme, isTicketThemeId } from '@/lib/ticketing/theme';

export const dynamic = 'force-dynamic';

export default async function TicketingLayout({ children }: { children: ReactNode }) {
  const database = createServerSupabaseClient();
  let theme = defaultTicketTheme;

  if (database) {
    const { data, error } = await database
      .from('settings')
      .select('value')
      .eq('key', 'ticketing_theme')
      .eq('is_published', true)
      .maybeSingle();

    if (error) {
      console.error('[TicketingTheme] Could not load the published theme for customer ticket pages:', error);
    } else {
      const savedTheme = data?.value && typeof data.value === 'object' && 'theme' in data.value
        ? data.value.theme
        : null;
      if (isTicketThemeId(savedTheme)) theme = savedTheme;
    }
  }

  return (
    <div className="ticket-theme-scope" data-ticket-theme={theme}>
      {children}
    </div>
  );
}
