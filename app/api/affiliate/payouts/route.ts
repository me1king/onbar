import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getCustomerId(request: Request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Customer authentication is not configured.');

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Your sign-in session is invalid. Please sign in again.');
  return data.user.id;
}

export async function POST(request: Request) {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Affiliate payouts are not configured.' }, { status: 503 });

  let profileId: string | null;
  try {
    profileId = await getCustomerId(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Your sign-in session is invalid.' }, { status: 401 });
  }
  if (!profileId) return NextResponse.json({ error: 'Please sign in to request a payout.' }, { status: 401 });

  let body: { amount?: unknown; payment_method?: unknown; payment_details?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid payout request is required.' }, { status: 400 });
  }

  const amount = Number(body.amount);
  const method = body.payment_method;
  const details = typeof body.payment_details === 'string' ? body.payment_details.trim() : '';
  if (!Number.isSafeInteger(amount) || amount < 1000 || !['M-Pesa', 'Bank'].includes(String(method)) || details.length < 3 || details.length > 200) {
    return NextResponse.json({ error: 'Payouts require at least KSh 1,000 and valid M-Pesa or bank details.' }, { status: 400 });
  }

  const { data, error } = await database.rpc('request_affiliate_payout', {
    p_profile_id: profileId,
    p_amount: amount,
    p_payment_method: method,
    p_payment_details: details
  });
  if (error) {
    if (error.message.includes('Insufficient available earnings')) {
      return NextResponse.json({ error: 'Your available earnings are not enough for this payout request.' }, { status: 409 });
    }
    if (error.message.includes('Approved affiliate')) {
      return NextResponse.json({ error: 'Your affiliate account must be approved before requesting a payout.' }, { status: 403 });
    }
    console.error('[Affiliate] Could not create payout request:', error);
    return NextResponse.json({ error: `Could not create payout request: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, payoutId: data });
}
