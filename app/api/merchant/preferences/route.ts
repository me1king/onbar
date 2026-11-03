import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';

export const dynamic = 'force-dynamic';

const isUuid = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function getAccount(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !serviceKey || !publicKey) {
    return { response: NextResponse.json({ error: 'Merchant appearance storage is not configured.' }, { status: 503 }) };
  }
  if (!token) return { response: NextResponse.json({ error: 'Sign in to manage your workspace appearance.' }, { status: 401 }) };

  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const auth = createClient(url, publicKey, options);
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
    return { response: NextResponse.json({ error: 'Your verified merchant sign-in has expired.' }, { status: 401 }) };
  }
  const database = createClient(url, serviceKey, options);
  return { database, email: user.email.toLowerCase() };
}

export async function GET(request: Request) {
  const account = await getAccount(request);
  if ('response' in account) return account.response;
  const applicationId = new URL(request.url).searchParams.get('applicationId');
  if (!isUuid(applicationId)) {
    return NextResponse.json({ error: 'Choose a valid merchant workspace.' }, { status: 400 });
  }

  const { data, error } = await account.database
    .from('merchant_applications')
    .select('merchant_accent_color')
    .eq('id', applicationId)
    .eq('email', account.email)
    .eq('status', 'approved')
    .maybeSingle();
  if (error) {
    console.error('[MerchantPreferences] Could not load merchant appearance:', error);
    return NextResponse.json({
      error: /merchant_accent_color|schema cache/i.test(error.message)
        ? 'Merchant appearance storage is not installed. Apply supabase/MERCHANT_OPERATIONS_MIGRATION.sql.'
        : 'Merchant appearance could not be loaded.'
    }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'That approved workspace is not available to this account.' }, { status: 404 });
  return NextResponse.json({ accentColor: data.merchant_accent_color }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const account = await getAccount(request);
  if ('response' in account) return account.response;

  let body: { applicationId?: unknown; accentColor?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Choose a valid workspace color.' }, { status: 400 });
  }
  const accentColor = typeof body.accentColor === 'string' ? body.accentColor.trim().toUpperCase() : '';
  if (!isUuid(body.applicationId) || !/^#[0-9A-F]{6}$/.test(accentColor)) {
    return NextResponse.json({ error: 'Choose a valid workspace and six-digit color.' }, { status: 400 });
  }

  const { data, error } = await account.database
    .from('merchant_applications')
    .update({ merchant_accent_color: accentColor, updated_at: new Date().toISOString() })
    .eq('id', body.applicationId)
    .eq('email', account.email)
    .eq('status', 'approved')
    .select('merchant_accent_color')
    .maybeSingle();
  if (error) {
    console.error('[MerchantPreferences] Could not save merchant appearance:', error);
    return NextResponse.json({
      error: /merchant_accent_color|schema cache/i.test(error.message)
        ? 'Merchant appearance storage is not installed. Apply supabase/MERCHANT_OPERATIONS_MIGRATION.sql.'
        : 'Merchant appearance could not be saved.'
    }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'That approved workspace is not available to this account.' }, { status: 404 });
  return NextResponse.json({ accentColor: data.merchant_accent_color }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
