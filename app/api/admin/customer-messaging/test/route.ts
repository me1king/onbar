import { NextResponse } from 'next/server';
import { getAdminSession, hasAdminPermission, isSameOriginRequest } from '@/lib/adminAccess.server';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import {
  CUSTOMER_NOTIFICATION_STATUSES,
  DEFAULT_CUSTOMER_NOTIFICATION_CONFIG,
  isValidCustomerEmailDesign,
  type CustomerNotificationRule,
  type CustomerNotificationStatus
} from '@/lib/customerMessaging';
import { renderCustomerOrderEmail, renderCustomerOrderEmailText } from '@/lib/customerOrderEmail';

export const dynamic = 'force-dynamic';

type TestMessage = {
  channel?: unknown;
  subject?: unknown;
  message?: unknown;
  phone?: unknown;
  email?: unknown;
  status?: unknown;
  emailDesign?: unknown;
};

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  return digits;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session || !hasAdminPermission(session, 'can_manage_communications')) {
    return NextResponse.json({ error: 'Communications permission required.' }, { status: 403 });
  }

  let body: TestMessage;
  try {
    body = await request.json() as TestMessage;
  } catch {
    return NextResponse.json({ error: 'A valid test message is required.' }, { status: 400 });
  }
  if (!['email', 'whatsapp', 'sms'].includes(String(body.channel))) {
    return NextResponse.json({ error: 'Choose email, WhatsApp, or SMS for a test. Push alerts can be tested from the signed-in customer profile.' }, { status: 400 });
  }
  const channel = body.channel as 'email' | 'whatsapp' | 'sms';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 2000 || (channel === 'email' && (!subject || subject.length > 180))) {
    return NextResponse.json({ error: 'The test subject or message is empty or too long.' }, { status: 400 });
  }

  try {
    if (channel === 'email') {
      const destination = typeof body.email === 'string' ? body.email.trim().toLowerCase() : session.email?.trim().toLowerCase();
      if (!destination || destination.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
        return NextResponse.json({ error: 'Enter a valid test recipient email address.' }, { status: 400 });
      }
      const config = getTransactionalEmailConfig();
      if (!config.configured) {
        return NextResponse.json({ error: 'Email is not configured. Set JMSURF_MAIL_KEY and JMSURF_FROM_EMAIL in Vercel.' }, { status: 503 });
      }
      const status = CUSTOMER_NOTIFICATION_STATUSES.includes(body.status as CustomerNotificationStatus)
        ? body.status as CustomerNotificationStatus
        : 'Pending';
      const emailDesign = body.emailDesign === undefined
        ? DEFAULT_CUSTOMER_NOTIFICATION_CONFIG[status]
        : isValidCustomerEmailDesign(body.emailDesign) ? body.emailDesign as Pick<CustomerNotificationRule, 'emailHeadline' | 'emailButtonLabel' | 'emailAccentColor'> : null;
      if (!emailDesign) {
        return NextResponse.json({ error: 'Email headline, button label, or accent color is invalid.' }, { status: 400 });
      }
      const email = {
        headline: emailDesign.emailHeadline,
        buttonLabel: emailDesign.emailButtonLabel,
        accentColor: emailDesign.emailAccentColor,
        message,
        orderId: '1042',
        total: 'KES 2,450.00',
        status,
        trackingUrl: 'https://onlinebar.co.ke/track?id=1042',
        testNotice: 'Messaging Center test · no customer notification was sent.'
      };
      await sendTransactionalEmail({
        from: config.from,
        to: destination,
        subject: `[TEST] ${subject}`,
        text: renderCustomerOrderEmailText(email),
        html: renderCustomerOrderEmail(email)
      });
      return NextResponse.json({ sent: true, channel, destination, provider: config.provider });
    }

    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const phone = normalizePhone(rawPhone);
    if (!/^\d{8,15}$/.test(phone)) {
      return NextResponse.json({ error: 'Enter your own WhatsApp/SMS phone number in international or Kenyan format.' }, { status: 400 });
    }

    if (channel === 'whatsapp') {
      const token = process.env.WHATSAPP_TOKEN?.trim();
      const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
      if (!token || !phoneId) {
        return NextResponse.json({ error: 'WhatsApp is not configured (WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are required).' }, { status: 503 });
      }
      const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: `[TEST] ${message}` }
        })
      });
      if (!response.ok) {
        console.error('[CustomerMessagingTest] WhatsApp provider rejected the test:', response.status);
        throw new Error('WhatsApp provider rejected the test. Check the number, business configuration and messaging window.');
      }
      return NextResponse.json({ sent: true, channel, destination: `+${phone}` });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_PHONE_NUMBER?.trim();
    if (!accountSid || !authToken || !from) {
      return NextResponse.json({ error: 'SMS is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are required).' }, { status: 503 });
    }
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: `+${phone}`, From: from, Body: `[TEST] ${message}` })
    });
    if (!response.ok) {
      console.error('[CustomerMessagingTest] SMS provider rejected the test:', response.status);
      throw new Error('SMS provider rejected the test. Check the number, sender and provider account.');
    }
    return NextResponse.json({ sent: true, channel, destination: `+${phone}` });
  } catch (error) {
    console.error('[CustomerMessagingTest] Could not send test message:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'The provider could not send the test message.'
    }, { status: 502 });
  }
}
