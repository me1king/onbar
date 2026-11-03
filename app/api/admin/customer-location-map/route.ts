import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || !['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Authorized operations access is required.' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Operations database access is not configured.' }, { status: 503 });
  }
  const database = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const now = new Date();
  const { error: cleanupError } = await database.from('customer_live_location_shares')
    .delete()
    .lt('expires_at', now.toISOString());
  if (cleanupError) {
    console.error('[CustomerLocationMap] Could not remove expired location shares:', cleanupError);
    return NextResponse.json({
      error: cleanupError.code === '42P01' || cleanupError.code === 'PGRST205'
        || /customer_live_location_shares/i.test(cleanupError.message)
        ? 'The customer live location map is not installed. Apply supabase/CUSTOMER_LIVE_LOCATION_SHARING_MIGRATION.sql.'
        : 'Expired customer locations could not be removed.'
    }, { status: 503 });
  }
  const { data, error } = await database.from('customer_live_location_shares')
    .select('share_id,latitude,longitude,precision,accuracy_m,city,area,activity,last_seen_at')
    .gt('expires_at', now.toISOString())
    .order('last_seen_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[CustomerLocationMap] Could not load opted-in live locations:', error);
    return NextResponse.json({
      error: error.code === '42P01' || error.code === 'PGRST205'
        || /customer_live_location_shares/i.test(error.message)
        ? 'The customer live location map is not installed. Apply supabase/CUSTOMER_LIVE_LOCATION_SHARING_MIGRATION.sql.'
        : 'Opted-in customer locations could not be loaded.'
    }, { status: 503 });
  }

  const locations = (data || []).map(location => ({
    id: location.share_id,
    visitorCode: `Visitor ${location.share_id.slice(0, 6).toUpperCase()}`,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    precision: location.precision,
    accuracyM: location.accuracy_m === null ? null : Number(location.accuracy_m),
    city: location.city,
    area: location.area,
    activity: location.activity,
    lastSeenAt: location.last_seen_at
  }));
  return NextResponse.json({
    locations,
    activeCount: locations.length,
    refreshedAt: now.toISOString()
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
