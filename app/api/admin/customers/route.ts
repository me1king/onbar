import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  }
  if (
    !['owner', 'admin'].includes(session.role.toLowerCase())
  ) {
    return NextResponse.json({ error: 'Only senior management can access the customer directory.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({
      error: 'Supabase server connection is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
    }, { status: 503 });
  }

  const [ordersResult, profilesResult, referralsResult, referralLedgerResult] = await Promise.all([
    database
      .from('orders')
      .select('id, user_id, customer_name, customer_phone, total_price, status, created_at, referred_by_code, latitude, longitude')
      .order('created_at', { ascending: false }),
    database
      .from('profiles')
      .select('id, phone_number, referral_code, full_name, birth_date, address, segment, lifetime_value, total_orders, last_purchase_at, latitude, longitude'),
    database
      .from('loyalty_referrals')
      .select('referred_profile_id, referrer_profile_id, referral_code, qualifying_order_id, created_at')
      .order('created_at', { ascending: false }),
    database
      .from('loyalty_ledger')
      .select('profile_id, amount, event_key, created_at')
      .like('event_key', 'referral%')
      .order('created_at', { ascending: false })
  ]);

  if (ordersResult.error || profilesResult.error || referralsResult.error || referralLedgerResult.error) {
    const errors = [
      ordersResult.error?.message,
      profilesResult.error?.message,
      referralsResult.error?.message,
      referralLedgerResult.error?.message
    ]
      .filter((message): message is string => Boolean(message));
    console.error('[AdminCustomers] Could not load customer data:', errors.join(' '));
    return NextResponse.json({
      error: `Customer data could not be loaded: ${errors.join(' ')}`
    }, { status: 500 });
  }

  return NextResponse.json({
    orders: ordersResult.data || [],
    profiles: profilesResult.data || [],
    referrals: referralsResult.data || [],
    referralLedger: referralLedgerResult.data || []
  }, { headers: { 'Cache-Control': 'no-store' } });
}
