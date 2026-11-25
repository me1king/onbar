import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { DEFAULT_SPIN_BOTTLE_PROMPTS, parseSpinBottlePrompts } from '@/lib/spinBottlePrompts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({
      groupVoteEnabled: false,
      prompts: DEFAULT_SPIN_BOTTLE_PROMPTS
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await database
    .from('settings')
    .select('value')
    .eq('key', 'spin_the_bottle_config')
    .eq('is_published', true)
    .maybeSingle();
  if (error) {
    console.error('[SpinBottleConfig] Could not load published game settings:', error);
    return NextResponse.json({ error: 'Game settings could not be loaded.' }, { status: 503 });
  }

  const value = data?.value;
  if (value !== undefined && value !== null
    && (typeof value !== 'object' || Array.isArray(value))) {
    console.error('[SpinBottleConfig] Published group-vote configuration is invalid.');
    return NextResponse.json({ error: 'Published game settings are invalid.' }, { status: 503 });
  }

  const config = value as { groupVoteEnabled?: unknown; prompts?: unknown } | null | undefined;
  if (config?.groupVoteEnabled !== undefined && typeof config.groupVoteEnabled !== 'boolean') {
    console.error('[SpinBottleConfig] Published group-vote configuration is invalid.');
    return NextResponse.json({ error: 'Published game settings are invalid.' }, { status: 503 });
  }
  const parsedPrompts = config?.prompts === undefined
    ? { ok: true as const, prompts: DEFAULT_SPIN_BOTTLE_PROMPTS }
    : parseSpinBottlePrompts(config.prompts);
  if (!parsedPrompts.ok) {
    console.error('[SpinBottleConfig] Published prompt settings are invalid:', parsedPrompts.error);
    return NextResponse.json({ error: 'Published game prompts are invalid.' }, { status: 503 });
  }

  return NextResponse.json({
    groupVoteEnabled: config?.groupVoteEnabled === true,
    prompts: parsedPrompts.prompts
  }, { headers: { 'Cache-Control': 'no-store' } });
}
