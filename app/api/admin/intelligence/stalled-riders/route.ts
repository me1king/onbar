import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider operations access is required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });

  const staleBefore = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const { data, error } = await database
    .from('rider_status')
    .select('rider_name, updated_at')
    .eq('status', 'Delivering')
    .lt('updated_at', staleBefore);
  if (error) {
    console.error('[AdminIntelligence] Could not load stalled riders:', error);
    return NextResponse.json({ error: 'Rider health data could not be loaded.' }, { status: 500 });
  }

  return NextResponse.json({ riders: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
