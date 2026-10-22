import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider management permission is required.' }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ riders: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });

  const { data, error } = await database
    .from('rider_status')
    .select('rider_name, rider_phone')
    .ilike('rider_name', `%${query}%`)
    .limit(2);
  if (error) {
    console.error('[AdminDispatch] Could not search riders:', error);
    return NextResponse.json({ error: 'Rider search is unavailable.' }, { status: 500 });
  }
  return NextResponse.json({ riders: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_orders')) {
    return NextResponse.json({ error: 'Rider management permission is required.' }, { status: 403 });
  }

  let body: { phone?: unknown };
  try {
    body = await request.json() as { phone?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone || phone.length > 50) {
    return NextResponse.json({ error: 'A valid rider phone number is required.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server-side rider database access is not configured.' }, { status: 503 });
  }

  const pin = String(randomInt(1000, 10000));
  const { data, error } = await database
    .from('rider_status')
    .update({ verification_status: 'Verified', pin })
    .eq('rider_phone', phone)
    .select('rider_phone')
    .maybeSingle();

  if (error) {
    console.error('[AdminDispatch] Could not verify rider:', error);
    return NextResponse.json({ error: `Could not authorize rider: ${error.message}` }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Rider was not found.' }, { status: 404 });
  return NextResponse.json({ success: true, pin });
}
