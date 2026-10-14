import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const allowedSettings = new Set([
  'contact',
  'branding',
  'homepage',
  'promotions',
  'theme_config',
  'seo_config',
  'social_links',
  'store_info',
  'shipping',
  'logistics',
  'catalog',
  'onboarding_config',
  'features',
  'ai_config'
]);

type SettingUpdate = {
  key: string;
  value: Record<string, unknown>;
  is_published?: boolean;
};

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

function isSettingUpdate(value: unknown): value is SettingUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const update = value as Partial<SettingUpdate>;
  if (
    typeof update.key !== 'string'
    || !allowedSettings.has(update.key)
    || typeof update.value !== 'object'
    || update.value === null
    || Array.isArray(update.value)
    || (update.is_published !== undefined && typeof update.is_published !== 'boolean')
  ) return false;

  if (update.key === 'theme_config') {
    const theme = update.value as Record<string, unknown>;
    return isHexColor(theme.primary)
      && isHexColor(theme.secondary)
      && isHexColor(theme.accent)
      && typeof theme.custom_css === 'string'
      && theme.custom_css.length <= 20000;
  }

  return true;
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

  let body: { settings?: unknown };
  try {
    body = await request.json() as { settings?: unknown };
  } catch {
    return NextResponse.json({ error: 'Valid settings data is required.' }, { status: 400 });
  }

  if (
    !Array.isArray(body.settings)
    || body.settings.length === 0
    || body.settings.length > allowedSettings.size
    || !body.settings.every(isSettingUpdate)
    || new Set(body.settings.map((setting: SettingUpdate) => setting.key)).size !== body.settings.length
    || JSON.stringify(body).length > 500000
  ) {
    return NextResponse.json({ error: 'Settings data is invalid or too large.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 500 });
  }

  const updatedAt = new Date().toISOString();
  const { error } = await database.from('settings').upsert(
    body.settings.map((setting: SettingUpdate) => ({
      key: setting.key,
      value: setting.value,
      is_published: setting.is_published ?? true,
      updated_at: updatedAt
    })),
    { onConflict: 'key' }
  );

  if (error) {
    console.error('[AdminSettings] Could not save settings:', error);
    if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
      return NextResponse.json({
        error: "Supabase rejected the server settings write under row-level security. In Render, set SUPABASE_SERVICE_ROLE_KEY to this project's service_role secret (not its anon/publishable key), then redeploy."
      }, { status: 503 });
    }
    return NextResponse.json({ error: `Settings could not be saved: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ saved: true, keys: body.settings.map((setting: SettingUpdate) => setting.key) });
}
