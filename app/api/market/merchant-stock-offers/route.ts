import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { getMarketConfiguration, getMarketMerchantContext } from '@/lib/marketMerchantAuth.server';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const storageBucket = 'midnight-market';
const maxPhotoSize = 4 * 1024 * 1024;

function isMissingMigration(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === '42883'
    || /mm_merchant_stock_offer/i.test(error.message || '');
}

function matchesImageType(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  if (mimeType === 'image/avif') {
    return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
      && ['avif', 'avis', 'mif1'].includes(String.fromCharCode(...bytes.slice(8, 12)));
  }
  return false;
}

function migrationResponse(error: { code?: string; message?: string }) {
  return isMissingMigration(error)
    ? 'Run supabase/MERCHANT_STOCK_OFFERS_MIGRATION.sql in Supabase before using merchant stock offers.'
    : null;
}

async function signOfferPhoto(database: SupabaseClient, path: string) {
  const { data, error } = await database.storage.from(storageBucket).createSignedUrl(path, 60 * 60);
  if (error) {
    console.error('[MerchantStockOffers] Could not sign offer photo:', error);
    throw new Error('A merchant stock photo could not be loaded.');
  }
  return data.signedUrl;
}

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get('view');
  if (mode === 'admin') {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
    if (!['admin', 'owner'].includes(session.role.toLowerCase())
      && !hasAdminPermission(session, 'can_manage_inventory')) {
      return NextResponse.json({ error: 'Inventory review access required.' }, { status: 403 });
    }

    const configuration = getMarketConfiguration();
    if (!configuration) return NextResponse.json({ error: 'Marketplace database access is not configured.' }, { status: 503 });
    const database = createClient(configuration.url, configuration.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: offers, error } = await database.from('mm_merchant_stock_offers')
      .select('id,merchant_id,product_id,submitted_by,photo_path,offered_quantity,offered_merchant_price,status,review_note,reviewed_by_email,reviewed_at,created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) {
      console.error('[MerchantStockOffers] Could not load admin review queue:', error);
      return NextResponse.json({ error: migrationResponse(error) || 'Could not load merchant stock offers.' }, { status: 503 });
    }

    const rows = offers || [];
    const merchantIds = [...new Set(rows.map(offer => offer.merchant_id))];
    const productIds = [...new Set(rows.map(offer => Number(offer.product_id)))];
    const [{ data: merchants, error: merchantsError }, { data: products, error: productsError }, { data: selections, error: selectionsError }] = await Promise.all([
      merchantIds.length
        ? database.from('mm_merchants').select('id,name,slug').in('id', merchantIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? database.from('products').select('id,name,price,image_url').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      rows.length
        ? database.from('mm_merchant_catalog_items').select('merchant_id,product_id,merchant_price,stock,is_listed')
          .in('merchant_id', merchantIds).in('product_id', productIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    const queryError = merchantsError || productsError || selectionsError;
    if (queryError) {
      console.error('[MerchantStockOffers] Could not load offer comparisons:', queryError);
      return NextResponse.json({ error: 'Could not load current product, merchant, and stock comparisons.' }, { status: 503 });
    }
    const merchantById = new Map((merchants || []).map(merchant => [merchant.id, merchant]));
    const productById = new Map((products || []).map(product => [Number(product.id), product]));
    const selectionByKey = new Map((selections || []).map(item => [`${item.merchant_id}:${item.product_id}`, item]));
    try {
      const result = await Promise.all(rows.map(async offer => {
        const product = productById.get(Number(offer.product_id));
        if (!product) throw new Error('A product attached to a stock offer could not be loaded.');
        const current = selectionByKey.get(`${offer.merchant_id}:${offer.product_id}`);
        return {
          ...offer,
          offered_merchant_price: Number(offer.offered_merchant_price),
          product: { id: Number(product.id), name: product.name, customer_price: Number(product.price), image_url: product.image_url || '' },
          merchant: merchantById.get(offer.merchant_id) || { id: offer.merchant_id, name: 'Merchant unavailable', slug: '' },
          current: {
            stock: Number(current?.stock || 0),
            merchant_price: Number(current?.merchant_price || 0),
            is_listed: Boolean(current?.is_listed)
          },
          photo_url: await signOfferPhoto(database, offer.photo_path)
        };
      }));
      return NextResponse.json({ offers: result }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not load merchant stock photos.' }, { status: 503 });
    }
  }

  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;
  const { data: offers, error } = await context.database.from('mm_merchant_stock_offers')
    .select('id,product_id,photo_path,offered_quantity,offered_merchant_price,status,review_note,reviewed_at,created_at')
    .eq('merchant_id', context.merchantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[MerchantStockOffers] Could not load merchant history:', error);
    return NextResponse.json({ error: migrationResponse(error) || 'Could not load your stock offer history.' }, { status: 503 });
  }
  const rows = offers || [];
  const productIds = [...new Set(rows.map(offer => Number(offer.product_id)))];
  const { data: products, error: productsError } = productIds.length
    ? await context.database.from('products').select('id,name,price').in('id', productIds)
    : { data: [], error: null };
  if (productsError) {
    console.error('[MerchantStockOffers] Could not load products for merchant history:', productsError);
    return NextResponse.json({ error: 'Could not load your stock offer products.' }, { status: 503 });
  }
  const productById = new Map((products || []).map(product => [Number(product.id), product]));
  try {
    const result = await Promise.all(rows.map(async offer => {
      const product = productById.get(Number(offer.product_id));
      if (!product) throw new Error('A product attached to your stock offer could not be loaded.');
      return {
        ...offer,
        offered_merchant_price: Number(offer.offered_merchant_price),
        product: { id: Number(product.id), name: product.name, customer_price: Number(product.price) },
        photo_url: await signOfferPhoto(context.database, offer.photo_path)
      };
    }));
    return NextResponse.json({ offers: result }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not load your stock offer photos.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send a valid stock offer.' }, { status: 400 });
  }
  const productId = Number(form.get('product_id'));
  const quantity = Number(form.get('quantity'));
  const offeredPrice = Number(form.get('offered_merchant_price'));
  const photo = form.get('photo');
  if (!Number.isSafeInteger(productId) || productId <= 0
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000
    || !Number.isFinite(offeredPrice) || offeredPrice < 1 || offeredPrice > 100000000
    || !(photo instanceof File) || photo.size < 1 || photo.size > maxPhotoSize
    || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(photo.type)) {
    return NextResponse.json({ error: 'Choose a catalog product, a positive stock quantity and offer price, and a JPG, PNG, WebP or AVIF photo under 4 MB.' }, { status: 400 });
  }
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (!matchesImageType(bytes, photo.type)) {
    return NextResponse.json({ error: 'The uploaded photo does not match its file type.' }, { status: 400 });
  }

  const [{ data: product, error: productError }, { data: policy, error: policyError }] = await Promise.all([
    context.database.from('products')
      .select('id,price,is_bite,is_snack,is_souvenir,is_available_now,hide_product,status,category,sub_category')
      .eq('id', productId).maybeSingle(),
    context.database.from('mm_catalog_pricing_policy').select('minimum_margin').eq('id', true).maybeSingle()
  ]);
  if (productError || policyError) {
    const queryError = productError || policyError;
    console.error('[MerchantStockOffers] Could not validate stock offer:', queryError);
    return NextResponse.json({ error: migrationResponse(queryError!) || 'Could not validate this product and its pricing rules.' }, { status: 503 });
  }
  if (!product || !isStorefrontProductVisible(product)) {
    return NextResponse.json({ error: 'Choose an active product from the current catalog.' }, { status: 400 });
  }
  const minimumMargin = Number(policy?.minimum_margin ?? 30);
  if (Number(product.price) - offeredPrice < minimumMargin) {
    return NextResponse.json({ error: `Your offered price must leave at least KES ${minimumMargin} below the current customer price of KES ${Number(product.price).toLocaleString('en-KE')}.` }, { status: 400 });
  }

  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif'
  };
  const photoPath = `${context.user.id}/stock-offers/${randomUUID()}.${extensionByType[photo.type]}`;
  const { error: uploadError } = await context.database.storage.from(storageBucket)
    .upload(photoPath, bytes, { contentType: photo.type, upsert: false });
  if (uploadError) {
    console.error('[MerchantStockOffers] Could not save offer photo:', uploadError);
    return NextResponse.json({ error: 'Could not upload the offer photo. Please try again.' }, { status: 503 });
  }

  const { data: offer, error: offerError } = await context.database.from('mm_merchant_stock_offers')
    .insert({
      merchant_id: context.merchantId,
      product_id: productId,
      submitted_by: context.user.id,
      photo_path: photoPath,
      offered_quantity: quantity,
      offered_merchant_price: Math.round(offeredPrice * 100) / 100
    })
    .select('id,product_id,offered_quantity,offered_merchant_price,status,created_at')
    .single();
  if (offerError || !offer) {
    const { error: cleanupError } = await context.database.storage.from(storageBucket).remove([photoPath]);
    if (cleanupError) console.error('[MerchantStockOffers] Could not remove photo for rejected offer:', cleanupError);
    console.error('[MerchantStockOffers] Could not create stock offer:', offerError);
    return NextResponse.json({ error: migrationResponse(offerError || {}) || 'Could not save your stock offer.' }, { status: 503 });
  }

  const { error: eventError } = await context.database.from('mm_merchant_stock_offer_events').insert({
    offer_id: offer.id,
    actor_user_id: context.user.id,
    actor_email: context.user.email?.trim().toLowerCase() || null,
    event_type: 'submitted',
    details: {
      product_id: productId,
      quantity,
      offered_merchant_price: Math.round(offeredPrice * 100) / 100
    }
  });
  if (eventError) {
    const { error: deleteError } = await context.database.from('mm_merchant_stock_offers').delete().eq('id', offer.id);
    if (deleteError) console.error('[MerchantStockOffers] Could not remove offer without its audit event:', deleteError);
    const { error: cleanupError } = await context.database.storage.from(storageBucket).remove([photoPath]);
    if (cleanupError) console.error('[MerchantStockOffers] Could not remove photo for rejected offer:', cleanupError);
    console.error('[MerchantStockOffers] Could not write submission audit event:', eventError);
    return NextResponse.json({ error: migrationResponse(eventError) || 'Could not record your offer for review.' }, { status: 503 });
  }

  return NextResponse.json({ offer }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return NextResponse.json({ error: 'Inventory review access required.' }, { status: 403 });
  }
  if (!session.email?.trim()) return NextResponse.json({ error: 'Sign in again to verify your admin identity.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid stock offer review.' }, { status: 400 });
  }
  const offerId = typeof body.offerId === 'string' ? body.offerId : '';
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(offerId)
    || !action || note.length > 1000 || (action === 'reject' && note.length < 5)) {
    return NextResponse.json({ error: 'Choose a valid review action. Rejections need a note of at least five characters.' }, { status: 400 });
  }

  const configuration = getMarketConfiguration();
  if (!configuration) return NextResponse.json({ error: 'Marketplace database access is not configured.' }, { status: 503 });
  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await database.rpc('mm_review_merchant_stock_offer', {
    p_offer_id: offerId,
    p_action: action,
    p_reviewer_email: session.email.trim().toLowerCase(),
    p_review_note: note || null
  });
  if (error) {
    const missingMigration = migrationResponse(error);
    if (!missingMigration) console.error('[MerchantStockOffers] Could not review stock offer:', error);
    const status = missingMigration ? 503
      : /already been reviewed/i.test(error.message) ? 409
        : /not found/i.test(error.message) ? 404 : 400;
    return NextResponse.json({
      error: missingMigration || (/already been reviewed|not found|must leave at least|no longer available|exceed the stock limit/i.test(error.message)
        ? error.message
        : 'Could not complete the stock offer review.')
    }, { status });
  }
  return NextResponse.json({ review: data }, { headers: { 'Cache-Control': 'no-store' } });
}
