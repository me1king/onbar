import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { defaultTicketTheme, isTicketThemeId } from '@/lib/ticketing/theme';

export const dynamic = 'force-dynamic';

async function readPublishedTheme() {
  const database = createServerSupabaseClient();
  if (!database) {
    return { theme: null, response: NextResponse.json({ error: 'Ticketing theme storage is not configured.' }, { status: 503 }) };
  }

  const { data, error } = await database
    .from('settings')
    .select('value')
    .eq('key', 'ticketing_theme')
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('[TicketingTheme] Could not load published theme:', error);
    return { theme: null, response: NextResponse.json({ error: 'The published ticketing theme could not be loaded.' }, { status: 503 }) };
  }

  const theme = data?.value && typeof data.value === 'object' && 'theme' in data.value
    ? data.value.theme
    : null;
  return { theme: isTicketThemeId(theme) ? theme : defaultTicketTheme, response: null };
}

export async function GET() {
  const result = await readPublishedTheme();
  if (result.response) return result.response;
  return NextResponse.json({ theme: result.theme }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Ticketing theme management is restricted to platform admins.' }, { status: 403 });
  }

  let body: { theme?: unknown };
  try {
    body = await request.json() as { theme?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid ticketing theme is required.' }, { status: 400 });
  }

  if (!isTicketThemeId(body.theme)) {
    return NextResponse.json({ error: 'Choose a supported ticketing color mode.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Ticketing theme storage is not configured.' }, { status: 503 });
  }

  const { error } = await database.from('settings').upsert({
    key: 'ticketing_theme',
    value: { theme: body.theme },
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });

  if (error) {
    console.error('[TicketingTheme] Could not publish theme:', error);
    return NextResponse.json({ error: 'The customer ticketing theme could not be saved.' }, { status: 503 });
  }

  return NextResponse.json({ saved: true, theme: body.theme });
}
