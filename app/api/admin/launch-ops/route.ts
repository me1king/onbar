import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { getLaunchOperationsSummary } from '@/lib/launchOperations';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_view_revenue') && !hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Launch ops access required.' }, { status: 403 });
  }

  const summary = getLaunchOperationsSummary();

  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
