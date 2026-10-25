import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (session.role.toLowerCase() !== 'owner') {
    return NextResponse.json({ error: 'Only the platform owner can review ticket transfers.' }, { status: 403 });
  }
  return NextResponse.json({ allowed: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
