import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_inventory')
    && !hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Catalog or merchant-review management access is required.' }, { status: 403 });
  }

  let body: { applicationId?: unknown; productId?: unknown; decision?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid price review data is required.' }, { status: 400 });
  }

  const productId = Number(body.productId);
  if (!isUuid(body.applicationId)
    || !Number.isSafeInteger(productId)
    || productId < 1
    || !['approve', 'reject'].includes(String(body.decision))) {
    return NextResponse.json({ error: 'Choose a valid merchant product and approve or reject the price request.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  }

  const { data, error } = await database.rpc('review_merchant_offer_price', {
    p_application_id: body.applicationId,
    p_product_id: productId,
    p_decision: body.decision,
    p_actor: session.email || session.role
  });
  if (error) {
    console.error('[MerchantCatalogPriceReview] Could not review proposal:', error);
    if (/review_merchant_offer_price|schema cache/i.test(error.message)) {
      return NextResponse.json({
        error: 'Catalog price review is not installed yet. Run supabase/MERCHANT_CATALOG_PRICE_REVIEW_MIGRATION.sql in the Supabase SQL Editor.'
      }, { status: 503 });
    }
    const staleReview = /catalog price changed|size is no longer available/i.test(error.message);
    return NextResponse.json({
      error: staleReview
        ? error.message
        : 'The price proposal could not be reviewed. Refresh the application and try again.'
    }, { status: staleReview ? 409 : 400 });
  }

  return NextResponse.json({ review: data }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}
