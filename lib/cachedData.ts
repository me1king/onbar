import { unstable_cache } from 'next/cache';
import { supabase } from './supabaseClient';
import { sanitizeSettingsRows } from './settingsSanitizer';

export const getCachedSettings = unstable_cache(
  async () => {
    if (!supabase) return { data: [] };
    const { data } = await supabase.from('settings').select('*');
    return { data: sanitizeSettingsRows(data || []) };
  },
  ['store-settings'],
  { revalidate: 300, tags: ['settings'] } // Cache for 5 mins
);

export const getCachedHomeData = unstable_cache(
  async () => {
    if (!supabase) return [ { data: [] }, { data: [] }, { data: [] } ];
    const [posts, products, settings] = await Promise.all([
      supabase.from('blog_posts').select('*').eq('is_published', true).limit(2),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('settings').select('*')
    ]);
    return [posts, products, { ...settings, data: sanitizeSettingsRows(settings.data || []) }];
  },
  ['home-data-v2'],
  { revalidate: 300, tags: ['products', 'settings'] }
);
