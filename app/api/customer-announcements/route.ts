import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('[CustomerAnnouncements] Announcement storage is not configured.');
    return NextResponse.json(
      { announcements: [], degraded: true },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('customer_announcements')
    .select('id, title, message, created_at')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[CustomerAnnouncements] Could not load announcements:', error);
    return NextResponse.json(
      { announcements: [], degraded: true },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  return NextResponse.json({ announcements: data || [] }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
