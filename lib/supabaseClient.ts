import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// 🔍 KEY INTEGRITY AUDIT: V30 Protocol
if (typeof window !== 'undefined') {
    if (supabaseKey.startsWith('sb_publishable_')) {
        console.error("🛑 CRITICAL: KEY MISMATCH DETECTED. \n\n" +
            "Your NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a STRIPE key. \n" +
            "1. Go to Supabase Dashboard > Settings > API. \n" +
            "2. Copy the 'anon' 'public' key (Starts with eyJ). \n" +
            "3. Paste it into your .env.local file. \n" +
            "4. RESTART YOUR TERMINAL (ctrl+c then npm run dev).");
    }
    if (supabaseKey.includes('service_role') || (supabaseKey.length > 50 && !supabaseKey.startsWith('eyJ'))) {
         console.error("🛑 CRITICAL: SECURITY RISK OR FORMAT ERROR. \n\n" +
             "You are using a SERVICE_ROLE key or an invalid key in the public frontend. \n" +
             "Replace it with the ANON PUBLIC key from your Supabase API settings.");
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
