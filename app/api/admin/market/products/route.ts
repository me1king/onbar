import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

async function getAuthorizedDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return { response: NextResponse.json({ error: 'Marketplace moderation access required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Marketplace database access is not configured.' }, { status: 503 }) };
  }
  return {
    database: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    session
  };
}

export async function GET() {
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  const { data, error } = await access.database
    .from('mm_products')
    .select('id, name, slug, description, attributes, delivery_information, return_policy, status, review_note, created_at, merchant:mm_merchants!inner(name, slug), category:mm_categories(name), media:mm_product_media(storage_path, media_type, alt_text), variants:mm_product_variants(price_minor, sale_price_minor, sku, currency, size, color)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[MarketAdmin] Could not load products for moderation:', error);
    return NextResponse.json({ error: 'Could not load marketplace product listings.' }, { status: 503 });
  }

  let signingFailed = false;
  const products = await Promise.all((data || []).map(async (product) => {
    const media = await Promise.all((product.media || []).map(async (item) => {
      const { data: signed, error: signError } = await access.database.storage
        .from('midnight-market')
        .createSignedUrl(item.storage_path, 3600);
      if (signError) {
        console.error('[MarketAdmin] Could not sign product photo:', signError);
        signingFailed = true;
        return null;
      }
      return { url: signed.signedUrl, alt: item.alt_text || product.name, mediaType: item.media_type };
    }));
    return { ...product, images: media.filter((item): item is NonNullable<typeof item> => item !== null) };
  }));
  if (signingFailed) {
    return NextResponse.json({ error: 'Product photos could not be loaded for moderation.' }, { status: 503 });
  }
  return NextResponse.json({ products }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }
  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid product review.' }, { status: 400 });
  }

  const productId = typeof body.productId === 'string' ? body.productId : '';
  const status = ['pending_review', 'published', 'rejected', 'archived'].includes(String(body.status))
    ? String(body.status)
    : '';
  const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)
    || !status || reviewNote.length > 1000 || (['rejected', 'archived'].includes(status) && reviewNote.length < 5)) {
    return NextResponse.json({ error: 'Choose a valid listing and review outcome.' }, { status: 400 });
  }
  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before reviewing.' }, { status: 403 });
  }

  const { data, error } = await access.database.rpc('mm_admin_set_product_status', {
    p_product_id: productId,
    p_status: status,
    p_actor_email: access.session.email.trim().toLowerCase(),
    p_review_note: reviewNote || null
  });
  if (error) {
    console.error('[MarketAdmin] Could not moderate product:', error);
    const conflict = error.message.includes('no longer exists')
      || error.message.includes('boutique is suspended');
    const invalid = error.message.includes('provide a reason');
    const statusCode = conflict ? 409 : invalid ? 400 : 503;
    return NextResponse.json({
      error: conflict || invalid
        ? error.message
        : 'Could not update this listing.'
    }, { status: statusCode });
  }

  return NextResponse.json({ product: data }, { headers: { 'Cache-Control': 'no-store' } });
}
