import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!['owner', 'admin', 'super_admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Ticketing demand insights are restricted to platform admins.' }, { status: 403 });
  }

  const days = Number(request.nextUrl.searchParams.get('days') || 30);
  if (![7, 30, 90].includes(days)) {
    return NextResponse.json({ error: 'Choose a 7, 30 or 90 day report window.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Ticketing storage is not configured.' }, { status: 503 });

  const { data, error } = await database.rpc('ticketing_get_demand_insights', { p_days: days });
  if (error || !data) {
    if (error?.code === '42P01' || error?.code === '42883' || error?.code === 'PGRST202') {
      return NextResponse.json({
        error: 'Apply supabase/TICKETING_DEMAND_INTELLIGENCE_MIGRATION.sql after the core ticketing migrations to enable this report.'
      }, { status: 503 });
    }
    console.error('[TicketingDemandAdmin] Could not load demand insights:', error);
    return NextResponse.json({ error: 'Ticketing demand insights could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
