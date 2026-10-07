import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Achievement rewards are not configured.' }, { status: 503 });
  }
  if (!token) return NextResponse.json({ error: 'Sign in to unlock achievements.' }, { status: 401 });

  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 });
    let body: { achievementKey?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'A valid achievement is required.' }, { status: 400 });
    }
    if (typeof body.achievementKey !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(body.achievementKey)) {
      return NextResponse.json({ error: 'A valid achievement is required.' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await database
      .from('profiles')
      .select('referral_code, xp')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;

    const [{ data: orders, error: ordersError }, { count: reviewCount, error: reviewsError }] = await Promise.all([
      database
        .from('orders')
        .select('total_price')
        .eq('user_id', user.id)
        .in('status', ['Paid', 'Delivered', 'Completed']),
      database
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('customer_user_id', user.id)
    ]);
    if (ordersError) throw ordersError;
    if (reviewsError) throw reviewsError;

    const deliveredOrders = orders || [];
    const deliveredSpend = deliveredOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
    let eligible = false;
    switch (body.achievementKey) {
      case 'first-pour':
        eligible = deliveredOrders.length >= 1;
        break;
      case 'bar-regular':
        eligible = deliveredOrders.length >= 5;
        break;
      case 'connoisseur':
        eligible = Number(reviewCount || 0) >= 5;
        break;
      case 'social-patron':
        if (profile.referral_code) {
          const { count, error } = await database
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('referred_by_code', profile.referral_code)
            .in('status', ['Paid', 'Delivered', 'Completed']);
          if (error) throw error;
          eligible = Number(count || 0) >= 1;
        }
        break;
      case 'vvip-shopper':
        eligible = deliveredSpend >= 50000;
        break;
      case 'mixology-master':
        eligible = Number(profile.xp || 0) >= 2000;
        break;
      default:
        return NextResponse.json({ error: 'Unknown achievement.' }, { status: 404 });
    }
    if (!eligible) {
      return NextResponse.json({ error: 'This achievement has not been earned yet.' }, { status: 409 });
    }

    const { data, error } = await database.rpc('unlock_loyalty_achievement', {
      profile_id_input: user.id,
      achievement_key_input: body.achievementKey
    });
    if (error) throw error;
    return NextResponse.json(data?.[0] || { unlocked: false, points_awarded: 0 });
  } catch (error) {
    console.error('[MemberAchievement] Could not unlock achievement:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not unlock achievement.' }, { status: 500 });
  }
}
