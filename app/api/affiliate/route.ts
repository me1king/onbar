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

async function getCustomer(request: Request) {
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
  return data.user;
}

export async function GET(request: Request) {
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Affiliate services are not configured.' }, { status: 503 });

  let user;
  try {
    user = await getCustomer(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Your sign-in session is invalid.' }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });

  try {
    const { data: affiliateStatus, error: statusError } = await database.from('affiliates')
      .select('verification_status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (statusError) throw statusError;

    if (affiliateStatus?.verification_status !== 'Verified') {
      const code = affiliateStatus?.verification_status === 'Pending' ? 'APPLICATION_PENDING'
        : affiliateStatus?.verification_status === 'Suspended' ? 'ACCOUNT_SUSPENDED'
          : 'INVITE_REQUIRED';
      return NextResponse.json({
        error: affiliateStatus?.verification_status === 'Pending'
          ? 'Your affiliate account is awaiting review.'
          : affiliateStatus?.verification_status === 'Suspended'
            ? 'Affiliate access is currently suspended.'
            : 'Affiliate access is invitation-only.',
        code
      }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    const [{ data: application, error: applicationError }, { data: performance, error: performanceError }, { data: payouts, error: payoutsError }] = await Promise.all([
      database.from('affiliates')
        .select('id, verification_status, business_name, bio, audience_size, primary_channels, preferred_payout_method, payout_details, commission_rate_override')
        .eq('user_id', user.id)
        .single(),
      database.from('affiliate_performance_summary')
        .select('referral_code, clicks, conversions, total_revenue, available_earnings, pending_earnings, last_conversion_at, pending_orders, pending_sales')
        .eq('affiliate_id', user.id)
        .maybeSingle(),
      database.from('affiliate_payouts')
        .select('id, amount, status, payment_method, created_at, processed_at, mpesa_receipt')
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
    ]);
    if (applicationError) throw applicationError;
    if (performanceError) throw performanceError;
    if (payoutsError) throw payoutsError;
    if (application.verification_status !== 'Verified') {
      const code = application.verification_status === 'Pending' ? 'APPLICATION_PENDING'
        : application.verification_status === 'Suspended' ? 'ACCOUNT_SUSPENDED'
          : 'INVITE_REQUIRED';
      return NextResponse.json({ error: 'Affiliate access is no longer active.', code }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (!performance) throw new Error('Affiliate performance summary is unavailable. Please contact support.');

    const referralCode = performance.referral_code;
    if (!referralCode) throw new Error('Your profile does not have a referral code yet. Please contact support.');
    const rate = Number(application.commission_rate_override) || 5;
    const [{ data: products, error: productsError }, { data: attributedOrders, error: ordersError }] = await Promise.all([
      database.from('products')
        .select('id, name, price, category, image_url, stock')
        .eq('status', 'Live')
        .eq('is_available_now', true)
        .gt('stock', 0)
        .order('name')
        .limit(100),
      database.from('orders')
        .select('id, status, total_price, created_at')
        .eq('referred_by_code', referralCode)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);
    if (productsError) throw productsError;
    if (ordersError) throw ordersError;

    return NextResponse.json({
      application,
      referralCode,
      stats: {
        clicks: Number(performance.clicks || 0),
        conversions: Number(performance.conversions || 0),
        sales: Number(performance.total_revenue || 0),
        earned: Number(performance.total_revenue || 0) * rate / 100,
        available: Number(performance.available_earnings || 0),
        pendingEarnings: Number(performance.pending_earnings || 0),
        pendingOrders: Number(performance.pending_orders || 0),
        pendingSales: Number(performance.pending_sales || 0),
        commissionRate: rate
      },
      payouts: payouts || [],
      products: (products || []).map(product => ({
        id: Number(product.id),
        name: product.name,
        price: Number(product.price),
        category: product.category || 'Other',
        imageUrl: product.image_url,
        inStock: Number(product.stock || 0) > 0
      })),
      attributedOrders: (attributedOrders || []).map(order => ({
        id: Number(order.id),
        status: order.status,
        total: Number(order.total_price || 0),
        createdAt: order.created_at
      }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Affiliate] Could not load customer affiliate data:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load affiliate details.' }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({
    error: 'The affiliate program is invitation-only. Use the invitation link sent to your email.',
    code: 'INVITE_REQUIRED'
  }, { status: 403 });
}
