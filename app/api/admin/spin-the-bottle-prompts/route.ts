import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { parseSpinBottlePrompts, DEFAULT_SPIN_BOTTLE_PROMPTS } from '@/lib/spinBottlePrompts';

export const dynamic = 'force-dynamic';
const SETTING_KEY = 'spin_the_bottle_config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function authorize() {
  const session = await getAdminSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  }
  if (!hasAdminPermission(session, 'can_manage_marketing')
    && !hasAdminPermission(session, 'can_manage_settings')) {
    return { response: NextResponse.json({ error: 'Spin game prompt management access is required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return { response: NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 }) };
  }
  return { database };
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const { data, error } = await access.database.from('settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();
  if (error) {
    console.error('[SpinBottlePrompts] Could not load the prompt settings:', error);
    return NextResponse.json({ error: 'Spin the Bottle prompts could not be loaded.' }, { status: 503 });
  }

  const value: unknown = data?.value;
  const storedPrompts = isRecord(value) ? value.prompts : undefined;
  const parsed = storedPrompts === undefined
    ? { ok: true as const, prompts: DEFAULT_SPIN_BOTTLE_PROMPTS }
    : parseSpinBottlePrompts(storedPrompts);
  if (!parsed.ok) {
    console.error('[SpinBottlePrompts] Stored prompt settings are invalid:', parsed.error);
    return NextResponse.json({ error: 'Saved prompts are invalid. Restore or repair the prompt deck before editing.' }, { status: 503 });
  }

  return NextResponse.json({ prompts: parsed.prompts }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { prompts?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 150_000) {
      return NextResponse.json({ error: 'Prompt data is too large.' }, { status: 413 });
    }
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid prompt data is required.' }, { status: 400 });
  }

  const parsed = parseSpinBottlePrompts(body.prompts);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: existing, error: readError } = await access.database.from('settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();
  if (readError) {
    console.error('[SpinBottlePrompts] Could not read existing game settings:', readError);
    return NextResponse.json({ error: 'Existing game settings could not be read; prompts were not changed.' }, { status: 503 });
  }

  const currentValue: unknown = existing?.value;
  const value = isRecord(currentValue) ? currentValue : {};
  const { error } = await access.database.from('settings').upsert({
    key: SETTING_KEY,
    value: {
      ...value,
      groupVoteEnabled: value.groupVoteEnabled === true,
      prompts: parsed.prompts
    },
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[SpinBottlePrompts] Could not save the prompt deck:', error);
    return NextResponse.json({ error: 'Prompt changes could not be saved.' }, { status: 503 });
  }

  return NextResponse.json({ saved: true, prompts: parsed.prompts });
}
