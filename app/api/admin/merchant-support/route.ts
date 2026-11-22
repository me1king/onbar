import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { verifySessionCookie } from '@/lib/adminAuth';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { getPublicBaseUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

async function getAdminDatabase() {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get('admin_session')?.value);
  const canManageSupport = session?.role === 'owner' || session?.role === 'admin'
    || session?.permissions?.can_manage_customer_care === true
    || session?.permissions?.can_manage_communications === true;
  if (!session || !canManageSupport) {
    return { response: NextResponse.json({ error: 'Merchant support access required.' }, { status: 403 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  }

  return {
    client: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    }),
    session
  };
}

export async function GET(request: Request) {
  const access = await getAdminDatabase();
  if ('response' in access) return access.response;

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get('notifications') === 'true') {
    const { data: tickets, error: ticketsError } = await access.client
      .from('support_tickets')
      .select('id,customer_name,subject,description,status,created_at,updated_at')
      .not('merchant_application_id', 'is', null)
      .eq('status', 'Open')
      .order('updated_at', { ascending: false })
      .limit(50);
    if (ticketsError) {
      console.error('[AdminMerchantSupport] Could not load merchant message alerts:', ticketsError);
      return NextResponse.json({ error: 'Merchant message alerts could not be loaded.' }, { status: 503 });
    }

    const openTickets = tickets || [];
    const ticketIds = openTickets.map(ticket => ticket.id);
    const { data: latestMessages, error: messagesError } = ticketIds.length
      ? await access.client
        .from('merchant_support_messages')
        .select('ticket_id,body,created_at')
        .in('ticket_id', ticketIds)
        .eq('sender_role', 'merchant')
        .order('created_at', { ascending: false })
        .limit(500)
      : { data: [], error: null };
    if (messagesError) {
      console.error('[AdminMerchantSupport] Could not load latest merchant messages:', messagesError);
      return NextResponse.json({ error: 'Merchant message alerts could not be loaded.' }, { status: 503 });
    }

    const latestByTicket = new Map<string, { body: string; created_at: string }>();
    for (const message of latestMessages || []) {
      const key = String(message.ticket_id);
      if (!latestByTicket.has(key)) latestByTicket.set(key, message);
    }
    return NextResponse.json({
      notifications: openTickets.map(ticket => {
        const latestMessage = latestByTicket.get(String(ticket.id));
        return {
          id: `merchant-ticket-${ticket.id}`,
          label: `Merchant message · ${ticket.customer_name || 'Merchant'}`,
          meta: `${ticket.subject || 'Support request'}: ${(latestMessage?.body || ticket.description || '').slice(0, 180)}`,
          created_at: latestMessage?.created_at || ticket.updated_at || ticket.created_at,
          url: '/lord/support'
        };
      })
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }

  const ticketId = searchParams.get('ticketId');
  if (!isTicketId(ticketId)) return NextResponse.json({ error: 'A valid merchant support ticket is required.' }, { status: 400 });

  const { data: ticket, error: ticketError } = await access.client
    .from('support_tickets')
    .select('id,merchant_application_id,customer_name,customer_email,subject,description,created_at')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) {
    console.error('[AdminMerchantSupport] Could not load merchant ticket:', ticketError);
    return NextResponse.json({ error: 'The merchant support conversation could not be loaded.' }, { status: 503 });
  }
  if (!ticket?.merchant_application_id) {
    return NextResponse.json({ error: 'Merchant support ticket not found.' }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await access.client
    .from('merchant_support_messages')
    .select('id,sender_role,sender_name,body,created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (messagesError) {
    console.error('[AdminMerchantSupport] Could not load conversation messages:', messagesError);
    return NextResponse.json({
      error: /merchant_support_messages|schema cache/i.test(messagesError.message)
        ? 'Merchant messaging is not installed. Apply supabase/MERCHANT_SUPPORT_HISTORY_MIGRATION.sql.'
        : 'The merchant support conversation could not be loaded.'
    }, { status: 503 });
  }

  const thread = ticket.description ? [{
    id: `initial-${ticket.id}`,
    senderRole: 'merchant',
    senderName: ticket.customer_name || 'Merchant',
    body: ticket.description,
    createdAt: ticket.created_at
  }] : [];
  thread.push(...(messages || []).map(message => ({
    id: message.id,
    senderRole: message.sender_role,
    senderName: message.sender_name,
    body: message.body,
    createdAt: message.created_at
  })));
  return NextResponse.json({ messages: thread }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Merchant replies must come from this website.' }, { status: 403 });
  }
  const access = await getAdminDatabase();
  if ('response' in access) return access.response;

  let body: { ticketId?: unknown; message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid reply is required.' }, { status: 400 });
  }
  const ticketId = normalizeTicketId(body.ticketId);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!ticketId || message.length < 1 || message.length > 4000) {
    return NextResponse.json({ error: 'Choose a valid ticket and enter a reply of up to 4,000 characters.' }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await access.client
    .from('support_tickets')
    .select('id,merchant_application_id,customer_name,customer_email,subject')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) {
    console.error('[AdminMerchantSupport] Could not verify merchant ticket:', ticketError);
    return NextResponse.json({ error: 'The merchant support ticket could not be verified.' }, { status: 503 });
  }
  if (!ticket?.merchant_application_id) {
    return NextResponse.json({ error: 'Merchant support ticket not found.' }, { status: 404 });
  }

  const senderName = access.session.email?.trim().slice(0, 120) || 'OnBar Founder';
  const { data: savedMessage, error: messageError } = await access.client
    .from('merchant_support_messages')
    .insert({
      ticket_id: ticket.id,
      sender_role: 'admin',
      sender_name: senderName,
      body: message
    })
    .select('id,sender_role,sender_name,body,created_at')
    .single();
  if (messageError || !savedMessage) {
    console.error('[AdminMerchantSupport] Could not save admin reply:', messageError);
    return NextResponse.json({
      error: messageError && /merchant_support_messages|schema cache/i.test(messageError.message)
        ? 'Merchant messaging is not installed. Apply supabase/MERCHANT_SUPPORT_HISTORY_MIGRATION.sql.'
        : 'The reply could not be saved.'
    }, { status: 503 });
  }

  const warnings: string[] = [];
  const { error: updateError } = await access.client
    .from('support_tickets')
    .update({ admin_response: message, status: 'Resolved', updated_at: new Date().toISOString() })
    .eq('id', ticket.id);
  if (updateError) {
    console.error('[AdminMerchantSupport] Reply saved, but ticket status could not be updated:', updateError);
    warnings.push('The reply was saved, but the ticket status could not be updated.');
  }

  const merchantEmail = ticket.customer_email?.trim();
  if (!merchantEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merchantEmail)) {
    warnings.push('The reply was saved, but this merchant has no valid email for an alert.');
  } else {
    try {
      const emailConfig = getTransactionalEmailConfig();
      if (!emailConfig.configured) {
        warnings.push('The reply was saved, but email alerts are not configured yet.');
      } else {
        await sendTransactionalEmail({
          from: emailConfig.from,
          to: merchantEmail,
          subject: `OnBar replied · ${ticket.subject || 'Merchant support'}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#152238">
            <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e79a00;text-transform:uppercase">Online Bar · Merchant support</p>
            <h1 style="font-size:24px;margin:12px 0">A reply is waiting for ${escapeHtml(ticket.customer_name || 'your business')}</h1>
            <p><b>Subject:</b> ${escapeHtml(ticket.subject || 'Merchant support')}</p>
            <div style="white-space:pre-wrap;background:#f5f7fa;border-radius:12px;padding:16px;margin:20px 0">${escapeHtml(message)}</div>
            <a href="${escapeHtml(getPublicBaseUrl())}/merchant/network" style="display:inline-block;background:#f5a000;color:#101827;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Open merchant support</a>
          </div>`,
          text: `Online Bar replied to your merchant support request "${ticket.subject || 'Merchant support'}":\n\n${message}\n\nOpen your merchant workspace: ${getPublicBaseUrl()}/merchant/network`,
          idempotencyKey: `merchant-support-admin-reply-${savedMessage.id}`
        });
      }
    } catch (emailError) {
      console.error('[AdminMerchantSupport] Reply saved, but merchant email alert failed:', emailError);
      warnings.push('The reply was saved, but the merchant email alert could not be sent.');
    }
  }

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
