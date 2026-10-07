import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionCookie } from '@/lib/adminAuth';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session || (
    !['owner', 'admin'].includes(session.role.toLowerCase())
    && session.permissions?.can_manage_orders !== true
  )) {
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
