import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createDefaultGameBreakAdConfig, GAME_BREAK_AD_SETTING_KEY, parseGameBreakAdConfig } from '@/lib/gameBreakAd';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { isStorefrontProductVisible } from '@/lib/productVisibility';
import { isClearlyNonAlcoholicProduct } from '@/lib/nonAlcoholicProducts';

export const dynamic = 'force-dynamic';

async function getAccess() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return { response: NextResponse.json({ error: 'Marketing permission is required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Game ad settings database access is not configured.' }, { status: 503 }) };
  }
  return { database };
}

export async function GET() {
  const access = await getAccess();
  if ('response' in access) return access.response;

  const { data, error } = await access.database.from('settings')
    .select('value, is_published')
    .eq('key', GAME_BREAK_AD_SETTING_KEY)
    .maybeSingle();
  if (error) {
    console.error('[GameBreakAd] Could not load ad settings:', error);
    return NextResponse.json({ error: 'Could not load game break ad settings.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ config: createDefaultGameBreakAdConfig() });

  const config = parseGameBreakAdConfig(data.value);
  if (!config) {
    console.error('[GameBreakAd] Saved ad settings are invalid.');
    return NextResponse.json({ error: 'Saved game break ad settings are invalid; contact an administrator.' }, { status: 500 });
  }
  return NextResponse.json({ config: { ...config, enabled: config.enabled && data.is_published === true } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }
  const access = await getAccess();
  if ('response' in access) return access.response;

  let body: { config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send valid game break ad settings.' }, { status: 400 });
  }

  const config = parseGameBreakAdConfig(body.config);
  if (!config) {
    return NextResponse.json({ error: 'Check the image URL, ad copy, button label, and game placements.' }, { status: 400 });
  }
  if (config.enabled && (
    config.productId === null
    || !config.placements['do-or-drink'] && !config.placements['hot-seat']
  )) {
    return NextResponse.json({ error: 'Choose an in-stock alcohol-free product and at least one game before enabling the ad.' }, { status: 400 });
  }

  if (config.enabled && config.productId !== null) {
    const { data: product, error } = await access.database.from('products')
      .select('id, name, price, image_url, category, sub_category, brand, stock, status, hide_product, is_available_now')
      .eq('id', config.productId)
      .eq('status', 'Live')
      .gt('stock', 0)
      .maybeSingle();
    if (error) {
      console.error('[GameBreakAd] Could not validate the selected product:', error);
      return NextResponse.json({ error: 'Could not validate the selected drink.' }, { status: 503 });
    }
    if (
      !product
      || !isStorefrontProductVisible(product)
      || product.status !== 'Live'
      || Number(product.stock) <= 0
      || !isClearlyNonAlcoholicProduct(product)
    ) {
      return NextResponse.json({ error: 'The selected drink is no longer available as an alcohol-free game ad.' }, { status: 400 });
    }
  }

  const { error } = await access.database.from('settings').upsert({
    key: GAME_BREAK_AD_SETTING_KEY,
    value: config,
    is_published: config.enabled,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[GameBreakAd] Could not save ad settings:', error);
    return NextResponse.json({ error: 'Could not save game break ad settings.' }, { status: 500 });
  }

  return NextResponse.json({ saved: true, config });
}
