import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import {
  createInstagramDatabase,
  encryptInstagramToken,
  exchangeInstagramCode
} from '@/lib/instagram.server';

export const dynamic = 'force-dynamic';

function accountsPage(request: Request, result: string) {
  const url = new URL('/lord/growth/accounts', request.url);
  url.searchParams.set('instagram', result);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_marketing')) {
    return accountsPage(request, 'not_authorized');
  }

  const callbackCookies = await cookies();
  const expectedState = callbackCookies.get('instagram_oauth_state')?.value || '';
  const params = new URL(request.url).searchParams;
  const returnedState = params.get('state') || '';
  const code = params.get('code') || '';
  const stateMatches = /^[a-f0-9]{64}$/.test(expectedState)
    && /^[a-f0-9]{64}$/.test(returnedState)
    && timingSafeEqual(Buffer.from(expectedState), Buffer.from(returnedState));

  let response: NextResponse;
  if (params.has('error')) {
    response = accountsPage(request, 'cancelled');
  } else if (!stateMatches || !code || code.length > 4096) {
    response = accountsPage(request, 'invalid_state');
  } else {
    try {
      const account = await exchangeInstagramCode(code);
      const database = createInstagramDatabase();
      const { error } = await database.from('instagram_connections').upsert({
        instagram_user_id: account.accountId,
        username: account.username,
        access_token_encrypted: encryptInstagramToken(account.accessToken),
        token_expires_at: account.expiresAt,
        granted_scopes: account.scopes,
        connected_by: session.email || null,
        status: 'CONNECTED',
        updated_at: new Date().toISOString()
      }, { onConflict: 'instagram_user_id' });
      if (error) {
        console.error('[InstagramOAuth] Could not persist account connection:', error);
        throw new Error('Instagram account details could not be saved. Check that the Instagram connection migration has been applied.');
      }
      response = accountsPage(request, 'connected');
    } catch (error) {
      console.error('[InstagramOAuth] Authorization callback failed:', error);
      response = accountsPage(request, 'failed');
    }
  }

  response.cookies.set('instagram_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/instagram/callback',
    maxAge: 0
  });
  return response;
}
