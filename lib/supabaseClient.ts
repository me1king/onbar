import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// 🔍 KEY INTEGRITY AUDIT: V30 Protocol
if (typeof window !== 'undefined') {
    if (supabaseKey.startsWith('sb_publishable_')) {
        console.error("🛑 CRITICAL: KEY MISMATCH DETECTED. Your NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a STRIPE key. Auth will fail.");
    }
    if (supabaseKey && !supabaseKey.startsWith('eyJ')) {
        console.warn("⚠️ WARNING: INVALID ANON KEY. Supabase keys must be JWTs (start with eyJ). Check your .env.local");
    }
    if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
        console.warn("⚠️ WARNING: INSECURE URL. Supabase endpoints should start with https://");
    }
}

const isConfigured =
  supabaseUrl.length > 0 &&
  supabaseUrl.startsWith('http') &&
  supabaseKey.length > 0;

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export default supabase;
