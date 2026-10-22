import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const requiredScopes = ['instagram_business_basic', 'instagram_business_content_publish'];

export function getInstagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const graphVersion = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim() || 'v26.0';
  const encryptionKey = Buffer.from(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY?.trim() || '', 'base64');

  if (!appId || !appSecret || !redirectUri || !supabaseUrl || !serviceRoleKey || encryptionKey.length !== 32) {
    throw new Error('Instagram is not configured. Set the Instagram App ID, App Secret, Redirect URI, token encryption key, Supabase URL, and service-role key.');
  }
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('INSTAGRAM_GRAPH_API_VERSION must look like v23.0.');

  const redirect = new URL(redirectUri);
  if (redirect.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('Instagram OAuth redirect URI must use HTTPS in production.');
  }
  return { appId, appSecret, redirectUri, supabaseUrl, serviceRoleKey, graphVersion, encryptionKey };
}

export function createInstagramDatabase() {
  const { supabaseUrl, serviceRoleKey } = getInstagramConfig();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function encryptInstagramToken(token: string) {
  const { encryptionKey } = getInstagramConfig();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function decryptInstagramToken(value: string) {
  const { encryptionKey } = getInstagramConfig();
  const packed = Buffer.from(value, 'base64url');
  if (packed.length < 29) throw new Error('Stored Instagram credentials are invalid.');

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}

export function getInstagramScopes() {
  return [...requiredScopes];
}

type ProviderError = { error?: { message?: string; type?: string; code?: number } };

export async function readInstagramResponse<T>(response: Response): Promise<T> {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('Instagram returned an invalid response.');
  }
  if (!response.ok || (typeof result === 'object' && result !== null && 'error' in result)) {
    const providerError = result as ProviderError;
    const code = providerError.error?.code;
    throw new Error(`Instagram request failed${code ? ` (code ${code})` : ''}. Check app permissions and account eligibility.`);
  }
  return result as T;
}

export async function exchangeInstagramCode(code: string) {
  const { appId, appSecret, redirectUri, graphVersion } = getInstagramConfig();
  const form = new FormData();
  form.set('client_id', appId);
  form.set('client_secret', appSecret);
  form.set('grant_type', 'authorization_code');
  form.set('redirect_uri', redirectUri);
  form.set('code', code);

  const shortLived = await readInstagramResponse<{
    access_token: string;
    user_id: string | number;
    permissions?: string | string[];
  }>(await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(15000)
  }));
  if (!shortLived.access_token || !shortLived.user_id) {
    throw new Error('Instagram authorization did not return an account token.');
  }

  const permissionList = Array.isArray(shortLived.permissions)
    ? shortLived.permissions
    : typeof shortLived.permissions === 'string' ? shortLived.permissions.split(',') : [];
  if (permissionList.length > 0 && requiredScopes.some(scope => !permissionList.includes(scope))) {
    throw new Error('Instagram did not grant the required basic and content-publishing permissions. Reconnect and approve both.');
  }

  const longLivedUrl = new URL('https://graph.instagram.com/access_token');
  longLivedUrl.search = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: shortLived.access_token
  }).toString();
  const longLived = await readInstagramResponse<{ access_token: string; expires_in: number }>(
    await fetch(longLivedUrl, { signal: AbortSignal.timeout(15000) })
  );
  if (!longLived.access_token || !Number.isFinite(longLived.expires_in) || longLived.expires_in <= 0) {
    throw new Error('Instagram did not return a valid long-lived token.');
  }

  const profileUrl = new URL(`https://graph.instagram.com/${graphVersion}/me`);
  profileUrl.search = new URLSearchParams({
    fields: 'user_id,username',
    access_token: longLived.access_token
  }).toString();
  const profile = await readInstagramResponse<{ user_id: string | number; username: string }>(
    await fetch(profileUrl, { signal: AbortSignal.timeout(15000) })
  );
  if (!profile.user_id || !profile.username) throw new Error('Instagram did not return a professional account profile.');

  return {
    accountId: String(profile.user_id),
    username: profile.username,
    accessToken: longLived.access_token,
    expiresAt: new Date(Date.now() + longLived.expires_in * 1000).toISOString(),
    scopes: permissionList
  };
}

export async function getFreshInstagramToken(database: ReturnType<typeof createInstagramDatabase>, connection: {
  id: string;
  access_token_encrypted: string;
  token_expires_at: string;
}) {
  const expiry = Date.parse(connection.token_expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('Instagram access has expired. Reconnect the account from Social Accounts.');
  }

  const token = decryptInstagramToken(connection.access_token_encrypted);
  if (expiry - Date.now() > 10 * 24 * 60 * 60 * 1000) return token;

  const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
  refreshUrl.search = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token
  }).toString();
  const refreshed = await readInstagramResponse<{ access_token: string; expires_in: number }>(
    await fetch(refreshUrl, { signal: AbortSignal.timeout(15000) })
  );
  if (!refreshed.access_token || !Number.isFinite(refreshed.expires_in) || refreshed.expires_in <= 0) {
    throw new Error('Instagram token refresh returned invalid credentials. Reconnect the account.');
  }
  const nextExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error } = await database.from('instagram_connections').update({
    access_token_encrypted: encryptInstagramToken(refreshed.access_token),
    token_expires_at: nextExpiry,
    updated_at: new Date().toISOString()
  }).eq('id', connection.id);
  if (error) {
    console.error('[Instagram] Could not persist refreshed token:', error);
    throw new Error('Instagram token was refreshed but could not be saved. Contact an administrator.');
  }
  return refreshed.access_token;
}
