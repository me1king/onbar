import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createInstagramDatabase } from '@/lib/instagram.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return NextResponse.json({ error: 'Marketing permission required.' }, { status: 403 });
  }
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Valid Instagram account ID is required.' }, { status: 400 });
  }
  if (typeof body.id !== 'string' || !/^[\da-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: 'Valid Instagram account ID is required.' }, { status: 400 });
  }

  try {
    const database = createInstagramDatabase();
    const { error } = await database.from('instagram_connections').delete().eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error('[InstagramDisconnect] Could not disconnect account:', error);
    return NextResponse.json({ error: 'Instagram account could not be disconnected.' }, { status: 503 });
  }
}
