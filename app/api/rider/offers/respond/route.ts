import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  let body: { orderId?: unknown; response?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid offer response is required.' }, { status: 400 });
  }
  const orderId = Number(body.orderId);
  const response = body.response;
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !['accepted', 'declined'].includes(String(response))) {
    return NextResponse.json({ error: 'Choose accept or decline for a valid order.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider offer access is not configured on the server.' }, { status: 503 });
  }
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: rider, error: riderError } = await database
    .from('rider_status')
    .select('verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (riderError) {
    console.error('[RiderOffer] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can respond to delivery offers.' }, { status: 403 });
  }

  const { data, error } = await database.rpc('respond_to_rider_order_offer', {
    p_order_id: orderId,
    p_rider_phone: session.phone,
    p_response: response
  });
  if (error) {
    console.error('[RiderOffer] Could not save offer response:', error);
    const conflict = /offer|assigned to this rider|no longer available|already been answered/i.test(error.message);
    return NextResponse.json({
      error: /respond_to_rider_order_offer|schema cache/i.test(error.message)
        ? 'Rider offer workflow is not installed. Apply supabase/RIDER_TERMINAL_WORKFLOW_MIGRATION.sql.'
        : conflict
          ? error.message
          : 'Your offer response could not be saved. Try again.'
    }, { status: conflict ? 409 : 503 });
  }

  const result = data as { response?: string; status?: string } | null;
  if (!result?.response || !result.status) {
    return NextResponse.json({ error: 'The server returned an invalid offer response.' }, { status: 503 });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
