import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Rider mission access is not configured on the server.' }, { status: 503 });
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
    console.error('[RiderMissions] Could not verify rider:', riderError);
    return NextResponse.json({ error: 'Rider authorization could not be verified.' }, { status: 503 });
  }
  if (!rider || rider.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can view assigned missions.' }, { status: 403 });
  }

  const [ordersResult, walletResult] = await Promise.all([
    database.from('orders')
      .select('id, customer_name, customer_phone, status, total_price, payment_method, note, created_at, latitude, longitude')
      .eq('rider_phone', session.phone)
      .order('created_at', { ascending: false }),
    database.from('rider_wallets')
      .select('balance, total_earned')
      .eq('rider_phone', session.phone)
      .maybeSingle()
  ]);

  if (ordersResult.error || walletResult.error) {
    console.error('[RiderMissions] Could not load rider missions or wallet:', ordersResult.error || walletResult.error);
    return NextResponse.json({ error: 'Rider missions could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({
    missions: ordersResult.data || [],
    wallet: walletResult.data || { balance: 0, total_earned: 0 }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
