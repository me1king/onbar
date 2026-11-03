import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || !['owner', 'admin'].includes(session.role)) {
    return jsonError('Admin access required.', 401);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return jsonError('Admin database access is not configured.', 503);
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (sessionId !== null) {
    if (!sessionId.trim() || sessionId.length > 160) {
      return jsonError('The selected session ID is invalid.', 400);
    }

    const { data: sessionRow, error: sessionError } = await database
      .from('customer_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('analytics_consent', true)
      .maybeSingle();
    if (sessionError) {
      console.error('[AdminSessions] Could not verify analytics consent:', sessionError);
      return jsonError('Session consent settings could not be checked. Apply supabase/LIVE_CUSTOMER_JOURNEY_MIGRATION.sql.', 503);
    }
    if (!sessionRow) return jsonError('This session is unavailable or analytics consent was not granted.', 404);

    const { data, error } = await database
      .from('analytics_events')
      .select('id, event_name, page_url, payload, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) {
      console.error('[AdminSessions] Could not load session activity:', error);
      return jsonError('Session activity could not be loaded. Check the analytics database setup.', 503);
    }

    return NextResponse.json({
      events: (data || []).map(event => ({
        id: event.id,
        action_type: event.event_name,
        page_url: event.page_url || 'Unknown page',
        metadata: event.payload || {},
        timestamp: event.created_at
      }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const activeSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [sessionsResult, eventsResult, cartsResult, ordersResult, abandonedResult, activeResult] = await Promise.all([
    database.from('customer_sessions')
      .select('id, entry_page, source_channel, total_active_time_sec, created_at, session_status, device_info')
      .eq('analytics_consent', true)
      .order('last_seen_at', { ascending: false })
      .limit(50),
    database.from('analytics_events')
      .select('id, event_name, session_id, page_url, created_at')
      .not('session_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
    database.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_name', 'ADD_TO_CART'),
    database.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Delivered'),
    database.from('customer_sessions').select('id', { count: 'exact', head: true }).eq('session_status', 'ABANDONED'),
    database.from('customer_sessions').select('id', { count: 'exact', head: true }).gte('last_seen_at', activeSince)
  ]);
  const queryError = sessionsResult.error || eventsResult.error || cartsResult.error
    || ordersResult.error || abandonedResult.error || activeResult.error;
  if (queryError) {
    console.error('[AdminSessions] Could not load session dashboard data:', queryError);
    return jsonError('Session data could not be loaded. Check the customer-session and analytics migrations.', 503);
  }

  const eventsBySession = new Map<string, typeof eventsResult.data>();
  for (const event of eventsResult.data || []) {
    if (!event.session_id) continue;
    const sessionEvents = eventsBySession.get(event.session_id) || [];
    sessionEvents.push(event);
    eventsBySession.set(event.session_id, sessionEvents);
  }

  const sessions = (sessionsResult.data || []).map(row => {
    const events = eventsBySession.get(row.id) || [];
    const firstEvent = events.at(-1);
    return {
      id: row.id,
      entry_page: row.entry_page || firstEvent?.page_url || 'Unknown entry page',
      source_channel: row.source_channel || 'Unknown source',
      total_active_time_sec: row.total_active_time_sec || 0,
      pages_viewed: new Set(events.map(event => event.page_url).filter(Boolean)).size,
      created_at: row.created_at,
      status: row.session_status || 'Unknown',
      device_info: row.device_info || {}
    };
  });

  return NextResponse.json({
    sessions,
    hud: {
      activeSessions: activeResult.count || 0,
      cartsCreated: cartsResult.count || 0,
      ordersCompleted: ordersResult.count || 0,
      bouncedVisitors: abandonedResult.count || 0
    }
  }, { headers: { 'Cache-Control': 'no-store' } });
}
