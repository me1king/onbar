import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !supabase) {
    return NextResponse.json({ error: 'Sign in to claim a review reward.' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });
  }

  let body: { reviewId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid review is required.' }, { status: 400 });
  }
  const reviewId = Number(body.reviewId);
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) {
    return NextResponse.json({ error: 'A valid review is required.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Review rewards are not configured.' }, { status: 503 });

  const { data, error } = await database.rpc('award_photo_review_reward', {
    review_id_input: reviewId,
    profile_id_input: user.id
  });
  if (error) {
    if (error.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('[ReviewReward] Could not award review points:', error);
    return NextResponse.json({ error: 'Could not process the review reward.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, pointsAwarded: data });
}
