import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { createInstagramDatabase } from '@/lib/instagram.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return NextResponse.json({ error: 'Marketing permission required.' }, { status: 403 });
  }

  try {
    const database = createInstagramDatabase();
    const { data, error } = await database
      .from('instagram_connections')
      .select('id, instagram_user_id, username, token_expires_at, status, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      accounts: (data || []).map(account => ({
        id: account.id,
        platform: 'INSTAGRAM',
        account_name: `@${account.username}`,
        status: account.status,
        connected: account.status === 'CONNECTED',
        token_expires_at: account.token_expires_at
      }))
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[InstagramStatus] Could not load account status:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Instagram status could not be loaded.'
    }, { status: 503 });
  }
}
