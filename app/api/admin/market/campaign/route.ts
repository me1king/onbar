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
    .select('title, message, published, updated_at')
    .eq('campaign_key', 'market')
    .maybeSingle();
  if (error) {
    console.error('[MarketAdmin] Could not load campaign settings:', error);
    return NextResponse.json({ error: 'Could not load Market campaign settings.' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Market campaign settings are missing. Apply the Midnight Market migration.' }, { status: 503 });

  return NextResponse.json({ campaign: data }, { headers: { 'Cache-Control': 'private, no-store' } });
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
  if (title.length < 2 || title.length > 120 || message.length < 2 || message.length > 500 || typeof published !== 'boolean') {
    return NextResponse.json({ error: 'Enter a campaign title and message, then choose whether to publish.' }, { status: 400 });
  }

  const { data, error } = await access.database.rpc('mm_set_market_campaign', {
    p_title: title,
    p_message: message,
    p_published: published,
    p_actor_email: access.session.email.trim().toLowerCase()
  });
  if (error) {
    console.error('[MarketAdmin] Could not update campaign settings:', error);
    return NextResponse.json({ error: 'Could not update the Market campaign.' }, { status: 503 });
  }

  return NextResponse.json({ campaign: data }, { headers: { 'Cache-Control': 'no-store' } });
}
