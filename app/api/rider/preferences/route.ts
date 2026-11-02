import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyRiderSession } from '@/lib/riderSession.server';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

export async function GET(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider profile access is not configured.' }, { status: 503 });

  const { data, error } = await database.from('rider_status')
    .select('rider_accent_color, verification_status')
    .eq('rider_phone', session.phone)
    .maybeSingle();
  if (error) {
    console.error('[RiderPreferences] Could not load rider appearance:', error);
    return NextResponse.json({
      error: /rider_accent_color|schema cache/i.test(error.message)
        ? 'Rider appearance storage is not installed. Apply supabase/RIDER_TERMINAL_WORKFLOW_MIGRATION.sql.'
        : 'Rider appearance could not be loaded.'
    }, { status: 503 });
  }
  if (!data || data.verification_status !== 'Verified') {
    return NextResponse.json({ error: 'Only verified riders can update profile preferences.' }, { status: 403 });
  }
  return NextResponse.json({ accentColor: data.rider_accent_color }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function PATCH(request: Request) {
  const session = verifyRiderSession(request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!session) return NextResponse.json({ error: 'Rider session expired. Sign in again.' }, { status: 401 });
  let body: { accentColor?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Choose a valid rider theme color.' }, { status: 400 });
  }
  const accentColor = typeof body.accentColor === 'string' ? body.accentColor.trim() : '';
  if (!/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
    return NextResponse.json({ error: 'Choose a valid six-digit hex color.' }, { status: 400 });
  }
  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'Rider profile access is not configured.' }, { status: 503 });

  const { data, error } = await database.from('rider_status')
    .update({ rider_accent_color: accentColor.toUpperCase(), updated_at: new Date().toISOString() })
    .eq('rider_phone', session.phone)
    .eq('verification_status', 'Verified')
    .select('rider_accent_color')
    .maybeSingle();
  if (error) {
    console.error('[RiderPreferences] Could not save rider appearance:', error);
    return NextResponse.json({
      error: /rider_accent_color|schema cache/i.test(error.message)
        ? 'Rider appearance storage is not installed. Apply supabase/RIDER_TERMINAL_WORKFLOW_MIGRATION.sql.'
        : 'Rider appearance could not be saved.'
    }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Only verified riders can update profile preferences.' }, { status: 403 });
  return NextResponse.json({ accentColor: data.rider_accent_color }, { headers: { 'Cache-Control': 'no-store' } });
}
