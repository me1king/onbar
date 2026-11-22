import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { getPublicBaseUrl } from '@/lib/utils';

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

function isTicketId(value: string | null): value is string {
  if (isUuid(value)) return true;
  if (!value || !/^[1-9]\d*$/.test(value)) return false;
  return Number.isSafeInteger(Number(value));
}

function normalizeTicketId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && isTicketId(value)) return value;
  return null;
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
    || /merchant_application_id|merchant_support_messages|support_tickets|schema cache/i.test(error.message || '')) {
    return 'Merchant support history is not installed. Run supabase/MERCHANT_SUPPORT_HISTORY_MIGRATION.sql after the support ticket schema.';
  }
  return null;
}

async function getNotificationRecipient(
  database: NonNullable<ReturnType<typeof getClients>>['database']
) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim();
  if (configuredEmail) return configuredEmail;

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'contact')
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw error;

  const email = data?.value?.email;
  return typeof email === 'string' ? email.trim() : '';
}

async function notifyFounder(
  database: NonNullable<ReturnType<typeof getClients>>['database'],
  details: {
    ticketId: string | number;
    applicationName: string;
    subject: string;
    senderName: string;
    senderEmail: string | null;
    message: string;
    messageId: string | number;
  }
) {
  try {
    const recipient = await getNotificationRecipient(database);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return 'Your message was saved, but the founder notification email is not configured.';
    }
    const emailConfig = getTransactionalEmailConfig();
    if (!emailConfig.configured) {
      return 'Your message was saved, but email alerts are not configured yet.';
    }
    await sendTransactionalEmail({
      from: emailConfig.from,
      to: recipient,
      subject: `Merchant message · ${details.applicationName}: ${details.subject}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#152238">
        <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e79a00;text-transform:uppercase">Online Bar · Merchant message</p>
        <h1 style="font-size:24px;margin:12px 0">${escapeHtml(details.applicationName)}</h1>
        <p><b>Ticket:</b> ${escapeHtml(String(details.ticketId))}</p>
        <p><b>From:</b> ${escapeHtml(details.senderName)}${details.senderEmail ? ` &lt;${escapeHtml(details.senderEmail)}&gt;` : ''}</p>
        <p><b>Subject:</b> ${escapeHtml(details.subject)}</p>
        <div style="white-space:pre-wrap;background:#f5f7fa;border-radius:12px;padding:16px;margin:20px 0">${escapeHtml(details.message)}</div>
        <a href="${escapeHtml(getPublicBaseUrl())}/lord/support" style="display:inline-block;background:#f5a000;color:#101827;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Reply in the support inbox</a>
      </div>`,
      text: `Online Bar · Merchant message\nBusiness: ${details.applicationName}\nTicket: ${details.ticketId}\nFrom: ${details.senderName}${details.senderEmail ? ` <${details.senderEmail}>` : ''}\nSubject: ${details.subject}\n\n${details.message}\n\nReply in the support inbox: ${getPublicBaseUrl()}/lord/support`,
      idempotencyKey: `merchant-support-${details.ticketId}-${details.messageId}`
    });
    return null;
  } catch (error) {
    console.error('[MerchantSupport] Message saved, but founder email alert failed:', error);
    return 'Your message was saved, but its email alert to the founder could not be sent.';
  }
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
    .select('id,subject,category,status,priority,admin_response,description,customer_name,created_at,updated_at')
    .eq('user_id', account.userId)
    .eq('merchant_application_id', application.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('[MerchantSupport] Could not load merchant ticket history:', error);
    return NextResponse.json({ error: migrationMessage(error) || 'Your support history could not be loaded.' }, { status: 503 });
  }

  const tickets = data || [];
  const ticketIds = tickets.map(ticket => ticket.id);
  const { data: threadMessages, error: messagesError } = ticketIds.length
    ? await account.database.from('merchant_support_messages')
      .select('id,ticket_id,sender_role,sender_name,body,created_at')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
    : { data: [], error: null };
  if (messagesError) {
    console.error('[MerchantSupport] Could not load conversation messages:', messagesError);
    return NextResponse.json({ error: migrationMessage(messagesError) || 'Your support conversations could not be loaded.' }, { status: 503 });
  }
  const messagesByTicket = new Map<string, Array<{
    id: string | number;
    senderRole: string;
    senderName: string;
    body: string;
    createdAt: string;
  }>>();
  for (const ticket of tickets) {
    messagesByTicket.set(String(ticket.id), ticket.description ? [{
      id: `initial-${ticket.id}`,
      senderRole: 'merchant',
      senderName: ticket.customer_name || application.business_name,
      body: ticket.description,
      createdAt: ticket.created_at
    }] : []);
  }
  for (const message of threadMessages || []) {
    const messages = messagesByTicket.get(String(message.ticket_id));
    if (messages) messages.push({
      id: message.id,
      senderRole: message.sender_role,
      senderName: message.sender_name,
      body: message.body,
      createdAt: message.created_at
    });
  }
  return NextResponse.json({ tickets: tickets.map(ticket => ({
    ...ticket,
    id: String(ticket.id),
    messages: messagesByTicket.get(String(ticket.id)) || []
  })) }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Support requests must come from this website.' }, { status: 403 });
  }
  const account = await getAccount(request);
  if ('response' in account) return account.response;

  let body: { applicationId?: unknown; action?: unknown; ticketId?: unknown; subject?: unknown; category?: unknown; message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Send a valid support request.' }, { status: 400 });
  }
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
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

  if (body.action === 'reply') {
    const ticketId = normalizeTicketId(body.ticketId);
    if (!ticketId || message.length < 1 || message.length > 4000) {
      return NextResponse.json({ error: 'Choose a valid ticket and enter a message of up to 4,000 characters.' }, { status: 400 });
    }
    const { data: ticket, error: ticketError } = await account.database
      .from('support_tickets')
      .select('id,subject')
      .eq('id', ticketId)
      .eq('user_id', account.userId)
      .eq('merchant_application_id', application.id)
      .maybeSingle();
    if (ticketError) {
      console.error('[MerchantSupport] Could not verify the conversation owner:', ticketError);
      return NextResponse.json({ error: 'Your support conversation could not be verified.' }, { status: 503 });
    }
    if (!ticket) return NextResponse.json({ error: 'Support conversation not found for this business.' }, { status: 404 });

    const { data: savedMessage, error: messageError } = await account.database
      .from('merchant_support_messages')
      .insert({
        ticket_id: ticket.id,
        sender_role: 'merchant',
        sender_user_id: account.userId,
        sender_name: application.business_name.trim().slice(0, 120) || 'Merchant',
        body: message
      })
      .select('id,ticket_id,sender_role,sender_name,body,created_at')
      .single();
    if (messageError || !savedMessage) {
      console.error('[MerchantSupport] Could not save merchant conversation message:', messageError);
      return NextResponse.json({
        error: messageError ? migrationMessage(messageError) || 'Your message could not be saved.' : 'Your message could not be saved.'
      }, { status: 503 });
    }

    const { error: reopenError } = await account.database
      .from('support_tickets')
      .update({ status: 'Open', updated_at: new Date().toISOString() })
      .eq('id', ticket.id)
      .eq('user_id', account.userId);
    const warnings: string[] = [];
    if (reopenError) {
      console.error('[MerchantSupport] Message saved, but ticket status could not be reopened:', reopenError);
      warnings.push('The message was saved, but the ticket status could not be refreshed.');
    }
    const founderWarning = await notifyFounder(account.database, {
      ticketId: ticket.id,
      applicationName: application.business_name,
      subject: ticket.subject || 'Merchant support',
      senderName: application.business_name,
      senderEmail: account.email,
      message,
      messageId: savedMessage.id
    });
    if (founderWarning) warnings.push(founderWarning);
    return NextResponse.json({
      message: {
        id: savedMessage.id,
        senderRole: savedMessage.sender_role,
        senderName: savedMessage.sender_name,
        body: savedMessage.body,
        createdAt: savedMessage.created_at
      },
      ...(warnings.length ? { notificationWarning: warnings.join(' ') } : {})
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';
  if (subject.length < 3 || subject.length > 120
    || !categories.has(category)
    || message.length < 10 || message.length > 3000) {
    return NextResponse.json({ error: 'Check the support topic, subject, and message before sending.' }, { status: 400 });
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

  const founderNotification = notifyFounder(account.database, {
    ticketId: data.id,
    applicationName: application.business_name,
    subject,
    senderName: application.business_name,
    senderEmail: account.email,
    message,
    messageId: `initial-${data.id}`
  });
  const merchantConfirmation = (async () => {
    if (!account.email) {
      return 'Your ticket was saved, but no verified email is linked to this sign-in for a confirmation.';
    }
    try {
      await sendTransactionalEmail({
        to: account.email,
        subject: `OnBar support request received · #${data.id}`,
        text: `We received your merchant support request "${subject}" for ${application.business_name}. Ticket #${data.id} is saved in your Merchant Support history; OnBar replies will appear there.`,
        html: `<p>We received your merchant support request <strong>${escapeHtml(subject)}</strong> for ${escapeHtml(application.business_name)}.</p><p>Ticket #${data.id} is saved in your Merchant Support history. OnBar replies will appear there.</p>`,
        idempotencyKey: `merchant-support-ticket-${data.id}`
      });
      return null;
    } catch (emailError) {
      console.error('[MerchantSupport] Ticket was saved, but email confirmation failed:', emailError);
      return 'Your ticket was saved, but its email confirmation could not be sent. Check the in-app ticket history for replies.';
    }
  })();
  const [founderWarning, notificationWarning] = await Promise.all([founderNotification, merchantConfirmation]);
  const warnings: string[] = [];
  if (founderWarning) warnings.push(founderWarning);
  if (notificationWarning) warnings.push(notificationWarning);
  return NextResponse.json({
    ticket: { ...data, id: String(data.id) },
    notificationSent: notificationWarning === null,
    ...(warnings.length ? { notificationWarning: warnings.join(' ') } : {})
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
