import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getCustomerId(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) throw new Error('A valid customer session is required.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('Customer authentication is not configured.');
  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Customer session is invalid. Please sign in again.');
  return data.user.id;
}

function isSupportToken(value: string | null): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Customer messaging is not configured on the server.' }, { status: 503 });
  }

  let body: { name?: unknown; email?: unknown; message?: unknown; token?: unknown; subject?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid support message is required.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const token = typeof body.token === 'string' ? body.token : null;
  const subject = body.subject === 'CORPORATE_INQUIRY' ? 'CORPORATE_INQUIRY' : 'In-App Support Ticket';
  if (
    name.length < 1 || name.length > 120
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || message.length < 1 || message.length > 4000
    || !isSupportToken(token)
  ) {
    return NextResponse.json({ error: 'Please provide a valid name, email, message, and support session.' }, { status: 400 });
  }

  let customerId: string | null;
  try {
    customerId = await getCustomerId(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Customer session is invalid.' }, { status: 401 });
  }
  const { error } = await database.from('messages').insert({
    name,
    email,
    user_id: customerId,
    subject,
    message,
    status: 'New',
    customer_token_hash: await hashToken(token)
  });
  if (error) {
    console.error('[CustomerSupport] Could not save support message:', error);
    return NextResponse.json({ error: `Could not save your message: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const database = getDatabase();
  if (!database) {
    return NextResponse.json({ error: 'Customer messaging is not configured on the server.' }, { status: 503 });
  }

  let customerId: string | null;
  try {
    customerId = await getCustomerId(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Customer session is invalid.' }, { status: 401 });
  }

  const token = request.headers.get('x-support-access-token');
  const hasToken = isSupportToken(token);
  if (!customerId && !hasToken) {
    return NextResponse.json({ error: 'A valid support session is required.' }, { status: 401 });
  }

  let query = database
    .from('messages')
    .select('id, subject, message, admin_response, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (customerId && hasToken) {
    const tokenHash = await hashToken(token);
    query = query.or(`user_id.eq.${customerId},customer_token_hash.eq.${tokenHash}`);
  } else if (customerId) {
    query = query.eq('user_id', customerId);
  } else {
    query = query.eq('customer_token_hash', await hashToken(token!));
  }
  const { data, error } = await query;

  if (error) {
    console.error('[CustomerSupport] Could not load support replies:', error);
    return NextResponse.json({ error: `Could not load support replies: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ messages: data || [] }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
