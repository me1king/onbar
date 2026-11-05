import { createServerSupabaseClient } from '@/lib/serverSupabase';
import {
  DEFAULT_LOCATION_CATALOG,
  normalizeLocationCatalogConfig,
  type ConfiguredLocationArea,
} from '@/lib/locationCatalog';

export async function loadPublicLocationAreas(): Promise<ConfiguredLocationArea[] | null> {
  const database = createServerSupabaseClient();
  if (!database) return DEFAULT_LOCATION_CATALOG.areas;

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'location_catalog')
    .eq('is_published', true)
    .abortSignal(AbortSignal.timeout(8_000))
    .maybeSingle();

  if (error) {
    console.error('[LocationCatalog] Could not load public delivery locations:', error.message);
    return null;
  }
  if (!data) return DEFAULT_LOCATION_CATALOG.areas;

  const config = normalizeLocationCatalogConfig(data.value);
  if (!config) {
    console.error('[LocationCatalog] Published delivery locations have an invalid format.');
    return null;
  }

  return config.areas;
}
