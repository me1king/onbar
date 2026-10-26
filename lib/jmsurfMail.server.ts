import 'server-only';

import { Resend } from 'resend';

export interface TransactionalEmail {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  idempotencyKey?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | Uint8Array | string;
    contentType?: string;
    contentId?: string;
  }>;
}

export function getTransactionalEmailConfig() {
  const jmsurfKey = process.env.JMSURF_MAIL_KEY?.trim();
  const jmsurfFrom = process.env.JMSURF_FROM_EMAIL?.trim();
  if (jmsurfKey) {
    return { provider: 'JMSURF Mail' as const, from: jmsurfFrom || '', configured: Boolean(jmsurfFrom) };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (resendKey && resendFrom) {
    return { provider: 'Resend' as const, from: resendFrom, configured: true };
  }
  return {
    provider: null,
    from: jmsurfFrom || resendFrom || '',
    configured: false
  };
}

export async function sendTransactionalEmail(email: TransactionalEmail) {
  const jmsurfKey = process.env.JMSURF_MAIL_KEY?.trim();
  const jmsurfFrom = process.env.JMSURF_FROM_EMAIL?.trim();
  const from = email.from?.trim() || jmsurfFrom || process.env.RESEND_FROM_EMAIL?.trim() || '';
  if (!from || !/^(?:[^<>]+<[^<>@\s]+@[^<>@\s]+>|[^<>\s@]+@[^<>\s@]+)$/.test(from)) {
    throw new Error('Email sender is missing or invalid. Configure JMSURF_FROM_EMAIL with a verified sender.');
  }

  if (jmsurfKey) {
    if (!jmsurfFrom) throw new Error('JMSURF_FROM_EMAIL is required when using JMSURF_MAIL_KEY.');
    let html = email.html;
    const attachments = (email.attachments || []).map(attachment => {
      const content = Buffer.isBuffer(attachment.content)
        ? attachment.content
        : Buffer.from(attachment.content);
      const base64 = content.toString('base64');
      if (attachment.contentId) {
        const contentType = attachment.contentType || 'application/octet-stream';
        html = html.replaceAll(
          `cid:${attachment.contentId}`,
          `data:${contentType};base64,${base64}`
        );
      }
      return { attachment, base64 };
    });
    const response = await fetch('https://api.jmsurfmail.co.ke/api/v1/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jmsurfKey}`,
        'Content-Type': 'application/json',
        ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {})
      },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: email.subject,
        html,
        ...(email.text ? { text: email.text } : {}),
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        ...(attachments.some(({ attachment }) => !attachment.contentId) ? {
          attachments: attachments
            .filter(({ attachment }) => !attachment.contentId)
            .map(({ attachment, base64 }) => ({
              filename: attachment.filename,
              content: base64,
              ...(attachment.contentType ? { content_type: attachment.contentType } : {})
            }))
        } : {})
      }),
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      console.error('[TransactionalEmail] JMSURF Mail rejected email:', response.status);
      throw new Error(`JMSURF Mail rejected the email (HTTP ${response.status}). Check the API key, verified sender, and provider logs.`);
    }
    const result: unknown = await response.json();
    const messageId = typeof result === 'object' && result !== null
      && 'id' in result && typeof result.id === 'string'
      ? result.id
      : undefined;
    return { provider: 'JMSURF Mail' as const, messageId };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    throw new Error('Email is not configured. Set JMSURF_MAIL_KEY and JMSURF_FROM_EMAIL in the deployment environment.');
  }
  const resend = new Resend(resendKey);
  const result = await resend.emails.send({
    from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    ...(email.text ? { text: email.text } : {}),
    ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    ...(email.attachments?.length ? {
      attachments: email.attachments.map(attachment => ({
        ...attachment,
        content: typeof attachment.content === 'string' || Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content)
      }))
    } : {})
  }, email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined);
  if (result.error) throw result.error;
  return { provider: 'Resend' as const, messageId: result.data?.id };
}
