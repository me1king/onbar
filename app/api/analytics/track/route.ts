import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Analytics storage is not configured.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid analytics payload is required.' }, { status: 400 });
  }

  const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : '';
  if (!eventName) {
    return NextResponse.json({ error: 'An event name is required.' }, { status: 400 });
  }

  const payload = body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
    ? body.properties as Record<string, unknown>
    : {};

  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl : undefined;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
  const anonymousId = typeof body.anonymousId === 'string' ? body.anonymousId : undefined;

  const { error } = await database.from('analytics_events').insert([{
    event_name: eventName,
    session_id: sessionId,
    anonymous_id: anonymousId,
    page_url: pageUrl,
    payload
  }]);

  if (error) {
    console.error('[AnalyticsTrack] Could not persist event:', error);
    return NextResponse.json({ error: 'The analytics event could not be recorded.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventName }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
