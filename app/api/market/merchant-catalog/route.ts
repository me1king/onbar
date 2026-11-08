import { NextResponse } from 'next/server';
import { getMarketMerchantContext } from '@/lib/marketMerchantAuth.server';
import { isStorefrontProductVisible } from '@/lib/productVisibility';

export const dynamic = 'force-dynamic';

type CatalogProduct = {
  id: number;
  name: string;
  category: string | null;
  sub_category: string | null;
  price: number;
  image_url: string | null;
  stock: number | null;
  is_bite: boolean | null;
  is_snack: boolean | null;
  is_souvenir: boolean | null;
  is_available_now: boolean | null;
  hide_product: boolean | null;
  status: string | null;
};

function migrationError(error: { code?: string; message?: string }) {
  if (error.code === '42P01' || error.code === '42883' || /mm_merchant_catalog|mm_save_merchant_catalog_items/i.test(error.message || '')) {
    return 'Merchant catalog storage is not installed. Run supabase/MERCHANT_MASTER_CATALOG_MIGRATION.sql in Supabase.';
  }
  return null;
}

export async function GET(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  const [
    { data: products, error: productsError },
    { data: selections, error: selectionsError },
    { data: pricingPolicy, error: policyError }
  ] = await Promise.all([
    context.database.from('products')
      .select('id, name, category, sub_category, price, image_url, stock, is_bite, is_snack, is_souvenir, is_available_now, hide_product, status')
      .order('category')
      .order('name')
      .limit(1000),
    context.database.from('mm_merchant_catalog_items')
      .select('product_id, merchant_price, stock, is_listed')
      .eq('merchant_id', context.merchantId),
    context.database.from('mm_catalog_pricing_policy')
      .select('minimum_margin')
      .eq('id', true)
      .maybeSingle()
  ]);
  const failedQuery = productsError || selectionsError || policyError;
  if (failedQuery) {
    console.error('[MerchantCatalog] Could not load merchant master catalog:', failedQuery);
    return NextResponse.json({
      error: migrationError(failedQuery) || 'The merchant catalog could not be loaded.'
    }, { status: 503 });
  }

  const selectionByProduct = new Map((selections || []).map(selection => [
    Number(selection.product_id),
    selection
  ]));
  const items = ((products || []) as CatalogProduct[])
    .filter(product => isStorefrontProductVisible(product))
    .map(product => {
      const selection = selectionByProduct.get(Number(product.id));
      return {
        id: Number(product.id),
        name: product.name,
        category: product.category || 'General',
        sub_category: product.sub_category,
        price: Number(product.price),
        image_url: product.image_url || '',
        is_bite: Boolean(product.is_bite),
        is_snack: Boolean(product.is_snack),
        is_souvenir: Boolean(product.is_souvenir),
        merchant_price: Number(selection?.merchant_price || 0),
        stock: Number(selection?.stock || 0),
        is_listed: Boolean(selection?.is_listed)
      };
    });

  return NextResponse.json({
    items,
    minimumMargin: Number(pricingPolicy?.minimum_margin ?? 30)
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PUT(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;
  return NextResponse.json({
    error: 'Direct stock and payout-price updates are disabled. Submit a photo-backed stock offer for Market Operations to review.'
  }, { status: 410 });
}
