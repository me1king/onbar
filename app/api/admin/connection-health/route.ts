import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission } from '@/lib/adminAccess.server';
import { getWhatsAppCredentials } from '@/lib/whatsappCredentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type ProbeStatus = 'connected' | 'slow' | 'down' | 'configured' | 'not_configured' | 'disabled';

interface ConnectionCheck {
  id: string;
  label: string;
  status: ProbeStatus;
  latencyMs: number | null;
  detail: string;
}

async function probe(
  id: string,
  label: string,
  configured: boolean,
  run?: (signal: AbortSignal) => Promise<{ ok: boolean; detail: string }>
): Promise<ConnectionCheck> {
  if (!configured) {
    return { id, label, status: 'not_configured', latencyMs: null, detail: 'Required server configuration is missing.' };
  }
  if (!run) {
    return { id, label, status: 'configured', latencyMs: null, detail: 'Configured, but this provider does not expose a safe live health check.' };
  }

  const controller = new AbortController();
  const startedAt = performance.now();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const result = await run(controller.signal);
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      id,
      label,
      status: result.ok ? latencyMs > 1_500 ? 'slow' : 'connected' : 'down',
      latencyMs,
      detail: result.detail
    };
  } catch {
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      id,
      label,
      status: 'down',
      latencyMs,
      detail: controller.signal.aborted ? 'Connection probe timed out after 8 seconds.' : 'Connection probe failed. Check provider credentials and network access.'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHttp(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  ok: (response: Response) => Promise<boolean> | boolean = response => response.ok
) {
  const response = await fetch(url, { ...init, signal, cache: 'no-store' });
  const healthy = await ok(response);
  return {
    ok: healthy,
    detail: healthy ? `Provider responded with HTTP ${response.status}.` : `Provider returned HTTP ${response.status}.`
  };
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Settings management access required.' }, { status: 403 });
  }

  const database = createServerSupabaseClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publicSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const paystackKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  const { token: whatsappToken, phoneId: whatsappPhoneId } = getWhatsAppCredentials();
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const checkedAt = new Date().toISOString();

  const checksPromise = [
    probe('database', 'Supabase database', Boolean(database), async signal => {
      if (!database) return { ok: false, detail: 'Server-side Supabase client is unavailable.' };
      const { error } = await database.from('products').select('id').limit(1).abortSignal(signal);
      return { ok: !error, detail: error ? 'Supabase rejected the products query. Check database access, schema and server credentials.' : 'Products query succeeded.' };
    }),
    probe('storefront-products', 'Customer catalog access', Boolean(supabaseUrl && publicSupabaseKey), async signal => {
      const url = new URL('/rest/v1/products', supabaseUrl || '');
      url.searchParams.set('select', 'id');
      url.searchParams.set('limit', '1');
      const result = await checkHttp(url.toString(), {
        headers: {
          apikey: publicSupabaseKey || '',
          Authorization: `Bearer ${publicSupabaseKey || ''}`
        }
      }, signal);
      return result.ok
        ? { ok: true, detail: 'The customer-facing Supabase role can query the product catalog.' }
        : result.detail.includes('HTTP 401') || result.detail.includes('HTTP 403')
          ? { ok: false, detail: 'The customer-facing role is denied access to products. Apply PUBLIC_PRODUCT_CATALOG_ACCESS_MIGRATION.sql and verify the products SELECT policy.' }
          : result;
    }),
    probe('storage', 'Supabase Storage', Boolean(supabaseUrl && serviceKey), signal =>
      checkHttp(`${(supabaseUrl || '').replace(/\/$/, '')}/storage/v1/bucket`, {
        headers: { apikey: serviceKey || '', Authorization: `Bearer ${serviceKey || ''}` }
      }, signal)),
    probe('app-analytics', 'Built-in analytics storage', Boolean(database), async signal => {
      if (!database) return { ok: false, detail: 'Server-side Supabase client is unavailable.' };
      const { error } = await database.from('analytics_events').select('event_name').limit(1).abortSignal(signal);
      return { ok: !error, detail: error ? 'Analytics table query failed. Check its migration and database permissions.' : 'Analytics event table is reachable.' };
    }),
    probe('resend', 'Resend email API', Boolean(resendKey), signal =>
      checkHttp('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${resendKey}` }
      }, signal)),
    probe(
      'jmsurf',
      'JMSURF email configuration',
      Boolean(process.env.JMSURF_MAIL_KEY?.trim() && process.env.JMSURF_FROM_EMAIL?.trim())
    ),
    probe('paystack', 'Paystack API', Boolean(paystackKey), signal =>
      checkHttp('https://api.paystack.co/bank', {
        headers: { Authorization: `Bearer ${paystackKey}` }
      }, signal)),
    probe('whatsapp', 'WhatsApp Business API', Boolean(whatsappToken && whatsappPhoneId), signal =>
      checkHttp(`https://graph.facebook.com/v23.0/${encodeURIComponent(whatsappPhoneId || '')}?fields=id`, {
        headers: { Authorization: `Bearer ${whatsappToken}` }
      }, signal)),
    probe('google-maps', 'Google Maps Geocoding API', Boolean(mapsKey), async signal => {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', 'Nairobi, Kenya');
      url.searchParams.set('key', mapsKey || '');
      const response = await fetch(url, { signal, cache: 'no-store' });
      const result = await response.json() as { status?: string };
      const ok = result.status === 'OK' || result.status === 'ZERO_RESULTS';
      return { ok, detail: ok ? `Geocoding request succeeded (${result.status}).` : `Google Maps returned ${result.status || `HTTP ${response.status}`}.` };
    })
  ];

  const [checks, featuresResult] = await Promise.all([
    Promise.all(checksPromise),
    database
      ? database.from('settings').select('value').eq('key', 'features').abortSignal(AbortSignal.timeout(8_000)).maybeSingle()
      : Promise.resolve({ data: null, error: new Error('Supabase server client is unavailable.') })
  ]);
  if (featuresResult.error && database) {
    console.warn('[ConnectionHealth] Could not load analytics provider setting:', featuresResult.error.message);
  }
  const featureValue = featuresResult.data?.value;
  const configuredProvider = typeof featureValue === 'object' && featureValue !== null
    ? (featureValue as Record<string, unknown>).analytics_provider
    : 'app';
  const usesVercel = configuredProvider === 'vercel' || configuredProvider === 'both';

  return NextResponse.json({
    checkedAt,
    checks: [
      ...checks,
      {
        id: 'vercel-analytics',
        label: 'Vercel Web Analytics',
        status: usesVercel ? 'configured' : 'disabled',
        latencyMs: null,
        detail: usesVercel
          ? 'Selected in app settings. Event ingestion is browser-side; verify Web Analytics is enabled in the Vercel project dashboard.'
          : 'Not selected as an analytics source.'
      }
    ]
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
