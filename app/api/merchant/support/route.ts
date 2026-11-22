import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';

export const dynamic = 'force-dynamic';

const categories = new Set([
  'Merchant operations',
  'Payments and statements',
  'Catalog and stock',
  'Safety and compliance',
  'Other'
]);

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
  if (!clients) {
    return { response: NextResponse.json({ error: 'Merchant support is not configured.' }, { status: 503 }) };
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { response: NextResponse.json({ error: 'Sign in to contact merchant support.' }, { status: 401 }) };
  }
  const { data, error } = await clients.auth.auth.getUser(token);
  const user = data.user;
  const email = user?.email?.trim().toLowerCase() || null;
  if (error || !user || (!user.email_confirmed_at && !user.phone_confirmed_at)) {
    return { response: NextResponse.json({ error: 'Your merchant sign-in has expired.' }, { status: 401 }) };
  }

  return {
    auth: clients.auth,
    database: clients.database,
    userId: user.id,
    email
  };
}

async function getOwnedApplication(
  database: NonNullable<ReturnType<typeof getClients>>['database'],
  userId: string,
  email: string | null,
  applicationId: string | null
) {
  if (!isUuid(applicationId)) return { application: null, error: null };
  const { data, error } = await database
    .from('merchant_applications')
    .select('id,business_name,status,email,account_user_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) return { application: null, error };
  const ownsApplication = data && (
    data.account_user_id === userId
    || (email !== null && data.email?.trim().toLowerCase() === email)
  );
  return {
    application: ownsApplication && data.status === 'approved' ? data : null,
    error: null
  };
}

function migrationMessage(error: { message?: string; code?: string }) {
  if (error.code === '42P01' || error.code === '42703'
    || /merchant_application_id|support_tickets|schema cache/i.test(error.message || '')) {
    return 'Merchant support history is not installed. Run supabase/MERCHANT_SUPPORT_HISTORY_MIGRATION.sql after the support ticket schema.';
  }
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
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
    console.error('[MerchantSupport] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application) {
    return NextResponse.json({ error: 'Choose an approved business linked to your account.' }, { status: 404 });
  }

  const { data, error } = await account.database
    .from('support_tickets')
    .select('id,subject,category,status,priority,admin_response,created_at,updated_at')
    .eq('user_id', account.userId)
    .eq('merchant_application_id', application.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('[MerchantSupport] Could not load merchant ticket history:', error);
    return NextResponse.json({ error: migrationMessage(error) || 'Your support history could not be loaded.' }, { status: 503 });
  }
  return NextResponse.json({ tickets: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Support requests must come from this website.' }, { status: 403 });
  }
  const account = await getAccount(request);
  if ('response' in account) return account.response;

  let body: { applicationId?: unknown; subject?: unknown; category?: unknown; message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Send a valid support request.' }, { status: 400 });
  }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : null;
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (subject.length < 3 || subject.length > 120
    || !categories.has(category)
    || message.length < 10 || message.length > 3000) {
    return NextResponse.json({ error: 'Check the support topic, subject, and message before sending.' }, { status: 400 });
  }

  const { application, error: applicationError } = await getOwnedApplication(
    account.database,
    account.userId,
    account.email,
    applicationId
  );
  if (applicationError) {
    console.error('[MerchantSupport] Could not verify merchant ownership:', applicationError);
    return NextResponse.json({ error: 'Your merchant access could not be verified.' }, { status: 503 });
  }
  if (!application) {
    return NextResponse.json({ error: 'Choose an approved business linked to your account.' }, { status: 404 });
  }

  const { data, error } = await account.database
    .from('support_tickets')
    .insert({
      user_id: account.userId,
      merchant_application_id: application.id,
      customer_name: application.business_name,
      customer_email: account.email,
      subject,
      description: message,
      category,
      priority: 'Medium',
      status: 'Open'
    })
    .select('id,subject,category,status,priority,admin_response,created_at,updated_at')
    .single();
  if (error || !data) {
    console.error('[MerchantSupport] Could not save merchant support request:', error);
    return NextResponse.json({
      error: error ? migrationMessage(error) || 'Your support request could not be saved.' : 'Your support request could not be saved.'
    }, { status: 503 });
  }

  let notificationWarning: string | null = null;
  if (!account.email) {
    notificationWarning = 'Your ticket was saved, but no verified email is linked to this sign-in for a confirmation.';
  } else {
    try {
      await sendTransactionalEmail({
        to: account.email,
        subject: `OnBar support request received · #${data.id}`,
        text: `We received your merchant support request "${subject}" for ${application.business_name}. Ticket #${data.id} is saved in your Merchant Support history; OnBar replies will appear there.`,
        html: `<p>We received your merchant support request <strong>${escapeHtml(subject)}</strong> for ${escapeHtml(application.business_name)}.</p><p>Ticket #${data.id} is saved in your Merchant Support history. OnBar replies will appear there.</p>`,
        idempotencyKey: `merchant-support-ticket-${data.id}`
      });
    } catch (emailError) {
      console.error('[MerchantSupport] Ticket was saved, but email confirmation failed:', emailError);
      notificationWarning = 'Your ticket was saved, but its email confirmation could not be sent. Check the in-app ticket history for replies.';
    }
  }
  return NextResponse.json({
    ticket: data,
    notificationSent: notificationWarning === null,
    ...(notificationWarning ? { notificationWarning } : {})
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
