import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { createDefaultGameBreakAdConfig, GAME_BREAK_AD_SETTING_KEY, parseGameBreakAdConfig } from '@/lib/gameBreakAd';
import { isClearlyNonAlcoholicProduct } from '@/lib/nonAlcoholicProducts';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };

function toBreakCard(product: {
  id: number;
  name: string;
  price: number;
  image_url: string | null;
}, config: ReturnType<typeof parseGameBreakAdConfig>, isSponsored: boolean) {
  if (!config) return null;
  return {
    productId: product.id,
    productName: product.name,
    price: config.showPrice ? product.price : null,
    imageUrl: config.showImage ? (isSponsored ? config.imageUrl || product.image_url || null : product.image_url || null) : null,
    headline: isSponsored ? config.headline : 'Alcohol-free catalog suggestion',
    message: isSponsored ? config.message : 'An optional drink idea. Water comes first.',
    showImage: config.showImage,
    showProductName: config.showProductName,
    ctaLabel: isSponsored ? config.ctaLabel : 'View drink'
  };
}

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get('game');
  if (game !== 'do-or-drink' && game !== 'hot-seat') {
    return NextResponse.json({ error: 'Choose a supported game placement.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Game break ads are not configured.' }, { status: 503 });
  }

  const { data: setting, error: settingError } = await database.from('settings')
    .select('value, is_published')
    .eq('key', GAME_BREAK_AD_SETTING_KEY)
    .maybeSingle();
  if (settingError) {
    console.error('[GameBreakAd] Could not load published ad settings:', settingError);
    return NextResponse.json({ error: 'Game break ad settings could not be loaded.' }, { status: 503 });
  }
  const config = setting ? parseGameBreakAdConfig(setting.value) : createDefaultGameBreakAdConfig();
  if (!config) {
    console.error('[GameBreakAd] Published ad settings are invalid.');
    return NextResponse.json({ error: 'Published game break ad settings are invalid.' }, { status: 503 });
  }

  if (setting?.is_published === true && config.enabled && config.placements[game] && config.productId !== null) {
    const { data: product, error: productError } = await database.from('products')
      .select('id, name, price, image_url, category, sub_category, brand, stock, status, hide_product, is_available_now')
      .eq('id', config.productId)
      .eq('status', 'Live')
      .gt('stock', 0)
      .maybeSingle();
    if (productError) {
      console.error('[GameBreakAd] Could not load the selected product:', productError);
      return NextResponse.json({ error: 'The selected game drink could not be loaded.' }, { status: 503 });
    }
    if (
      product
      && isStorefrontProductVisible(product)
      && product.status === 'Live'
      && Number(product.stock) > 0
      && isClearlyNonAlcoholicProduct(product)
    ) {
      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0) {
        console.error('[GameBreakAd] Selected product has an invalid price.');
        return NextResponse.json({ error: 'The selected game drink has an invalid price.' }, { status: 503 });
      }
      return NextResponse.json({
        ad: toBreakCard({ ...product, price }, config, true),
        suggestion: null
      }, { headers: noStore });
    }
  }

  if (!config.showCatalogSuggestion) {
    return NextResponse.json({ ad: null, suggestion: null }, { headers: noStore });
  }

  const { data: products, error: productsError } = await database.from('products')
    .select('id, name, price, image_url, category, sub_category, brand, stock, status, hide_product, is_available_now')
    .eq('status', 'Live')
    .gt('stock', 0)
    .order('created_at', { ascending: false })
    .limit(200);
  if (productsError) {
    console.error('[GameBreakAd] Could not load catalog suggestions:', productsError);
    return NextResponse.json({ error: 'Alcohol-free drink suggestions could not be loaded.' }, { status: 503 });
  }
  const eligibleProducts = (products || []).filter(product =>
    isStorefrontProductVisible(product)
    && isClearlyNonAlcoholicProduct(product)
    && Number.isFinite(Number(product.price))
    && Number(product.price) >= 0
  );
  const product = eligibleProducts.length
    ? eligibleProducts[Math.floor(Math.random() * eligibleProducts.length)]
    : null;
  return NextResponse.json({
    ad: null,
    suggestion: product ? toBreakCard({ ...product, price: Number(product.price) }, config, false) : null
  }, { headers: noStore });
}
