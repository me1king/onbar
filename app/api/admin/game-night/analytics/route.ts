import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

const allowedRanges = new Set([7, 30, 90]);

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return NextResponse.json({ error: 'Game Night analytics requires marketing permission.' }, { status: 403 });
  }

  const range = Number(new URL(request.url).searchParams.get('days') || 30);
  if (!allowedRanges.has(range)) {
    return NextResponse.json({ error: 'Choose a 7, 30, or 90 day reporting range.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side analytics database access is not configured.' }, { status: 503 });
  }

  const to = new Date();
  const from = new Date(to.getTime() - range * 24 * 60 * 60 * 1000);
  const { data, error } = await database.rpc('get_game_night_analytics', {
    from_input: from.toISOString(),
    to_input: to.toISOString()
  });

  if (error) {
    const migrationMissing = ['42883', '42P01', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '');
    if (migrationMissing) {
      return NextResponse.json({
        error: 'Game Night analytics is not installed yet. Apply supabase/GAME_NIGHT_ANALYTICS_MIGRATION.sql after the analytics base schema.'
      }, { status: 503 });
    }
    console.error('[GameNightAnalytics] Could not load reporting metrics:', error);
    return NextResponse.json({ error: 'Game Night analytics could not be loaded. Try again shortly.' }, { status: 503 });
  }

  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'The analytics database returned an invalid response.' }, { status: 502 });
  }

  return NextResponse.json({
    data,
    range: { days: range, from: from.toISOString(), to: to.toISOString() }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
