import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { normalizePublicImageUrl } from '@/lib/marketingImageUrl';

export const dynamic = 'force-dynamic';

const PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'TIKTOK', 'BEVERAGE', 'FOOD', 'SOUVENIR']);

async function getAuthorizedAccess() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return { response: NextResponse.json({ error: 'Marketing permission is required.' }, { status: 403 }) };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Publishing queue database access is not configured on the server.' }, { status: 503 }) };
  }

  return { database, session };
}

export async function GET() {
  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  const { data: queueRows, error: queueError } = await access.database
    .from('publishing_queue')
    .select('id, master_id, title, platform, scheduled_at, status, image_url')
    .order('scheduled_at', { ascending: true })
    .limit(2000);

  if (queueError) {
    console.error('[GrowthCalendar] Could not load the publishing queue:', queueError);
    return NextResponse.json({ error: 'Could not load the publishing queue. Check that the content calendar schema is installed.' }, { status: 503 });
  }

  const rows = queueRows || [];
  const masterIds = [...new Set(rows
    .map(row => typeof row.master_id === 'string' ? row.master_id : String(row.master_id || ''))
    .filter(Boolean))];
  const contentById = new Map<string, { title: string | null; base_description: string | null }>();

  if (masterIds.length) {
    const { data: contentRows, error: contentError } = await access.database
      .from('content_master')
      .select('id, title, base_description')
      .in('id', masterIds);
    if (contentError) {
      console.error('[GrowthCalendar] Could not load queued content:', contentError);
      return NextResponse.json({ error: 'Could not load content details. Check that the content calendar schema is installed.' }, { status: 503 });
    }
    for (const content of contentRows || []) contentById.set(String(content.id), content);
  }

  const missions = rows
    .filter(row => row.scheduled_at && Number.isFinite(new Date(row.scheduled_at).getTime()))
    .map(row => {
      const content = contentById.get(String(row.master_id));
      return {
        id: String(row.id),
        title: content?.title || row.title || 'Untitled schedule',
        scheduledAt: new Date(row.scheduled_at).toISOString(),
        type: String(row.platform || 'other').toLowerCase(),
        status: String(row.status || 'SCHEDULED'),
        caption: content?.base_description || undefined,
        image_url: row.image_url || undefined
      };
    });

  return NextResponse.json({ missions }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const access = await getAuthorizedAccess();
  if ('response' in access) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body.');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send valid content schedule details.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim().toUpperCase() : '';
  const scheduledAtValue = typeof body.scheduledAt === 'string' ? body.scheduledAt : '';
  const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : null;
  const imageUrlResult = normalizePublicImageUrl(body.imageUrl);
  if (!imageUrlResult.valid) {
    return NextResponse.json({ error: imageUrlResult.error }, { status: 400 });
  }

  if (
    title.length < 2 || title.length > 200 ||
    caption.length > 5000 ||
    !PLATFORMS.has(platform) ||
    !scheduledAt ||
    !Number.isFinite(scheduledAt.getTime())
  ) {
    return NextResponse.json({ error: 'Enter a title, valid platform, schedule time, and caption under 5,000 characters.' }, { status: 400 });
  }

  const { data: master, error: masterError } = await access.database
    .from('content_master')
    .insert({
      title,
      base_description: caption || null,
      status: 'SCHEDULED'
    })
    .select('id')
    .single();

  if (masterError) {
    console.error('[GrowthCalendar] Could not save content details:', masterError);
    return NextResponse.json({ error: 'Could not save this content record.' }, { status: 500 });
  }

  const { data: queueRecord, error: queueError } = await access.database
    .from('publishing_queue')
    .insert({
      master_id: master.id,
      title,
      platform,
      scheduled_at: scheduledAt.toISOString(),
      image_url: imageUrlResult.imageUrl,
      status: 'SCHEDULED'
    })
    .select('id')
    .single();

  if (queueError) {
    console.error('[GrowthCalendar] Could not create a publishing queue record:', queueError);
    const { error: cleanupError } = await access.database.from('content_master').delete().eq('id', master.id);
    if (cleanupError) {
      console.error('[GrowthCalendar] Could not remove incomplete content details:', cleanupError);
      return NextResponse.json({ error: 'The queue rejected this schedule and its incomplete content record needs admin review.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'The publishing queue rejected this schedule; the incomplete content record was removed.' }, { status: 500 });
  }

  return NextResponse.json({ id: String(queueRecord.id) }, { status: 201 });
}
