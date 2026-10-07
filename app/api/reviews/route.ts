import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const submissionWindows = new Map<string, { startedAt: number; count: number }>();

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Reviews are temporarily unavailable.' }, { status: 503 });
  }

  let body: {
    productId?: unknown;
    customerName?: unknown;
    rating?: unknown;
    comment?: unknown;
    photoUrls?: unknown;
  };
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  let userId: string | null = null;
  if (token) {
    if (!supabase) return NextResponse.json({ error: 'Review authentication is unavailable.' }, { status: 503 });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });
    userId = user.id;
  }
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Review details must be valid JSON.' }, { status: 400 });
  }

  const productId = Number(body.productId);
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  const rating = Number(body.rating);
  const photoUrls = body.photoUrls;

  if (!Number.isSafeInteger(productId) || productId < 1) {
    return NextResponse.json({ error: 'Choose a valid product to review.' }, { status: 400 });
  }
  if (!customerName || customerName.length > 100) {
    return NextResponse.json({ error: 'Enter your name (up to 100 characters).' }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Choose a rating from 1 to 5 stars.' }, { status: 400 });
  }
  if (!comment || comment.length > 2000) {
    return NextResponse.json({ error: 'Write a review of up to 2,000 characters.' }, { status: 400 });
  }
  if (!Array.isArray(photoUrls) || photoUrls.length > 3 || !photoUrls.every((photo) =>
    typeof photo === 'string'
    && photo.startsWith(`${url}/storage/v1/object/public/onlinebar-assets/reviews/`)
  )) {
    return NextResponse.json({ error: 'Review photos must be uploaded to the Online Bar review gallery.' }, { status: 400 });
  }

  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const now = Date.now();
  const window = submissionWindows.get(address);
  if (window && now - window.startedAt < RATE_WINDOW_MS && window.count >= MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json({ error: 'Too many review attempts. Please try again in 15 minutes.' }, { status: 429 });
  }
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    submissionWindows.set(address, { startedAt: now, count: 1 });
  } else {
    window.count += 1;
  }
  if (submissionWindows.size > 1000) {
    for (const [key, entry] of submissionWindows) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) submissionWindows.delete(key);
    }
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  if (userId && photoUrls.length > 0) {
    const folder = `reviews/${userId}`;
    const paths = photoUrls.map((photo) => {
      const marker = '/storage/v1/object/public/onlinebar-assets/';
      return typeof photo === 'string' ? photo.slice(photo.indexOf(marker) + marker.length) : '';
    });
    if (paths.some(path => !path.startsWith(`${folder}/`))) {
      return NextResponse.json({ error: 'Review photos must be uploaded to your own review gallery.' }, { status: 403 });
    }
    const { data: uploadedFiles, error: storageError } = await database.storage
      .from('onlinebar-assets')
      .list(folder, { limit: 100 });
    if (storageError) {
      console.error('[Reviews] Could not verify uploaded review photos:', storageError);
      return NextResponse.json({ error: 'Review photos could not be verified.' }, { status: 503 });
    }
    const uploadedNames = new Set((uploadedFiles || []).map(file => `${folder}/${file.name}`));
    if (paths.some(path => !uploadedNames.has(path))) {
      return NextResponse.json({ error: 'Every review photo must be uploaded before submission.' }, { status: 400 });
    }
  }
  const { data, error } = await database
    .from('reviews')
    .insert({
      product_id: productId,
      customer_name: customerName,
      rating,
      comment,
      photo_urls: photoUrls,
      user_id: userId,
      customer_user_id: userId,
      is_verified_owner: false,
      is_hidden: false
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Reviews] Could not save customer review:', error);
    return NextResponse.json({ error: 'Your review could not be saved. Please try again shortly.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
