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
    return NextResponse.json({ error: 'Review rewards are not configured.' }, { status: 503 });
  }
  if (!token) return NextResponse.json({ error: 'Sign in to claim review points.' }, { status: 401 });

  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const database = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 });

    let body: { reviewId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'A valid review is required.' }, { status: 400 });
    }

    const reviewId = Number(body.reviewId);
    if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
      return NextResponse.json({ error: 'A valid review is required.' }, { status: 400 });
    }

    const { data: review, error: reviewError } = await database
      .from('reviews')
      .select('id, customer_user_id, photo_urls, product_id')
      .eq('id', reviewId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review || review.customer_user_id !== user.id) {
      return NextResponse.json({ error: 'Review not found for this account.' }, { status: 404 });
    }
    if (!Array.isArray(review.photo_urls) || review.photo_urls.length === 0) {
      return NextResponse.json({ error: 'A photo review is required for this reward.' }, { status: 400 });
    }

    const { data: config, error: configError } = await database
      .from('loyalty_config')
      .select('value')
      .eq('id', true)
      .single();
    if (configError) throw configError;
    const rewardPoints = Number(config.value?.points?.photo_review);
    if (!Number.isSafeInteger(rewardPoints) || rewardPoints <= 0) {
      return NextResponse.json({ error: 'Photo review rewards are currently disabled.' }, { status: 409 });
    }

    const { data, error } = await database.rpc('apply_loyalty_points', {
      profile_id_input: user.id,
      amount_input: rewardPoints,
      description_input: `Photo review reward for product #${review.product_id}`,
      event_key_input: `photo-review:${review.id}`
    });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      pointsAwarded: data?.[0]?.applied ? rewardPoints : 0,
      balance: Number(data?.[0]?.balance || 0)
    });
  } catch (error) {
    console.error('[ReviewReward] Could not award review points:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not award review points.' }, { status: 500 });
  }
}
