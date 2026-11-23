import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { normalizePublicImageUrl } from '@/lib/marketingImageUrl';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nonnegativeNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function nonnegativeInteger(value: unknown) {
  return Math.floor(nonnegativeNumber(value));
}

async function getAuthorizedAccess() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return { response: NextResponse.json({ error: 'Marketing permission is required.' }, { status: 403 }) };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Marketing database access is not configured on the server.' }, { status: 503 }) };
  }

  return { database, session };
}

export async function GET() {
  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  const [productsResult, segmentsResult, allAudienceResult] = await Promise.all([
    access.database.from('products')
      .select('id, name, image_url, price, stock, category, description')
      .eq('status', 'Live')
      .gt('stock', 0)
      .order('name'),
    access.database.from('audience_segments').select('id, name, rules').order('name'),
    access.database.rpc('count_matching_audience_members', {
      p_spend_min: 0,
      p_orders_min: 0,
      p_last_order_days: 0
    })
  ]);

  if (productsResult.error || segmentsResult.error) {
    const error = productsResult.error || segmentsResult.error;
    console.error('[CampaignSetup] Could not load products or audience segments:', error);
    return NextResponse.json({ error: 'Could not load campaign setup data. Check the marketing schema and server database configuration.' }, { status: 503 });
  }

  if (allAudienceResult.error) {
    console.error('[CampaignSetup] Consented audience estimate is unavailable:', allAudienceResult.error);
  }

  const segments = await Promise.all((segmentsResult.data || []).map(async segment => {
    const rules = asRecord(segment.rules) || {};
    const { data, error } = await access.database.rpc('count_matching_audience_members', {
      p_spend_min: nonnegativeNumber(rules.spend_min),
      p_orders_min: nonnegativeInteger(rules.orders_min),
      p_last_order_days: nonnegativeInteger(rules.last_order_days)
    });

    if (error) {
      console.error(`[CampaignSetup] Audience reach unavailable for ${segment.name}:`, error);
    }

    return {
      id: segment.id,
      name: segment.name,
      estimated_reach: error ? null : Number(data ?? 0)
    };
  }));

  return NextResponse.json({
    products: productsResult.data || [],
    segments: [
      {
        id: 'all',
        name: 'All opted-in members',
        estimated_reach: allAudienceResult.error ? null : Number(allAudienceResult.data ?? 0)
      },
      ...segments
    ]
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  let body: JsonRecord;
  try {
    const parsed: unknown = await request.json();
    const record = asRecord(parsed);
    if (!record) throw new Error('Request body must be an object.');
    body = record;
  } catch {
    return NextResponse.json({ error: 'Send valid campaign details.' }, { status: 400 });
  }

  const campaign = asRecord(body.campaign);
  const channels = asRecord(body.channels);
  const name = typeof campaign?.name === 'string' ? campaign.name.trim() : '';
  const type = typeof campaign?.type === 'string' ? campaign.type.trim() : '';
  const productId = Number(campaign?.product_id);
  const audienceId = typeof campaign?.audience_id === 'string' ? campaign.audience_id : '';
  const scheduledAtValue = typeof campaign?.scheduled_at === 'string' ? campaign.scheduled_at.trim() : '';
  const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : null;
  const imageUrlResult = normalizePublicImageUrl(campaign?.image_url);
  if (!imageUrlResult.valid) {
    return NextResponse.json({ error: imageUrlResult.error }, { status: 400 });
  }
  const instagram = asRecord(channels?.instagram);
  const whatsapp = asRecord(channels?.whatsapp);
  const email = asRecord(channels?.email);
  const instagramCaption = typeof instagram?.caption === 'string' ? instagram.caption.trim() : '';
  const whatsappBody = typeof whatsapp?.body === 'string' ? whatsapp.body.trim() : '';
  const emailSubject = typeof email?.subject === 'string' ? email.subject.trim() : '';
  const emailBody = typeof email?.body === 'string' ? email.body.trim() : '';

  if (
    name.length < 2 || name.length > 120 ||
    type.length < 2 || type.length > 80 ||
    !Number.isSafeInteger(productId) || productId <= 0 ||
    (audienceId !== 'all' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(audienceId)) ||
    (scheduledAt && !Number.isFinite(scheduledAt.getTime())) ||
    scheduledAtValue.length > 100 ||
    (typeof instagram?.active !== 'boolean') ||
    (typeof whatsapp?.active !== 'boolean') ||
    (typeof email?.active !== 'boolean') ||
    instagramCaption.length > 2200 ||
    whatsappBody.length > 4096 ||
    emailSubject.length > 200 ||
    emailBody.length > 5000 ||
    (!(instagram.active && instagramCaption) && !(whatsapp.active && whatsappBody) && !(email.active && emailBody))
  ) {
    return NextResponse.json({ error: 'Check the campaign name, product, audience, schedule, and active channel content.' }, { status: 400 });
  }

  const [{ data: product, error: productError }, audienceResult] = await Promise.all([
    access.database.from('products').select('id').eq('id', productId).eq('status', 'Live').gt('stock', 0).maybeSingle(),
    audienceId === 'all'
      ? Promise.resolve({ data: { id: 'all' }, error: null })
      : access.database.from('audience_segments').select('id').eq('id', audienceId).maybeSingle()
  ]);

  if (productError) {
    console.error('[CampaignSetup] Could not validate the selected product:', productError);
    return NextResponse.json({ error: 'Could not validate the selected product.' }, { status: 503 });
  }
  if (!product) return NextResponse.json({ error: 'The selected product is no longer available.' }, { status: 400 });
  if (audienceResult.error) {
    console.error('[CampaignSetup] Could not validate the selected audience:', audienceResult.error);
    return NextResponse.json({ error: 'Could not validate the selected audience.' }, { status: 503 });
  }
  if (!audienceResult.data) return NextResponse.json({ error: 'The selected audience no longer exists.' }, { status: 400 });

  const { data: savedCampaign, error: campaignError } = await access.database
    .from('marketing_campaigns')
    .insert({
      name,
      type,
      product_id: productId,
      status: 'Draft',
      scheduled_at: scheduledAt?.toISOString() || null,
      audience_segment_id: audienceId === 'all' ? null : audienceId
    })
    .select('id')
    .single();

  if (campaignError) {
    console.error('[CampaignSetup] Could not save the campaign draft:', campaignError);
    return NextResponse.json({ error: 'Could not save the campaign draft.' }, { status: 500 });
  }

  const channelRows = [
    {
      campaign_id: savedCampaign.id,
      channel: 'Instagram',
      content: { active: instagram.active, caption: instagramCaption, generated: instagram.generated === true, image_url: imageUrlResult.imageUrl },
      is_active: instagram.active
    },
    {
      campaign_id: savedCampaign.id,
      channel: 'WhatsApp',
      content: { active: whatsapp.active, body: whatsappBody, generated: whatsapp.generated === true, image_url: imageUrlResult.imageUrl },
      is_active: whatsapp.active
    },
    { campaign_id: savedCampaign.id, channel: 'Email', content: { active: email.active, subject: emailSubject, body: emailBody, image_url: imageUrlResult.imageUrl }, is_active: email.active }
  ];
  const { error: channelError } = await access.database.from('campaign_channels').insert(channelRows);
  if (channelError) {
    console.error('[CampaignSetup] Could not save campaign channels:', channelError);
    const { error: cleanupError } = await access.database.from('marketing_campaigns').delete().eq('id', savedCampaign.id);
    if (cleanupError) {
      console.error('[CampaignSetup] Could not roll back an incomplete campaign draft:', cleanupError);
      return NextResponse.json({ error: 'Campaign channels could not be saved and the incomplete draft needs admin review.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Campaign channels could not be saved; the incomplete draft was rolled back.' }, { status: 500 });
  }

  return NextResponse.json({ campaignId: savedCampaign.id }, { status: 201 });
}
