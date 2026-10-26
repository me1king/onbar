import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { parsePublicLaunchGate, isPublicSiteLocked } from '@/lib/publicLaunchGate';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Public launch status is not configured.' }, { status: 503 });
  }
  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'public_launch_gate')
    .eq('is_published', true)
    .maybeSingle();
  if (error) {
    console.error('[PublicLaunchGate] Could not load public launch status:', error);
    return NextResponse.json({ error: 'Public launch status could not be loaded.' }, { status: 503 });
  }
  const gate = data ? parsePublicLaunchGate(data.value) : { active: false, releaseAt: null };
  if (!gate) {
    console.error('[PublicLaunchGate] Stored public launch setting is invalid.');
    return NextResponse.json({ error: 'Public launch status is invalid.' }, { status: 503 });
  }
  return NextResponse.json({
    active: isPublicSiteLocked(gate),
    releaseAt: gate.releaseAt
  }, { headers: { 'Cache-Control': 'no-store' } });
}
