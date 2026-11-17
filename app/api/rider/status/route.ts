import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { online?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid online status is required.' }, { status: 400 });
  }
  if (typeof body.online !== 'boolean') {
    return NextResponse.json({ error: 'A valid online status is required.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider status updates are not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await database.rpc('set_rider_online_status', {
    p_rider_phone: session.phone,
    p_online: body.online
  });
  if (error) {
    console.error('[RiderStatus] Could not update rider state:', error);
    return NextResponse.json({
      error: /set_rider_online_status|rider_offline_location_events|schema cache/i.test(error.message)
        ? 'Rider offline-location audit is not installed. Apply supabase/RIDER_OFFLINE_LOCATION_AND_BUZZ_MIGRATION.sql.'
        : 'Rider status could not be saved.'
    }, { status: 503 });
  }
  const result = data as { success?: boolean; status?: string; updated_at?: string; code?: string; error?: string } | null;
  if (!result?.success || !result.status || !result.updated_at) {
    const status = result?.code === 'RIDER_NOT_VERIFIED' ? 403
      : result?.code === 'ACTIVE_DELIVERY' ? 409
        : 400;
    return NextResponse.json({ error: result?.error || 'Rider status could not be saved.' }, { status });
  }

  return NextResponse.json({
    status: result.status,
    updatedAt: result.updated_at
  }, { headers: { 'Cache-Control': 'no-store' } });
}
