import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import {
  getStoredDarajaConfiguration,
  isValidDarajaCredentials,
  saveDarajaCredentials,
  verifyDarajaCredentials
} from '@/lib/darajaPayments.server';

export const dynamic = 'force-dynamic';

async function authorize() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 });
  if (!hasAdminPermission(session, 'can_manage_settings')) {
    return NextResponse.json({ error: 'Payment integration settings access is required.' }, { status: 403 });
  }
  const database = createServerSupabaseClient();
  if (!database) return NextResponse.json({ error: 'Server database access is not configured.' }, { status: 503 });
  return { database };
}

function readCredentials(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const credentials = {
    consumerKey: typeof input.consumerKey === 'string' ? input.consumerKey.trim() : '',
    consumerSecret: typeof input.consumerSecret === 'string' ? input.consumerSecret.trim() : '',
    passkey: typeof input.passkey === 'string' ? input.passkey.trim() : '',
    shortcode: typeof input.shortcode === 'string' ? input.shortcode.trim() : '',
    shortcodeType: input.shortcodeType,
    environment: input.environment
  };
  return isValidDarajaCredentials(credentials) ? credentials : null;
}

export async function GET() {
  const access = await authorize();
  if (access instanceof NextResponse) return access;
  try {
    const configuration = await getStoredDarajaConfiguration(access.database);
    return NextResponse.json(configuration, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Daraja configuration could not be loaded.'
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if (access instanceof NextResponse) return access;

  let body: { credentials?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid Daraja credentials are required.' }, { status: 400 });
  }
  const credentials = readCredentials(body.credentials);
  if (!credentials) {
    return NextResponse.json({ error: 'Enter a valid consumer key, consumer secret, passkey, shortcode, shortcode type, and environment.' }, { status: 400 });
  }
  try {
    await verifyDarajaCredentials(credentials);
    return NextResponse.json({ verified: true, message: 'Safaricom authorized these credentials. No payment was initiated.' });
  } catch (error) {
    return NextResponse.json({
      verified: false,
      error: error instanceof Error ? error.message : 'Safaricom could not verify these credentials.'
    }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if (access instanceof NextResponse) return access;

  let body: { credentials?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Valid Daraja credentials are required.' }, { status: 400 });
  }
  const credentials = readCredentials(body.credentials);
  if (!credentials) {
    return NextResponse.json({ error: 'Enter a valid consumer key, consumer secret, passkey, shortcode, shortcode type, and environment.' }, { status: 400 });
  }
  try {
    await saveDarajaCredentials(access.database, credentials);
    return NextResponse.json({
      saved: true,
      shortcode: credentials.shortcode,
      environment: credentials.environment
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Daraja credentials could not be saved.'
    }, { status: 503 });
  }
}
