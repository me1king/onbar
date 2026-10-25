import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

async function getAuthorizedDatabase() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!['admin', 'owner'].includes(session.role.toLowerCase())
    && !hasAdminPermission(session, 'can_manage_inventory')) {
    return { response: NextResponse.json({ error: 'Marketplace campaign access required.' }, { status: 403 }) };
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
    .from('mm_market_campaigns')
    .select('title, message, published, updated_at, storefront_eyebrow, storefront_title, storefront_subtitle, collection_eyebrow, collection_title, search_placeholder, categories_label, countdown_label, countdown_ends_at, show_preview_designs')
    .eq('campaign_key', 'market')
    .maybeSingle();
  if (error) {
    console.error('[MarketAdmin] Could not load campaign settings:', error);
    if (['42703', 'PGRST204'].includes(error.code || '')) {
      return NextResponse.json({ error: 'Apply MIDNIGHT_MARKET_STOREFRONT_CONTROLS_MIGRATION.sql before using the storefront editor.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not load Market campaign settings.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Market campaign settings are missing. Apply the Midnight Market migration.' }, { status: 503 });

  return NextResponse.json({
    campaign: {
      title: data.title,
      message: data.message,
      published: data.published,
      storefrontEyebrow: data.storefront_eyebrow,
      storefrontTitle: data.storefront_title,
      storefrontSubtitle: data.storefront_subtitle,
      collectionEyebrow: data.collection_eyebrow,
      collectionTitle: data.collection_title,
      searchPlaceholder: data.search_placeholder,
      categoriesLabel: data.categories_label,
      countdownLabel: data.countdown_label,
      countdownEndsAt: data.countdown_ends_at ? new Date(data.countdown_ends_at).toISOString() : null,
      showPreviewDesigns: data.show_preview_designs
    }
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedDatabase();
  if ('response' in access) return access.response;
  if (!access.session.email?.trim()) {
    return NextResponse.json({ error: 'Your admin identity is unavailable; sign in again before publishing.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send valid Market campaign settings.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const published = body.published;
  const storefrontEyebrow = typeof body.storefrontEyebrow === 'string' ? body.storefrontEyebrow.trim() : '';
  const storefrontTitle = typeof body.storefrontTitle === 'string' ? body.storefrontTitle.trim() : '';
  const storefrontSubtitle = typeof body.storefrontSubtitle === 'string' ? body.storefrontSubtitle.trim() : '';
  const collectionEyebrow = typeof body.collectionEyebrow === 'string' ? body.collectionEyebrow.trim() : '';
  const collectionTitle = typeof body.collectionTitle === 'string' ? body.collectionTitle.trim() : '';
  const searchPlaceholder = typeof body.searchPlaceholder === 'string' ? body.searchPlaceholder.trim() : '';
  const categoriesLabel = typeof body.categoriesLabel === 'string' ? body.categoriesLabel.trim() : '';
  const countdownLabel = typeof body.countdownLabel === 'string' ? body.countdownLabel.trim() : '';
  const countdownEndsAt = body.countdownEndsAt === null || body.countdownEndsAt === ''
    ? null
    : typeof body.countdownEndsAt === 'string' ? body.countdownEndsAt : undefined;
  const showPreviewDesigns = body.showPreviewDesigns;
  const textFields = [
    [title, 2, 120], [message, 2, 500], [storefrontEyebrow, 2, 80],
    [storefrontTitle, 2, 120], [storefrontSubtitle, 2, 500],
    [collectionEyebrow, 2, 60], [collectionTitle, 2, 100],
    [searchPlaceholder, 2, 100], [categoriesLabel, 2, 60], [countdownLabel, 2, 60]
  ] as const;
  const invalidText = textFields.some(([value, minimum, maximum]) => value.length < minimum || value.length > maximum);
  const parsedCountdown = countdownEndsAt === null
    ? null
    : countdownEndsAt === undefined ? undefined : new Date(countdownEndsAt);
  if (invalidText || typeof published !== 'boolean' || typeof showPreviewDesigns !== 'boolean'
    || parsedCountdown === undefined || (parsedCountdown && !Number.isFinite(parsedCountdown.getTime()))) {
    return NextResponse.json({ error: 'Complete each storefront field within its character limit and provide a valid countdown date.' }, { status: 400 });
  }

  const { data, error } = await access.database.rpc('mm_set_market_storefront', {
    p_title: title,
    p_message: message,
    p_published: published,
    p_storefront_eyebrow: storefrontEyebrow,
    p_storefront_title: storefrontTitle,
    p_storefront_subtitle: storefrontSubtitle,
    p_collection_eyebrow: collectionEyebrow,
    p_collection_title: collectionTitle,
    p_search_placeholder: searchPlaceholder,
    p_categories_label: categoriesLabel,
    p_countdown_label: countdownLabel,
    p_countdown_ends_at: parsedCountdown?.toISOString() ?? null,
    p_show_preview_designs: showPreviewDesigns,
    p_actor_email: access.session.email.trim().toLowerCase()
  });
  if (error) {
    console.error('[MarketAdmin] Could not update campaign settings:', error);
    if (['42883', 'PGRST202'].includes(error.code || '') || error.message.includes('mm_set_market_storefront')) {
      return NextResponse.json({ error: 'Apply MIDNIGHT_MARKET_STOREFRONT_CONTROLS_MIGRATION.sql before saving storefront settings.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the Market campaign.' }, { status: 503 });
  }

  return NextResponse.json({ campaign: data }, { headers: { 'Cache-Control': 'no-store' } });
}
