import { NextResponse } from 'next/server';
import { getAdminSession, isSameOriginRequest } from '@/lib/adminAccess.server';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { generateTicketEmailPreview, getTicketEmailSettings } from '@/lib/ticketing/email.server';
import { isTicketThemeId } from '@/lib/ticketing/theme';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session || !['owner', 'admin'].includes(session.role.toLowerCase())) {
    return NextResponse.json({ error: 'Owner or admin access is required to send a preview.' }, { status: 403 });
  }

  let body: { theme?: unknown; recipient?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'A valid email preview request is required.' }, { status: 400 });
  }
  const theme = isTicketThemeId(body.theme) ? body.theme : 'midnight';
  const recipient = typeof body.recipient === 'string' && body.recipient.trim()
    ? body.recipient.trim().toLowerCase()
    : session.email?.trim().toLowerCase();
  if (!recipient || recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return NextResponse.json({ error: 'Enter a valid test recipient email address.' }, { status: 400 });
  }
  const config = getTransactionalEmailConfig();
  if (!config.configured || !config.from) {
    return NextResponse.json({ error: 'Configure JMSURF_MAIL_KEY and a verified JMSURF_FROM_EMAIL on this deployment.' }, { status: 503 });
  }

  try {
    const database = createServerSupabaseClient();
    const emailSettings = await getTicketEmailSettings(database);
    const preview = await generateTicketEmailPreview(theme, emailSettings);
    await sendTransactionalEmail({
      from: config.from,
      to: recipient,
      subject: `[TEST] ${preview.subject}`,
      html: preview.html,
      text: preview.text,
      attachments: preview.attachments
    });
    return NextResponse.json({ status: 'sent', sentTo: recipient }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' }
    });
  } catch (error) {
    console.error('[TicketingEmailPreview] Could not send admin preview:', error);
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : 'Sample email could not be sent. Check JMSURF sender/domain configuration and deployment logs.'
    }, { status: 503 });
  }
}
