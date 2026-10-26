import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { parsePublicLaunchGate } from '@/lib/publicLaunchGate';

export const dynamic = 'force-dynamic';

async function requireOwnerOrAdmin() {
  const session = await getAdminSession();
  if (!session || !['owner', 'admin'].includes(session.role.toLowerCase())) {
    return null;
  }
  return session;
}

export async function GET() {
  if (!await requireOwnerOrAdmin()) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }
  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  }
  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'public_launch_gate')
    .maybeSingle();
  if (error) {
    console.error('[PublicLaunchGate] Could not load the site launch gate:', error);
    return NextResponse.json({ error: 'The public-site launch setting could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({
    gate: parsePublicLaunchGate(data?.value) || { active: false, releaseAt: null }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  if (!await requireOwnerOrAdmin()) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  let body: { active?: unknown; releaseAt?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid public-site launch setting is required.' }, { status: 400 });
  }
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'Choose whether the public-site gate should be active.' }, { status: 400 });
  }
  if (body.releaseAt !== null && body.releaseAt !== undefined && typeof body.releaseAt !== 'string') {
    return NextResponse.json({ error: 'Enter a valid public-site release time.' }, { status: 400 });
  }
  const releaseAt = typeof body.releaseAt === 'string' ? body.releaseAt : null;
  if (releaseAt) {
    const releaseTimestamp = Date.parse(releaseAt);
    if (Number.isNaN(releaseTimestamp) || releaseTimestamp <= Date.now()
      || releaseTimestamp > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Choose a release time in the next 12 months.' }, { status: 400 });
    }
  }
  if (!body.active && releaseAt) {
    return NextResponse.json({ error: 'A release time can only be set while the ticketing-only gate is active.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  }
  const gate = { active: body.active, releaseAt: body.active ? releaseAt : null };
  const { error } = await database.from('settings').upsert({
    key: 'public_launch_gate',
    value: gate,
    is_published: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'key' });
  if (error) {
    console.error('[PublicLaunchGate] Could not save the site launch gate:', error);
    return NextResponse.json({ error: 'The public-site launch setting could not be saved.' }, { status: 503 });
  }
  return NextResponse.json({ gate }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
