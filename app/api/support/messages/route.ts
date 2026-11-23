import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPublicBaseUrl } from '@/lib/utils';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

async function getAdminEmail(database: ReturnType<typeof getDatabase>) {
  if (!database) return '';
  const configured = process.env.ADMIN_EMAIL?.trim();
  if (configured) return configured;
  const { data, error } = await database
    .from('settings')
    .select('value')
    .eq('key', 'contact')
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.value?.email === 'string' ? data.value.email.trim() : '';
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
  const allowedSubjects = new Set([
    'CORPORATE_INQUIRY',
    'Feature request',
    'General inquiry',
    'Product or wholesale question',
    'Partnership or corporate inquiry',
    'Something else',
    'In-App Support Ticket'
  ]);
  const subject = typeof body.subject === 'string' && allowedSubjects.has(body.subject)
    ? body.subject
    : 'In-App Support Ticket';
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
  const { data: savedMessage, error } = await database.from('messages').insert({
    name,
    email,
    user_id: customerId,
    subject,
    message,
    status: 'New',
    customer_token_hash: await hashToken(token)
  }).select('id').single();
  if (error) {
    console.error('[CustomerSupport] Could not save support message:', error);
    return NextResponse.json({ error: `Could not save your message: ${error.message}` }, { status: 500 });
  }
  if (!savedMessage) {
    return NextResponse.json({ error: 'Could not save your message.' }, { status: 500 });
  }
  let emailSent = false;
  let emailWarning: string | undefined;
  try {
    const recipient = await getAdminEmail(database);
    const emailConfig = getTransactionalEmailConfig();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      emailWarning = 'Your message is in the admin inbox, but the admin email recipient is not configured.';
    } else if (!emailConfig.configured) {
      emailWarning = 'Your message is in the admin inbox, but email alerts are not configured yet.';
    } else {
      await sendTransactionalEmail({
        from: emailConfig.from,
        to: recipient,
        replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
        subject: `New customer inquiry: ${subject}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#152238">
          <p style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e79a00;text-transform:uppercase">Online Bar · Customer inquiry</p>
          <h1 style="font-size:24px;margin:12px 0">${escapeHtml(subject)}</h1>
          <p><b>Message:</b> #${savedMessage.id}</p>
          <p><b>From:</b> ${escapeHtml(name)}${email ? ` &lt;${escapeHtml(email)}&gt;` : ''}</p>
          <div style="white-space:pre-wrap;background:#f5f7fa;border-radius:12px;padding:16px;margin:20px 0">${escapeHtml(message)}</div>
          <a href="${escapeHtml(getPublicBaseUrl())}/lord/messages" style="display:inline-block;background:#f5a000;color:#101827;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Open support inbox</a>
        </div>`,
        text: `Online Bar · Customer inquiry\nTopic: ${subject}\nMessage: #${savedMessage.id}\nFrom: ${name}${email ? ` <${email}>` : ''}\n\n${message}\n\nOpen support inbox: ${getPublicBaseUrl()}/lord/messages`,
        idempotencyKey: `customer-support-${savedMessage.id}`
      });
      emailSent = true;
    }
  } catch (notificationError) {
    console.error('[CustomerSupport] Message saved, but admin email alert failed:', notificationError);
    emailWarning = 'Your message is in the admin inbox, but the email alert could not be sent.';
  }

  return NextResponse.json({ success: true, messageId: savedMessage.id, emailSent, emailWarning });
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
