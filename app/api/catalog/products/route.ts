import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

export const dynamic = 'force-dynamic';

const publicProductColumns = 'id,name,price,old_price,description,short_description,image_url,images,sizes,size_label,category,sub_category,brand,stock,variant_stock,variant_prices,status,hide_product,is_available_now,is_featured,is_bite,is_snack,is_souvenir,material,finish,capacity_ml,capacity_oz,weight_grams,story,drink_pairings,created_at,pairing_suggestions,bought_together_ids,engraving_enabled,engraving_fee,gift_packaging_fee';
const legacyPublicProductColumns = 'id,name,price,old_price,description,short_description,image_url,images,sizes,size_label,category,sub_category,brand,stock,variant_stock,variant_prices,status,hide_product,is_available_now,is_featured,is_bite,is_snack,is_souvenir,material,finish,capacity_oz,weight_grams,story,drink_pairings,created_at,pairing_suggestions,bought_together_ids';

type PublicCatalogProduct = {
  id: number;
  name: string;
  price: number | string;
  old_price: number | string | null;
  stock: number | null;
  image_url: string | null;
  category: string | null;
  is_souvenir: boolean | null;
  engraving_enabled?: boolean | null;
  engraving_fee?: number | string | null;
  gift_packaging_fee?: number | string | null;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'The product catalog is not configured.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const category = url.searchParams.get('category')?.trim().slice(0, 60);
  const inStockOnly = url.searchParams.get('in_stock') === 'true';
  const requestedLimit = Number(url.searchParams.get('limit') || 200);
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 200;

  let query = database.from('products')
    .select(publicProductColumns)
    .or('hide_product.is.null,hide_product.eq.false')
    .or('is_available_now.is.null,is_available_now.eq.true')
    .or('status.is.null,status.not.in.(draft,hidden,inactive,archived,deleted)')
    .order('created_at', { ascending: false })
    .limit(limit)
    .abortSignal(AbortSignal.timeout(8_000));
  if (category) query = query.ilike('category', `%${category}%`);
  if (inStockOnly) query = query.gt('stock', 0);

  let { data, error } = await query.returns<PublicCatalogProduct[]>();
  const missingOptionalColumns = Boolean(error
    && ['42703', 'PGRST204'].includes(error.code || '')
    && /capacity_ml|engraving_enabled|engraving_fee|gift_packaging_fee/i.test(error.message));
  if (missingOptionalColumns) {
    let legacyQuery = database.from('products')
      .select(legacyPublicProductColumns)
      .or('hide_product.is.null,hide_product.eq.false')
      .or('is_available_now.is.null,is_available_now.eq.true')
      .or('status.is.null,status.not.in.(draft,hidden,inactive,archived,deleted)')
      .order('created_at', { ascending: false })
      .limit(limit)
      .abortSignal(AbortSignal.timeout(8_000));
    if (category) legacyQuery = legacyQuery.ilike('category', `%${category}%`);
    if (inStockOnly) legacyQuery = legacyQuery.gt('stock', 0);
    ({ data, error } = await legacyQuery.returns<PublicCatalogProduct[]>());
    if (!error) {
      console.error('[PublicCatalog] Optional product columns are not installed; catalog is serving legacy product data.');
    }
  }
  if (error) {
    console.error('[PublicCatalog] Could not load the product catalog:', error.message);
    return NextResponse.json({ error: 'The product catalog could not be loaded. Please try again.' }, { status: 503 });
  }

  const products = (data || [])
    .filter(isStorefrontProductVisible)
    .filter(product => !inStockOnly || Number(product.stock || 0) > 0)
    .map(product => ({
      ...product,
      capacity_ml: Number(product.capacity_ml || (Number(product.capacity_oz || 0) * 29.5735).toFixed(2)) || null,
      price: Number(product.price),
      stock: Number(product.stock || 0),
      image_url: product.image_url || '',
      engraving_enabled: product.engraving_enabled === true,
      engraving_fee: Number(product.engraving_fee || 0),
      gift_packaging_fee: Number(product.gift_packaging_fee || 0)
    }));

  return NextResponse.json({ products }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
