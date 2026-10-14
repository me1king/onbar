import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

type ThemeConfig = {
  primary: string;
  secondary: string;
  accent: string;
  custom_css: string;
};

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  }
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Website settings management access is required.' }, { status: 403 });
  }

  let body: { theme?: Partial<ThemeConfig>; publish?: unknown };
  try {
    body = await request.json() as { theme?: Partial<ThemeConfig>; publish?: unknown };
  } catch {
    return NextResponse.json({ error: 'A valid theme configuration is required.' }, { status: 400 });
  }

  const theme = body.theme;
  if (
    !theme
    || !isHexColor(theme.primary)
    || !isHexColor(theme.secondary)
    || !isHexColor(theme.accent)
    || typeof theme.custom_css !== 'string'
    || theme.custom_css.length > 20000
    || (body.publish !== undefined && typeof body.publish !== 'boolean')
  ) {
    return NextResponse.json({ error: 'Theme colors or custom CSS are invalid.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 500 });
  }

  const { error } = await database.from('settings').upsert({
    key: 'theme_config',
    value: theme,
    is_published: body.publish ?? true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });

  if (error) {
    console.error('[AdminThemeSettings] Could not save theme configuration:', error);
    return NextResponse.json({ error: `Theme settings could not be saved: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
