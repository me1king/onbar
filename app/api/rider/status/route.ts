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

  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('status, verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderStatus] Could not load rider state:', riderError);
    return NextResponse.json({ error: 'Rider status could not be loaded.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can change online status.' }, { status: 403 });
  }

  if (!body.online) {
    const { count, error: activeOrdersError } = await database
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_phone', session.phone)
      .in('status', ['Dispatched', 'Out for Delivery']);
    if (activeOrdersError) {
      console.error('[RiderStatus] Could not verify active deliveries:', activeOrdersError);
      return NextResponse.json({ error: 'Active deliveries could not be verified; status was not changed.' }, { status: 503 });
    }
    if ((count || 0) > 0) {
      return NextResponse.json({ error: 'Complete or hand off active deliveries before going offline.' }, { status: 409 });
    }
  }

  const timestamp = new Date().toISOString();
  const { error: updateError } = await database
    .from('rider_status')
    .update({
      status: body.online ? 'Idle' : 'Offline',
      online_since: body.online ? timestamp : null,
      updated_at: timestamp
    })
    .eq('rider_phone', session.phone);
  if (updateError) {
    console.error('[RiderStatus] Could not update rider state:', updateError);
    return NextResponse.json({ error: 'Rider status could not be saved.' }, { status: 503 });
  }

  return NextResponse.json({
    status: body.online ? 'Idle' : 'Offline',
    updatedAt: timestamp
  }, { headers: { 'Cache-Control': 'no-store' } });
}
