import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const submissionWindows = new Map<string, { startedAt: number; count: number }>();

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!url || !serviceKey || !publicKey) {
    return NextResponse.json({ error: 'Review eligibility is temporarily unavailable.' }, { status: 503 });
  }
  if (!token) return NextResponse.json({ error: 'Sign in to check review eligibility.' }, { status: 401 });

  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });
  }

  const productId = Number(new URL(request.url).searchParams.get('productId'));
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return NextResponse.json({ error: 'Choose a valid product.' }, { status: 400 });
  }

  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: orders, error: ordersError } = await database
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['Paid', 'Delivered', 'Completed']);
  if (ordersError) {
    console.error('[Reviews] Could not check purchase history:', ordersError);
    return NextResponse.json({ error: 'Purchase history could not be checked.' }, { status: 503 });
  }
  const orderIds = (orders || []).map((order) => Number(order.id)).filter(Number.isSafeInteger);
  if (!orderIds.length) return NextResponse.json({ eligible: false });

  const { data: purchasedItems, error: itemsError } = await database
    .from('order_items')
    .select('order_id')
    .eq('product_id', productId)
    .in('order_id', orderIds);
  if (itemsError) {
    console.error('[Reviews] Could not verify purchased product:', itemsError);
    return NextResponse.json({ error: 'Purchase history could not be checked.' }, { status: 503 });
  }
  const eligibleOrderIds = [...new Set((purchasedItems || [])
    .map((item) => Number(item.order_id))
    .filter(Number.isSafeInteger))];
  if (!eligibleOrderIds.length) return NextResponse.json({ eligible: false });

  const { data: submittedReviews, error: reviewsError } = await database
    .from('reviews')
    .select('verified_order_id')
    .eq('product_id', productId)
    .eq('customer_user_id', user.id)
    .in('verified_order_id', eligibleOrderIds);
  if (reviewsError) {
    console.error('[Reviews] Could not check prior reviews:', reviewsError);
    return NextResponse.json({ error: 'Review eligibility could not be checked.' }, { status: 503 });
  }
  const alreadyReviewed = new Set((submittedReviews || []).map((review) => Number(review.verified_order_id)));
  const eligibleOrderId = eligibleOrderIds.find((id) => !alreadyReviewed.has(id));
  return NextResponse.json({
    eligible: eligibleOrderId !== undefined,
    ...(eligibleOrderId !== undefined ? { orderId: eligibleOrderId } : {})
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Reviews are temporarily unavailable.' }, { status: 503 });
  }

  let body: {
    productId?: unknown;
    orderId?: unknown;
    customerName?: unknown;
    rating?: unknown;
    comment?: unknown;
    photoUrls?: unknown;
    website?: unknown;
    formStartedAt?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Review details must be valid JSON.' }, { status: 400 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Sign in with the account used for your purchase to review this product.' }, { status: 401 });
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!publicKey) return NextResponse.json({ error: 'Review authentication is unavailable.' }, { status: 503 });
  const auth = createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Your sign-in has expired.' }, { status: 401 });
  const userId = user.id;

  const productId = Number(body.productId);
  const orderId = Number(body.orderId);
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
  const rating = Number(body.rating);
  const photoUrls = body.photoUrls;

  if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: 'Choose a valid product to review.' }, { status: 400 });
  }
  if (typeof body.website !== 'string' || body.website.trim()) {
    return NextResponse.json({ error: 'The review could not be accepted.' }, { status: 400 });
  }
  const formStartedAt = Number(body.formStartedAt);
  const elapsed = Date.now() - formStartedAt;
  if (!Number.isSafeInteger(formStartedAt) || elapsed < 2500 || elapsed > 6 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Please take a moment to complete the review form, then try again.' }, { status: 400 });
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
  const [{ data: order, error: orderError }, { data: purchasedItem, error: itemError }] = await Promise.all([
    database.from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('user_id', userId)
      .in('status', ['Paid', 'Delivered', 'Completed'])
      .maybeSingle(),
    database.from('order_items')
      .select('id')
      .eq('order_id', orderId)
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle()
  ]);
  if (orderError || itemError) {
    console.error('[Reviews] Could not verify review purchase:', orderError || itemError);
    return NextResponse.json({ error: 'Purchase history could not be verified.' }, { status: 503 });
  }
  if (!order || !purchasedItem) {
    return NextResponse.json({ error: 'Only customers with a paid or completed purchase of this product can review it.' }, { status: 403 });
  }

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
  const { data, error } = await database.rpc('create_verified_product_review', {
    product_id_input: productId,
    customer_user_id_input: userId,
    order_id_input: orderId,
    customer_name_input: customerName,
    rating_input: rating,
    comment_input: comment,
    photo_urls_input: photoUrls
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You have already reviewed this product for that purchase.' }, { status: 409 });
    }
    if (error.message.includes('not eligible') || error.message.includes('already reviewed')) {
      return NextResponse.json({ error: 'Only customers with an unreviewed, paid purchase of this product can post a review.' }, { status: 403 });
    }
    console.error('[Reviews] Could not save customer review:', error);
    return NextResponse.json({ error: 'Your review could not be saved. Please try again shortly.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: Number(data) }, { status: 201 });
}
