import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const ALLOWED_PERIODS = new Set([7, 30, 90, 365]);

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue')) {
    return NextResponse.json({ error: 'Analytics access requires revenue permission.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side analytics database access is not configured.' }, { status: 503 });
  }

  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 30);
  const days = ALLOWED_PERIODS.has(requestedDays) ? requestedDays : 30;
  const until = new Date();
  const from = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const { data, error } = await database.rpc('get_storefront_analytics', {
    p_from: from.toISOString(),
    p_until: until.toISOString()
  });

  if (error) {
    const migrationMissing = error.code === '42883' || error.code === 'PGRST202';
    return NextResponse.json({
      error: migrationMissing
        ? 'Storefront analytics is not set up yet. Apply supabase/STOREFRONT_ANALYTICS_MIGRATION.sql.'
        : 'Could not load storefront analytics.',
      detail: migrationMissing ? undefined : error.message
    }, { status: migrationMissing ? 503 : 500 });
  }

  return NextResponse.json({
    periodDays: days,
    from: from.toISOString(),
    until: until.toISOString(),
    data
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
