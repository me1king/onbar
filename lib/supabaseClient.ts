import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

function getJwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const claims: unknown = JSON.parse(atob(paddedPayload));
    if (typeof claims === 'object' && claims !== null && 'role' in claims && typeof claims.role === 'string') {
      return claims.role;
    }
  } catch {
    return null;
  }
  return null;
}

const isAnonJwtKey = supabaseKey.startsWith('eyJ') && getJwtRole(supabaseKey) === 'anon';
const isPublishableKey = /^sb_publishable_.+/.test(supabaseKey);
const hasSupportedKeyFormat = isAnonJwtKey || isPublishableKey;
const AUTH_FETCH_TIMEOUT_MS = 12_000;

const boundedSupabaseFetch: typeof fetch = (input, init) => {
  const requestUrl = typeof input === 'string'
    ? input
    : 'url' in input
      ? input.url
      : input.toString();
  if (!requestUrl.includes('/auth/v1/')) return fetch(input, init);

  const timeoutSignal = AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
};

const isConfigured =
  supabaseUrl.length > 0 &&
  /^https?:\/\//.test(supabaseUrl) &&
  hasSupportedKeyFormat;

if (typeof window !== 'undefined' && supabaseKey && !hasSupportedKeyFormat) {
    console.error(
        'Supabase client configuration is invalid. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY to a Supabase publishable key or anon JWT.'
    );
}

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl, supabaseKey, { global: { fetch: boundedSupabaseFetch } })
  : null;

export default supabase;
