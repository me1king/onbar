import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerKey } from '@/lib/supabaseServerConfig';

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = getSupabaseServerKey();
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
