import { NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getPublicBaseUrl } from '@/lib/utils';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

export const dynamic = 'force-dynamic';

const categories = ['Order & payment', 'Delivery', 'Product question', 'Wholesale', 'Other'];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function requestAddress(request: Request) {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 100);
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor ? forwardedFor.slice(0, 100) : 'unknown';
}

async function getNotificationRecipient(database: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim();
  if (configuredAdminEmail) return configuredAdminEmail;

  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'contact')
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw error;

  const email = data?.value?.email;
  return typeof email === 'string' ? email.trim() : '';
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Message submissions must come from this website.' }, { status: 403 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 12_000) {
    return NextResponse.json({ error: 'Your message is too large. Please shorten it and try again.' }, { status: 413 });
  }

  let body: {
    name?: unknown;
    email?: unknown;
    subject?: unknown;
    message?: unknown;
    category?: unknown;
    website?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Please complete the contact form and try again.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const website = typeof body.website === 'string' ? body.website.trim() : '';

  if (website) {
    return NextResponse.json({ error: 'Please submit the form without filling in hidden fields.' }, { status: 400 });
  }
  if (
    name.length < 1 || name.length > 120
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || subject.length < 3 || subject.length > 160
    || message.length < 10 || message.length > 4000
    || !categories.includes(category)
  ) {
    return NextResponse.json({ error: 'Check your name, email, topic, subject, and message before sending.' }, { status: 400 });
  }

  const database = createServerSupabaseClient();
  if (!database) {
    return NextResponse.json({ error: 'The support form is temporarily unavailable. Please try WhatsApp or email us directly.' }, { status: 503 });
  }

  const { data: allowed, error: rateLimitError } = await database.rpc('allow_rider_login_attempt', {
    identity_input: `contact-message:${requestAddress(request)}`
  });
  if (rateLimitError) {
    console.error('[ContactMessage] Could not check message rate limit:', rateLimitError);
    return NextResponse.json({ error: 'The support form is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ error: 'Too many messages were sent from this connection. Please try again in 15 minutes.' }, { status: 429 });
  }

  const { data: ticket, error: ticketError } = await database.from('support_tickets')
    .insert({
      customer_name: name,
      customer_email: email,
      subject,
      description: message,
      category,
      priority: 'Medium',
      status: 'Open'
    })
    .select('id')
    .single();

  if (ticketError || !ticket) {
    console.error('[ContactMessage] Could not save support ticket:', ticketError);
    return NextResponse.json({ error: 'Your message could not be saved. Please try again or contact us directly.' }, { status: 503 });
  }

  let emailSent = false;
  let emailWarning: string | undefined;
  const emailConfig = getTransactionalEmailConfig();
  try {
    const recipient = await getNotificationRecipient(database);
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      emailWarning = 'The support ticket is saved in the admin panel, but the notification recipient is not configured.';
    } else if (!emailConfig.configured) {
      emailWarning = 'The support ticket is saved in the admin panel, but email alerts are not configured yet.';
    } else {
      await sendTransactionalEmail({
        from: emailConfig.from,
        to: recipient,
        replyTo: email,
        subject: `New website enquiry: ${subject}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#152238">
          <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e79a00;text-transform:uppercase">Online Bar · New support enquiry</p>
          <h1 style="font-size:24px;margin:12px 0">A customer sent a message</h1>
          <p><b>Ticket:</b> ${escapeHtml(ticket.id)}</p>
          <p><b>Topic:</b> ${escapeHtml(category)}</p>
          <p><b>From:</b> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
          <p><b>Subject:</b> ${escapeHtml(subject)}</p>
          <div style="white-space:pre-wrap;background:#f5f7fa;border-radius:12px;padding:16px;margin:20px 0">${escapeHtml(message)}</div>
          <a href="${escapeHtml(getPublicBaseUrl())}/lord/support" style="display:inline-block;background:#f5a000;color:#101827;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Open support workspace</a>
        </div>`,
        text: `Online Bar · New support enquiry\nTicket: ${ticket.id}\nTopic: ${category}\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}\n\nOpen support workspace: ${getPublicBaseUrl()}/lord/support`,
        idempotencyKey: `support-ticket-${ticket.id}`
      });
      emailSent = true;
    }
  } catch (error) {
    console.error('[ContactMessage] Ticket saved, but admin email alert failed:', error);
    emailWarning = 'The support ticket is saved in the admin panel, but its email alert could not be sent.';
  }

  return NextResponse.json({ success: true, ticketId: ticket.id, emailSent, emailWarning });
}
