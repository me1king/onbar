import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { getInstagramConfig, getInstagramScopes } from '@/lib/instagram.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_marketing')) {
    return NextResponse.json({ error: 'Marketing permission required.' }, { status: 403 });
  }

  try {
    const config = getInstagramConfig();
    const state = randomBytes(32).toString('hex');
    const authorizeUrl = new URL('https://www.instagram.com/oauth/authorize');
    authorizeUrl.search = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: getInstagramScopes().join(','),
      state
    }).toString();

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set('instagram_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/admin/instagram/callback',
      maxAge: 10 * 60
    });
    return response;
  } catch (error) {
    console.error('[InstagramOAuth] Could not start authorization:', error);
    return NextResponse.redirect(new URL('/lord/growth/accounts?instagram=not_configured', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'));
  }
}
