import { resolveTxt } from 'node:dns/promises';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { getTransactionalEmailConfig, sendTransactionalEmail, withTransactionalEmailSenderName } from '@/lib/jmsurfMail.server';
import { getPublicBaseUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authorize() {
  const session = await getAdminSession();
  if (!session) return { response: NextResponse.json({ error: 'Admin access is required.' }, { status: 401 }) };
  if (!hasAdminPermission(session, 'can_manage_communications')) {
    return { response: NextResponse.json({ error: 'Communications permission required.' }, { status: 403 }) };
  }
  const database = createServerSupabaseClient();
  if (!database) return { response: NextResponse.json({ error: 'Admin database access is not configured.' }, { status: 503 }) };
  return { database, session };
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205'
    || /email_command_center_messages|email_suppressions/i.test(error.message || '')));
}

function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function renderCommandCenterEmail(input: {
  subject: string;
  name: string;
  message: string;
  actionLink?: string;
}) {
  const paragraphs = input.message.split(/\n{2,}/).map(paragraph =>
    `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7">${escapeEmailHtml(paragraph).replace(/\n/g, '<br>')}</p>`
  ).join('');
  const button = input.actionLink
    ? `<tr><td align="center" style="padding:8px 28px 28px"><a href="${escapeEmailHtml(input.actionLink)}" style="display:inline-block;background:#f59e0b;border-radius:12px;color:#1c140d;font-size:15px;font-weight:700;padding:15px 25px;text-decoration:none">Continue onboarding</a></td></tr>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeEmailHtml(input.subject)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
      <tr><td style="background:#1c140d;padding:22px 28px;color:#ffffff"><p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px">ONLINE BAR KENYA</p></td></tr>
      <tr><td style="padding:32px 28px 8px"><p style="margin:0 0 10px;color:#a39682;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">A message from Online Bar</p>
        <h1 style="margin:0 0 20px;color:#1c140d;font-size:26px;line-height:1.25">${escapeEmailHtml(input.subject)}</h1>
        <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7">Hello ${escapeEmailHtml(input.name || 'there')},</p>${paragraphs}
      </td></tr>
      ${button}
      <tr><td style="border-top:1px solid #e2e8f0;padding:20px 28px 26px"><p style="margin:0;color:#64748b;font-size:12px;line-height:1.6">Online Bar Kenya · onlinebar.co.ke</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function getDomainHealth() {
  const domain = 'onlinebar.co.ke';
  const selector = process.env.JMSURF_DKIM_SELECTOR?.trim() || '';
  const readTxt = async (hostname: string) => {
    try {
      return (await resolveTxt(hostname)).map(parts => parts.join(''));
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error
        && ['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes(String(error.code))) return [];
      throw error;
    }
  };
  try {
    const [rootRecords, dmarcRecords, dkimRecords] = await Promise.all([
      readTxt(domain),
      readTxt(`_dmarc.${domain}`),
      selector && /^[a-zA-Z0-9._-]{1,63}$/.test(selector)
        ? readTxt(`${selector}._domainkey.${domain}`)
        : Promise.resolve([])
    ]);
    return {
      domain,
      spf: rootRecords.find(record => /^v=spf1\b/i.test(record)) ? 'configured' : 'missing',
      dmarc: dmarcRecords.find(record => /^v=DMARC1\b/i.test(record)) ? 'configured' : 'missing',
      dkim: !selector ? 'selector_required' : dkimRecords.some(record => /^(?:v=DKIM1|p=)/i.test(record)) ? 'configured' : 'missing',
      dkimSelector: selector || null,
      error: null
    };
  } catch (error) {
    console.error('[EmailCommandCenter] Public DNS authentication checks failed:', error);
    return {
      domain,
      spf: 'lookup_failed',
      dmarc: 'lookup_failed',
      dkim: selector ? 'lookup_failed' : 'selector_required',
      dkimSelector: selector || null,
      error: 'DNS lookup failed. Verify the app server DNS resolver and retry.'
    };
  }
}

export async function GET() {
  const access = await authorize();
  if ('response' in access) return access.response;

  const { database } = access;
  const [ordersResult, newsletterResult, waitlistResult, riderEmailResult, messagesResult, webhookResult, suppressionResult, orderEmailResult, campaignEmailResult, ticketEmailResult, domainHealth] = await Promise.all([
    (async () => {
      const rows: { id: number; customer_name: string | null; customer_email: string | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await database.from('orders')
          .select('id,customer_name,customer_email')
          .not('customer_email', 'is', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + 999);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < 1000) return { data: rows, error: null };
      }
    })(),
    (async () => {
      const rows: { email: string }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await database.from('newsletter_subscribers')
          .select('email').eq('is_active', true).order('id').range(offset, offset + 999);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < 1000) return { data: rows, error: null };
      }
    })(),
    (async () => {
      const rows: { email: string }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await database.from('market_waitlist')
          .select('email')
          .eq('email_updates_consent', true)
          .neq('status', 'UNSUBSCRIBED')
          .is('unsubscribed_at', null)
          .order('id')
          .range(offset, offset + 999);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < 1000) return { data: rows, error: null };
      }
    })(),
    (async () => {
      const rows: { rider_name: string | null; rider_email: string | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await database.from('rider_status')
          .select('rider_name,rider_email')
          .not('rider_email', 'is', null)
          .order('rider_name')
          .range(offset, offset + 999);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < 1000) return { data: rows, error: null };
      }
    })(),
    database.from('email_command_center_messages')
      .select('id,recipient_email,recipient_name,subject,category,status,provider_message_id,error_message,sent_by,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    database.from('jmsurf_email_webhook_events')
      .select('event_id,event_type,provider_message_id,provider_created_at,received_at')
      .order('received_at', { ascending: false })
      .limit(100),
    database.from('email_suppressions').select('email,reason,source,created_at').order('created_at', { ascending: false }).limit(1000),
    database.from('customer_notification_deliveries')
      .select('id,order_id,notification_status,delivery_status,error_message,provider_delivery_status,created_at')
      .eq('channel', 'email')
      .order('created_at', { ascending: false })
      .limit(100),
    database.from('message_campaign_deliveries')
      .select('id,recipient_email,status,error_message,provider_delivery_status,created_at')
      .not('recipient_email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    database.from('ticketing_email_deliveries')
      .select('order_id,status,last_error,provider_delivery_status,updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),
    getDomainHealth()
  ]);

  const seen = new Map<string, { email: string; name: string; sources: Set<string> }>();
  const addContact = (emailValue: string | null, name: string, source: string) => {
    const email = (emailValue || '').trim().toLowerCase();
    if (!emailPattern.test(email)) return;
    const current = seen.get(email) || { email, name, sources: new Set<string>() };
    if (name && current.name === 'Customer') current.name = name;
    current.sources.add(source);
    seen.set(email, current);
  };
  for (const order of ordersResult.data || []) addContact(order.customer_email, order.customer_name || 'Customer', 'Order');
  for (const subscriber of newsletterResult.data || []) addContact(subscriber.email, 'Newsletter subscriber', 'Marketing opted in');
  for (const member of waitlistResult.data || []) addContact(member.email, 'Waitlist member', 'Waitlist email opted in');
  for (const rider of riderEmailResult.data || []) addContact(rider.rider_email, rider.rider_name || 'Rider', 'Rider');

  const ticketOrderIds = (ticketEmailResult.data || []).map(delivery => delivery.order_id);
  const ticketOrdersResult = ticketOrderIds.length
    ? await database.from('ticketing_orders').select('id,buyer_email,buyer_name').in('id', ticketOrderIds)
    : { data: [], error: null };
  const orderById = new Map((ordersResult.data || []).map(order => [order.id, order]));
  const ticketOrderById = new Map((ticketOrdersResult.data || []).map(order => [order.id, order]));
  const automatedMessages = [
    ...(orderEmailResult.data || []).map(item => {
      const order = orderById.get(item.order_id);
      return {
        id: `order-${item.id}`,
        recipient_email: order?.customer_email || '',
        recipient_name: order?.customer_name || null,
        subject: `Order ${item.order_id}: ${item.notification_status}`,
        category: 'order_automation',
        status: item.provider_delivery_status || item.delivery_status,
        error_message: item.error_message,
        sent_by: null,
        created_at: item.created_at
      };
    }),
    ...(campaignEmailResult.data || []).map(item => ({
      id: `campaign-${item.id}`,
      recipient_email: item.recipient_email || '',
      recipient_name: null,
      subject: 'Promotional email campaign',
      category: 'marketing_campaign',
      status: item.provider_delivery_status || item.status,
      error_message: item.error_message,
      sent_by: null,
      created_at: item.created_at
    })),
    ...(ticketEmailResult.data || []).map(item => {
      const order = ticketOrderById.get(item.order_id);
      return {
        id: `ticket-${item.order_id}`,
        recipient_email: order?.buyer_email || '',
        recipient_name: order?.buyer_name || null,
        subject: `Ticket order ${item.order_id}`,
        category: 'ticket_receipt',
        status: item.provider_delivery_status || item.status,
        error_message: item.last_error,
        sent_by: null,
        created_at: item.updated_at
      };
    })
  ];
  const messageLogs = [
    ...(messagesResult.data || []),
    ...automatedMessages.filter(item => item.recipient_email)
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 200);

  const sourceErrors = [
    ordersResult.error && 'Order contacts could not be loaded.',
    newsletterResult.error && 'Newsletter contacts could not be loaded.',
    waitlistResult.error && 'Waitlist contacts could not be loaded.',
    riderEmailResult.error && (/rider_email/i.test(riderEmailResult.error.message || '')
      ? 'Rider email contacts are unavailable; apply supabase/RIDER_EMAIL_COMMUNICATIONS_MIGRATION.sql.'
      : 'Rider email contacts could not be loaded.'),
    orderEmailResult.error && (/provider_(?:delivery_status|updated_at|message_id)/i.test(orderEmailResult.error.message || '')
      ? 'Order email status fields are missing; check JMSURF_EMAIL_WEBHOOK_MIGRATION.sql.'
      : 'Order notification history could not be loaded; check CUSTOMER_NOTIFICATION_AUTOMATION_MIGRATION.sql.'),
    campaignEmailResult.error && (/provider_(?:delivery_status|updated_at|message_id)/i.test(campaignEmailResult.error.message || '')
      ? 'Campaign email status fields are missing; check JMSURF_EMAIL_WEBHOOK_MIGRATION.sql.'
      : 'Campaign email history could not be loaded; check CRM_CONSENT_MESSAGING_MIGRATION.sql.'),
    ticketEmailResult.error && (/provider_(?:delivery_status|updated_at|message_id)/i.test(ticketEmailResult.error.message || '')
      ? 'Ticket email status fields are missing; check JMSURF_EMAIL_WEBHOOK_MIGRATION.sql.'
      : 'Ticket email history could not be loaded; check TICKETING_EMAIL_DELIVERY_MIGRATION.sql.'),
    ticketOrdersResult.error && 'Ticket email recipients could not be resolved.'
  ].filter(Boolean);
  const migrationFiles = new Set<string>();
  if (isMissingTable(messagesResult.error) || isMissingTable(suppressionResult.error)) {
    migrationFiles.add('supabase/EMAIL_COMMAND_CENTER_MIGRATION.sql');
  }
  if (riderEmailResult.error && /rider_email/i.test(riderEmailResult.error.message || '')) {
    migrationFiles.add('supabase/RIDER_EMAIL_COMMUNICATIONS_MIGRATION.sql');
  }
  const providerSchemaError = [
    orderEmailResult.error,
    campaignEmailResult.error,
    ticketEmailResult.error,
    webhookResult.error
  ].some(error => Boolean(error && /provider_(?:delivery_status|updated_at|message_id)|jmsurf_email_webhook_events/i.test(error.message || '')));
  if (isMissingTable(webhookResult.error) || providerSchemaError) {
    migrationFiles.add('supabase/JMSURF_EMAIL_WEBHOOK_MIGRATION.sql');
  }
  const missingCommandCenterMigration = migrationFiles.size > 0;
  const canSend = !isMissingTable(messagesResult.error) && !isMissingTable(suppressionResult.error);

  return NextResponse.json({
    provider: getTransactionalEmailConfig(),
    contacts: [...seen.values()]
      .map(contact => ({ ...contact, sources: [...contact.sources] }))
      .sort((a, b) => a.email.localeCompare(b.email)),
    messages: messageLogs,
    webhookEvents: webhookResult.data || [],
    suppressions: suppressionResult.data || [],
    domainHealth,
    migrationRequired: missingCommandCenterMigration,
    migrationFiles: [...migrationFiles],
    canSend,
    sourceErrors,
    sourceStatus: {
      orders: !ordersResult.error,
      newsletter: !newsletterResult.error,
      waitlist: !waitlistResult.error
    }
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const access = await authorize();
  if ('response' in access) return access.response;

  let body: { type?: unknown; email?: unknown; name?: unknown; subject?: unknown; message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid email request is required.' }, { status: 400 });
  }
  const type = body.type === 'driver_invite' ? 'driver_invite' : body.type === 'operational' ? 'operational' : null;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const subject = type === 'driver_invite'
    ? 'Your Online Bar driver onboarding link'
    : typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = type === 'driver_invite'
    ? 'Use the secure, one-time link in this email to verify your email and continue Online Bar driver onboarding.'
    : typeof body.message === 'string' ? body.message.trim() : '';

  if (!type || !emailPattern.test(email) || email.length > 254
    || !subject || subject.length > 180 || !message || message.length > 5000) {
    return NextResponse.json({ error: 'Enter a valid recipient, subject, and message. Messages must be under 5,000 characters.' }, { status: 400 });
  }

  const config = getTransactionalEmailConfig();
  if (!config.configured || !config.from) {
    return NextResponse.json({
      error: 'Email is not configured. Set JMSURF_MAIL_KEY and JMSURF_FROM_EMAIL, or RESEND_API_KEY and RESEND_FROM_EMAIL, in the deployment environment.'
    }, { status: 503 });
  }

  const { data: suppression, error: suppressionError } = await access.database
    .from('email_suppressions')
    .select('reason')
    .eq('email', email)
    .maybeSingle();
  if (suppressionError) {
    if (isMissingTable(suppressionError)) {
      return NextResponse.json({ error: 'Apply supabase/EMAIL_COMMAND_CENTER_MIGRATION.sql before sending from Email Command Center.' }, { status: 503 });
    }
    console.error('[EmailCommandCenter] Could not check email suppression:', suppressionError);
    return NextResponse.json({ error: 'The recipient suppression status could not be checked, so the email was not sent.' }, { status: 503 });
  }
  if (suppression) {
    return NextResponse.json({ error: `This address is suppressed (${suppression.reason}) and cannot receive email.` }, { status: 409 });
  }

  const loggedMessage = type === 'driver_invite' ? 'Secure one-time driver onboarding link issued.' : message;
  const { data: log, error: logError } = await access.database.from('email_command_center_messages')
    .insert({
      recipient_email: email,
      recipient_name: name || null,
      subject,
      message: loggedMessage,
      category: type,
      status: 'sending',
      sent_by: access.session.email || access.session.role
    })
    .select('id')
    .single();
  if (logError || !log) {
    console.error('[EmailCommandCenter] Could not create the message audit record:', logError);
    return NextResponse.json({
      error: isMissingTable(logError)
        ? 'Apply supabase/EMAIL_COMMAND_CENTER_MIGRATION.sql before sending from Email Command Center.'
        : 'The email audit record could not be created, so the email was not sent.'
    }, { status: 503 });
  }

  try {
    let deliveryText = message;
    let actionLink: string | undefined;
    if (type === 'driver_invite') {
      const redirectTo = new URL('/rider/onboarding', getPublicBaseUrl()).toString();
      const { data, error } = await access.database.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo }
      });
      if (error) throw new Error(error.message);
      const invitationLink = data.properties?.action_link;
      if (!invitationLink || !invitationLink.startsWith('https://')) throw new Error('Supabase did not return a secure invitation link.');
      actionLink = invitationLink;
      deliveryText = `${message}\n\nContinue driver onboarding: ${invitationLink}\n\nThis one-time link expires according to the authentication policy. If you did not expect this message, you can ignore it.`;
    }
    const result = await sendTransactionalEmail({
      from: withTransactionalEmailSenderName(config.from, 'Online Bar'),
      to: email,
      subject,
      text: deliveryText,
      html: renderCommandCenterEmail({ subject, name, message, actionLink }),
      idempotencyKey: `email-center-${log.id}`
    });
    const { error: updateError } = await access.database.from('email_command_center_messages')
      .update({
        status: 'sent',
        provider_message_id: result.messageId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', log.id);
    if (updateError) {
      console.error('[EmailCommandCenter] Email sent, but its audit record could not be updated:', updateError);
      return NextResponse.json({ error: 'Email was sent, but the delivery record could not be updated. Check Email Command Center before retrying.', sent: true }, { status: 502 });
    }
    return NextResponse.json({ sent: true, id: log.id, provider: result.provider });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Email provider could not send the message.';
    const { error: updateError } = await access.database.from('email_command_center_messages')
      .update({ status: 'failed', error_message: detail.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq('id', log.id);
    if (updateError) console.error('[EmailCommandCenter] Failed email could not be recorded:', updateError);
    console.error('[EmailCommandCenter] Message delivery failed:', error);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
