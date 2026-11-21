import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Game settings are not configured.' }, { status: 503 });
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
    && (typeof value !== 'object' || Array.isArray(value)
      || typeof (value as { groupVoteEnabled?: unknown }).groupVoteEnabled !== 'boolean')) {
    console.error('[SpinBottleConfig] Published group-vote configuration is invalid.');
    return NextResponse.json({ error: 'Published game settings are invalid.' }, { status: 503 });
  }

  return NextResponse.json({
    groupVoteEnabled: value ? (value as { groupVoteEnabled: boolean }).groupVoteEnabled : false
  }, { headers: { 'Cache-Control': 'no-store' } });
}
