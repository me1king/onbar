import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

type ReviewRow = {
  id: number;
  product_id: number;
  verified_order_id: number;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;

  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

function isUuid(value: string | null): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAccount(request: Request) {
  const clients = getClients();
  if (!clients) {
    return { response: NextResponse.json({ error: 'Merchant reviews are not configured.' }, { status: 503 }) };
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { response: NextResponse.json({ error: 'Sign in to manage customer reviews.' }, { status: 401 }) };
  }
  const { data, error } = await clients.auth.auth.getUser(token);
  const user = data.user;
  const email = user?.email?.trim().toLowerCase() || null;
  if (error || !user || (!user.email_confirmed_at && !user.phone_confirmed_at)) {
    return { response: NextResponse.json({ error: 'Your merchant sign-in has expired.' }, { status: 401 }) };
  }
  return { database: clients.database, userId: user.id, email };
}

async function getOwnedApplication(
  database: NonNullable<ReturnType<typeof getClients>>['database'],
  userId: string,
  email: string | null,
  applicationId: string | null
) {
  if (!isUuid(applicationId)) return { application: null, error: null };
  const { data, error } = await database
    .from('merchant_applications')
    .select('id,status,email,account_user_id,business_name')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) return { application: null, error };
  const ownsApplication = data && (
    data.account_user_id === userId
    || (email !== null && data.email?.trim().toLowerCase() === email)
  );
  return {
    application: ownsApplication && data.status === 'approved' ? data : null,
    error: null
  };
}

function missingMigration(error: { code?: string; message?: string }) {
  if (error.code === '42P01' || error.code === '42703'
    || /merchant_order_item_trace|merchant_product_batches|merchant_review_responses|verified_order_id|schema cache/i.test(error.message || '')) {
    return 'Merchant review replies are not installed. Run supabase/MERCHANT_REVIEW_REPLIES_MIGRATION.sql after the verified review and merchant operations migrations.';
  }
  return null;
}

async function isReviewLinkedToMerchant(
  database: NonNullable<ReturnType<typeof getClients>>['database'],
  applicationId: string,
  review: Pick<ReviewRow, 'product_id' | 'verified_order_id'>
) {
  const { data: batches, error: batchesError } = await database
    .from('merchant_product_batches')
    .select('id')
    .eq('application_id', applicationId)
    .limit(1000);
  if (batchesError) throw batchesError;
  const batchIds = (batches || []).map(batch => batch.id);
  if (!batchIds.length) return false;

  const { data: orderItems, error: itemsError } = await database
    .from('order_items')
    .select('id')
    .eq('order_id', review.verified_order_id)
    .eq('product_id', review.product_id);
  if (itemsError) throw itemsError;
  const itemIds = (orderItems || []).map(item => Number(item.id)).filter(Number.isSafeInteger);
  if (!itemIds.length) return false;

  const { data: traces, error: tracesError } = await database
    .from('merchant_order_item_trace')
    .select('batch_id')
    .in('batch_id', batchIds)
    .in('order_item_id', itemIds)
    .limit(1000);
  if (tracesError) throw tracesError;
  return Boolean(traces?.length);
}

export async function GET(request: Request) {
  const account = await getAccount(request);
  if ('response' in account) return account.response;
  const applicationId = new URL(request.url).searchParams.get('applicationId');
  const { application, error: applicationError } = await getOwnedApplication(
    account.database,
    account.userId,
    account.email,
    applicationId
  );
  if (applicationError) {
    console.error('[MerchantReviews] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application) {
    return NextResponse.json({ error: 'Choose an approved business linked to your account.' }, { status: 404 });
  }

  const { data: batches, error: batchesError } = await account.database
    .from('merchant_product_batches')
    .select('id')
    .eq('application_id', application.id)
    .limit(1000);
  if (batchesError) {
    console.error('[MerchantReviews] Could not load merchant inventory trace:', batchesError);
    return NextResponse.json({ error: missingMigration(batchesError) || 'Your review eligibility could not be loaded.' }, { status: 503 });
  }
  const batchIds = (batches || []).map(batch => batch.id);
  if (!batchIds.length) return NextResponse.json({ reviews: [] });

  const { data: traces, error: tracesError } = await account.database
    .from('merchant_order_item_trace')
    .select('order_item_id')
    .in('batch_id', batchIds)
    .limit(5000);
  if (tracesError) {
    console.error('[MerchantReviews] Could not load merchant order trace:', tracesError);
    return NextResponse.json({ error: missingMigration(tracesError) || 'Your review eligibility could not be loaded.' }, { status: 503 });
  }
  const orderItemIds = [...new Set((traces || []).map(trace => Number(trace.order_item_id)).filter(Number.isSafeInteger))];
  if (!orderItemIds.length) return NextResponse.json({ reviews: [] });

  const { data: orderItems, error: itemsError } = await account.database
    .from('order_items')
    .select('id,order_id,product_id')
    .in('id', orderItemIds)
    .limit(5000);
  if (itemsError) {
    console.error('[MerchantReviews] Could not load traced products:', itemsError);
    return NextResponse.json({ error: 'Your review eligibility could not be loaded.' }, { status: 503 });
  }
  const pairs = new Set((orderItems || []).map(item => `${item.order_id}:${item.product_id}`));
  const orderIds = [...new Set((orderItems || []).map(item => Number(item.order_id)).filter(Number.isSafeInteger))];
  const productIds = [...new Set((orderItems || []).map(item => Number(item.product_id)).filter(Number.isSafeInteger))];
  if (!orderIds.length || !productIds.length) return NextResponse.json({ reviews: [] });

  const { data: reviews, error: reviewsError } = await account.database
    .from('reviews')
    .select('id,product_id,verified_order_id,customer_name,rating,comment,created_at')
    .eq('is_hidden', false)
    .in('verified_order_id', orderIds)
    .in('product_id', productIds)
    .order('created_at', { ascending: false })
    .limit(100);
  if (reviewsError) {
    console.error('[MerchantReviews] Could not load verified customer reviews:', reviewsError);
    return NextResponse.json({ error: missingMigration(reviewsError) || 'Customer reviews could not be loaded.' }, { status: 503 });
  }

  const visibleReviews = ((reviews || []) as ReviewRow[])
    .filter(review => pairs.has(`${review.verified_order_id}:${review.product_id}`));
  const reviewIds = visibleReviews.map(review => Number(review.id));
  const { data: responses, error: responsesError } = reviewIds.length
    ? await account.database.from('merchant_review_responses')
      .select('review_id,response,updated_at')
      .eq('application_id', application.id)
      .in('review_id', reviewIds)
    : { data: [], error: null };
  if (responsesError) {
    console.error('[MerchantReviews] Could not load merchant replies:', responsesError);
    return NextResponse.json({ error: missingMigration(responsesError) || 'Merchant review replies could not be loaded.' }, { status: 503 });
  }
  const responseByReviewId = new Map((responses || []).map(response => [Number(response.review_id), response]));
  return NextResponse.json({
    reviews: visibleReviews.map(review => ({
      ...review,
      merchantResponse: responseByReviewId.get(Number(review.id))?.response || '',
      responseUpdatedAt: responseByReviewId.get(Number(review.id))?.updated_at || null
    }))
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Review replies must come from this website.' }, { status: 403 });
  }
  const account = await getAccount(request);
  if ('response' in account) return account.response;

  let body: { applicationId?: unknown; reviewId?: unknown; response?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Send a valid merchant reply.' }, { status: 400 });
  }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : null;
  const reviewId = Number(body.reviewId);
  const responseText = typeof body.response === 'string' ? body.response.trim() : '';
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || responseText.length < 1 || responseText.length > 1000) {
    return NextResponse.json({ error: 'Write a reply of up to 1,000 characters.' }, { status: 400 });
  }
  const { application, error: applicationError } = await getOwnedApplication(
    account.database,
    account.userId,
    account.email,
    applicationId
  );
  if (applicationError) {
    console.error('[MerchantReviews] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application) {
    return NextResponse.json({ error: 'Choose an approved business linked to your account.' }, { status: 404 });
  }

  const { data: review, error: reviewError } = await account.database
    .from('reviews')
    .select('id,product_id,verified_order_id')
    .eq('id', reviewId)
    .eq('is_hidden', false)
    .maybeSingle();
  if (reviewError) {
    console.error('[MerchantReviews] Could not verify review:', reviewError);
    return NextResponse.json({ error: missingMigration(reviewError) || 'The review could not be verified.' }, { status: 503 });
  }
  if (!review || !Number.isSafeInteger(Number(review.verified_order_id))) {
    return NextResponse.json({ error: 'This review is not available for a merchant response.' }, { status: 404 });
  }

  try {
    const linked = await isReviewLinkedToMerchant(account.database, application.id, {
      product_id: Number(review.product_id),
      verified_order_id: Number(review.verified_order_id)
    });
    if (!linked) return NextResponse.json({ error: 'This customer order is not linked to your merchant inventory.' }, { status: 403 });
  } catch (error) {
    console.error('[MerchantReviews] Could not verify merchant order trace:', error);
    return NextResponse.json({
      error: error && typeof error === 'object' && 'message' in error
        ? missingMigration(error as { code?: string; message?: string }) || 'The merchant order trace could not be verified.'
        : 'The merchant order trace could not be verified.'
    }, { status: 503 });
  }

  const { data, error } = await account.database
    .from('merchant_review_responses')
    .upsert({
      application_id: application.id,
      review_id: reviewId,
      merchant_name: application.business_name,
      response: responseText,
      last_actor_id: account.userId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'application_id,review_id' })
    .select('review_id,response,updated_at')
    .single();
  if (error || !data) {
    console.error('[MerchantReviews] Could not save merchant reply:', error);
    return NextResponse.json({ error: error ? missingMigration(error) || 'The merchant reply could not be saved.' : 'The merchant reply could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ response: data }, { headers: { 'Cache-Control': 'no-store' } });
}
