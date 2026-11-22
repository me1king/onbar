import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    auth: createClient(url, publicKey, options),
    database: createClient(url, serviceKey, options)
  };
}

function isUuid(value: string | null): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAccount(request: Request) {
  const clients = getClients();
  if (!clients) return { response: NextResponse.json({ error: 'Merchant summaries are not configured.' }, { status: 503 }) };
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: 'Sign in to manage your weekly summary.' }, { status: 401 }) };
  const { data, error } = await clients.auth.auth.getUser(token);
  const user = data.user;
  if (error || !user || !user.email_confirmed_at || !user.email) {
    return { response: NextResponse.json({ error: 'A verified merchant email is required for weekly summaries.' }, { status: 401 }) };
  }
  return {
    auth: clients.auth,
    database: clients.database,
    userId: user.id,
    email: user.email.trim().toLowerCase()
  };
}

async function getOwnedApplication(
  database: NonNullable<ReturnType<typeof getClients>>['database'],
  userId: string,
  email: string,
  applicationId: string | null
) {
  if (!isUuid(applicationId)) return { application: null, error: null };
  const { data, error } = await database
    .from('merchant_applications')
    .select('id,status,email,account_user_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) return { application: null, error };
  const ownsApplication = data && (
    data.account_user_id === userId
    || data.email?.trim().toLowerCase() === email
  );
  return {
    application: ownsApplication && data.status === 'approved' ? data : null,
    error: null
  };
}

function missingMigration(error: { code?: string; message?: string }) {
  return error.code === '42P01' || error.code === '42703'
    || /merchant_weekly_digest|schema cache/i.test(error.message || '')
    ? 'Weekly summaries are not installed. Run supabase/MERCHANT_WEEKLY_DIGEST_MIGRATION.sql after the merchant operations migration.'
    : null;
}

export async function GET(request: Request) {
  const account = await getAccount(request);
  if ('response' in account) return account.response;
  const applicationId = new URL(request.url).searchParams.get('applicationId');
  const { application, error: applicationError } = await getOwnedApplication(
    account.database,
    account.userId,
    account.email,
    applicationId
  );
  if (applicationError) {
    console.error('[MerchantWeeklyDigest] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application) return NextResponse.json({ error: 'Choose an approved business linked to your account.' }, { status: 404 });

  const { data, error } = await account.database
    .from('merchant_weekly_digest_preferences')
    .select('enabled,recipient_email,consented_at')
    .eq('application_id', application.id)
    .maybeSingle();
  if (error) {
    console.error('[MerchantWeeklyDigest] Could not load summary preferences:', error);
    return NextResponse.json({ error: missingMigration(error) || 'Weekly summary preferences could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({
    enabled: data?.enabled === true,
    recipientEmail: data?.recipient_email || account.email,
    consentedAt: data?.consented_at || null
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Summary preferences must come from this website.' }, { status: 403 });
  }
  const account = await getAccount(request);
  if ('response' in account) return account.response;

  let body: { applicationId?: unknown; enabled?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Send a valid summary preference.' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Choose whether to receive the weekly email summary.' }, { status: 400 });
  }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : null;
  const { application, error: applicationError } = await getOwnedApplication(
    account.database,
    account.userId,
    account.email,
    applicationId
  );
  if (applicationError) {
    console.error('[MerchantWeeklyDigest] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application) return NextResponse.json({ error: 'Choose an approved business linked to your account.' }, { status: 404 });

  const { data, error } = await account.database
    .from('merchant_weekly_digest_preferences')
    .upsert({
      application_id: application.id,
      recipient_email: account.email,
      enabled: body.enabled,
      consented_at: body.enabled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'application_id' })
    .select('enabled,recipient_email,consented_at')
    .single();
  if (error || !data) {
    console.error('[MerchantWeeklyDigest] Could not save summary preference:', error);
    return NextResponse.json({
      error: error ? missingMigration(error) || 'Weekly summary preference could not be saved.' : 'Weekly summary preference could not be saved.'
    }, { status: 503 });
  }
  return NextResponse.json({
    enabled: data.enabled,
    recipientEmail: data.recipient_email,
    consentedAt: data.consented_at
  }, { headers: { 'Cache-Control': 'no-store' } });
}
