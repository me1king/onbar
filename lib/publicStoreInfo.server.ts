import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { supabase } from '@/lib/supabaseClient';

export async function loadPublishedDispatchHours(): Promise<string | null> {
  const database = createServerSupabaseClient() || supabase;
  if (!database) {
    console.error('[PublicStoreInfo] Server-side settings are not configured.');
    return null;
  }

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'store_info')
    .eq('is_published', true)
    .abortSignal(AbortSignal.timeout(8_000))
    .maybeSingle();
  if (error) {
    console.error('[PublicStoreInfo] Could not load published store hours:', error.message);
    return null;
  }

  const value = data?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const hours = (value as Record<string, unknown>).hours;
  return typeof hours === 'string' && hours.trim() ? hours.trim() : null;
}

export function getServiceHoursSchema(hours: string | null) {
  if (!hours || !/\b24\s*\/\s*7\b/i.test(hours)) return {};

  return {
    hoursAvailable: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map(day => `https://schema.org/${day}`),
      opens: '00:00',
      closes: '23:59',
    },
  };
}
