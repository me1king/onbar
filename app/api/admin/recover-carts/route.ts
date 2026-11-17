import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_marketing')) {
    return NextResponse.json({ error: 'Marketing permission required.' }, { status: 403 });
  }
  return NextResponse.json({
    error: 'Bulk cart recovery is disabled. Use Marketing → Abandoned Checkouts to verify consent, stock, and purchase status before sending an edited reminder.'
  }, { status: 410 });
}
