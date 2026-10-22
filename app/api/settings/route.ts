import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sanitizeSettingsRows } from '@/lib/settingsSanitizer';

export const dynamic = 'force-dynamic';

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = (
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )?.trim();
    if (!url || !key) {
        return NextResponse.json({ error: 'Store settings are not configured.' }, { status: 503 });
    }

    const database = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await database.from('settings')
        .select('key, value, is_published')
        .eq('is_published', true);
    if (error) {
        console.error('[PublicSettings] Could not load published settings:', error);
        return NextResponse.json({ error: 'Store settings could not be loaded.' }, { status: 503 });
    }

    return NextResponse.json({ settings: sanitizeSettingsRows(data || []) }, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
    });
}
