import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { verifySessionCookie } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const platforms = new Set([
  'instagram',
  'facebook',
  'whatsapp',
  'tiktok',
  'beverage',
  'food',
  'souvenir'
]);

async function getAuthorizedDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  if (!session) {
    return {
      database: null,
      response: NextResponse.json({ error: 'Your admin session has expired. Sign in again.' }, { status: 401 })
    };
  }

  const canManageCalendar = session.role === 'owner'
    || session.role === 'admin'
    || session.permissions.can_manage_marketing === true;
  if (!canManageCalendar) {
    return {
      database: null,
      response: NextResponse.json({ error: 'You do not have permission to manage the growth calendar.' }, { status: 403 })
    };
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return {
      database: null,
      response: NextResponse.json({ error: 'The protected calendar service is not configured.' }, { status: 503 })
    };
  }
  return { database, response: null };
}

function databaseErrorResponse(error: { code?: string; message?: string }) {
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '')) {
    return NextResponse.json({
      error: 'The publishing calendar schema is missing. Apply supabase/CONTENT_CALENDAR_QUEUE_MIGRATION.sql, then reload this page.'
    }, { status: 503 });
  }
  console.error('[GrowthCalendar] Database request failed:', error);
  return NextResponse.json({ error: 'The publishing queue could not be loaded or saved. Try again shortly.' }, { status: 503 });
}

export async function GET() {
  const { database, response } = await getAuthorizedDatabase();
  if (!database) {
    return response || NextResponse.json({ error: 'The protected calendar service is not configured.' }, { status: 503 });
  }

  const { data: queueRows, error: queueError } = await database
    .from('publishing_queue')
    .select('id,master_id,title,platform,status,scheduled_at,image_url')
    .order('scheduled_at', { ascending: true });

  if (queueError) return databaseErrorResponse(queueError);

  const rows = queueRows || [];
  const masterIds = [...new Set(rows
    .map(row => row.master_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const contentById = new Map<string, { title: string | null; base_description: string | null }>();

  if (masterIds.length > 0) {
    const { data: contentRows, error: contentError } = await database
      .from('content_master')
      .select('id,title,base_description')
      .in('id', masterIds);
    if (contentError) return databaseErrorResponse(contentError);
    for (const content of contentRows || []) contentById.set(String(content.id), content);
  }

  const missions = rows
    .filter(row => row.scheduled_at && Number.isFinite(new Date(row.scheduled_at).getTime()))
    .map(row => ({
      id: String(row.id),
      title: contentById.get(String(row.master_id))?.title || row.title || 'Untitled schedule',
      scheduledAt: new Date(row.scheduled_at).toISOString(),
      type: String(row.platform || 'other').toLowerCase(),
      status: row.status || 'SCHEDULED',
      caption: contentById.get(String(row.master_id))?.base_description || null,
      image_url: row.image_url || null
    }));

  return NextResponse.json({ missions }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const { database, response } = await getAuthorizedDatabase();
  if (!database) {
    return response || NextResponse.json({ error: 'The protected calendar service is not configured.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid mission schedule is required.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.toLowerCase() : '';
  const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null;
  if (!title || title.length > 160 || caption.length > 5000 || !platforms.has(platform)) {
    return NextResponse.json({ error: 'Enter a title, supported mission type, and caption under 5,000 characters.' }, { status: 400 });
  }
  if (!scheduledAt || !Number.isFinite(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Select a valid date and time.' }, { status: 400 });
  }

  const { data: master, error: masterError } = await database
    .from('content_master')
    .insert({
      title,
      base_description: caption || null,
      status: 'SCHEDULED'
    })
    .select('id')
    .single();
  if (masterError) return databaseErrorResponse(masterError);

  const { data: queueItem, error: queueError } = await database
    .from('publishing_queue')
    .insert({
      master_id: master.id,
      title,
      platform: platform.toUpperCase(),
      scheduled_at: scheduledAt.toISOString(),
      status: 'SCHEDULED'
    })
    .select('id')
    .single();

  if (queueError) {
    const { error: cleanupError } = await database.from('content_master').delete().eq('id', master.id);
    if (cleanupError) console.error('[GrowthCalendar] Could not remove incomplete content draft:', cleanupError);
    return databaseErrorResponse(queueError);
  }

  return NextResponse.json({ id: String(queueItem.id) }, { status: 201 });
}
