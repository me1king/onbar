import {
  DEFAULT_CUSTOMER_NOTIFICATION_CONFIG,
  type CustomerNotificationStatus
} from '@/lib/customerMessaging';
import { renderCustomerOrderEmail } from '@/lib/customerOrderEmail';

export const LIFECYCLE_EMAIL_PREVIEWS = [
  { id: 'waitlist', label: 'Waitlist launch', subject: 'You’re in. Online Bar is open 🎉' },
  { id: 'order', label: 'Order received', subject: 'We’ve got your order #2091' },
  { id: 'rider', label: 'Rider on the way', subject: 'Your order is on the way' },
  { id: 'delivered', label: 'Delivered', subject: 'Delivered. How did we do?' },
  { id: 'payment', label: 'Payment failed', subject: 'Your order is waiting' },
  { id: 'vendor', label: 'Vendor welcome', subject: 'Welcome to Online Bar, Mama Pima Wines' },
  { id: 'rider-welcome', label: 'Rider welcome', subject: 'Karibu Online Bar riders' }
] as const;

export type LifecycleEmailPreviewId = typeof LIFECYCLE_EMAIL_PREVIEWS[number]['id'];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function renderOnboardingPreview(input: {
  title: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  message: string;
  steps: Array<{ title: string; detail: string }>;
  buttonLabel: string;
  buttonUrl: string;
  note: string;
}) {
  const steps = input.steps.map((step, index) => `
    <tr>
      <td width="42" valign="top" style="padding:9px 0">
        <div style="width:30px;height:30px;line-height:30px;border-radius:50%;background:#f59e0b;color:#1b1300;font:bold 14px Arial,sans-serif;text-align:center">${index + 1}</div>
      </td>
      <td style="padding:9px 0;color:#141a2b;font:15px/1.5 Arial,sans-serif">
        <strong>${escapeHtml(step.title)}</strong><br>
        <span style="color:#667085;font-size:14px">${escapeHtml(step.detail)}</span>
      </td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#eef0f4;font-family:Arial,Helvetica,sans-serif;color:#141a2b">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f4;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
      <tr><td style="background:#0b1020;padding:18px 26px;color:#fff;font:bold 15px Arial,sans-serif;letter-spacing:2px">ONLINE <span style="color:#f59e0b">BAR</span></td></tr>
      <tr><td style="padding:30px 28px 8px;font-family:Arial,sans-serif">
        <div style="color:#d97706;font-size:11px;font-weight:bold;letter-spacing:2px">${escapeHtml(input.eyebrow)}</div>
        <h1 style="margin:10px 0 14px;color:#111827;font-size:30px;line-height:1.2">${escapeHtml(input.headline)}</h1>
        <p style="margin:0;color:#475467;font-size:16px;line-height:1.65">${escapeHtml(input.message)}</p>
      </td></tr>
      <tr><td style="padding:10px 28px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${steps}</table></td></tr>
      <tr><td align="center" style="padding:16px 28px 24px">
        <a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;background:#f59e0b;color:#1b1300;font:bold 15px Arial,sans-serif;text-decoration:none;padding:15px 28px;border-radius:12px">${escapeHtml(input.buttonLabel)}</a>
      </td></tr>
      <tr><td style="padding:0 28px 22px;color:#667085;font:12px/1.65 Arial,sans-serif">${escapeHtml(input.note)}</td></tr>
      <tr><td style="background:#f3f4f6;padding:18px 28px;color:#667085;font:12px/1.65 Arial,sans-serif">Online Bar · Nairobi, Kenya</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderWaitlistCampaignEmail(input: {
  subject: string;
  message: string;
  ticketUrl: string;
  unsubscribeUrl: string;
  buttonLabel?: string;
}) {
  const escapedTicketUrl = escapeHtml(input.ticketUrl);
  const paragraphs = input.message.split(/\n{2,}/).map(paragraph => {
    const escaped = escapeHtml(paragraph).replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px;color:#344054;font:16px/1.65 Arial,sans-serif">${escaped.replaceAll(escapedTicketUrl, `<a href="${escapedTicketUrl}" style="color:#9a5c00;text-decoration:underline">${escapeHtml(input.buttonLabel || 'Get your tickets')}</a>`)}</p>`;
  }).join('');
  const hasCallToAction = input.message.includes(input.ticketUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;background:#eef0f4;font-family:Arial,Helvetica,sans-serif;color:#141a2b">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Online Bar update for the waitlist. See what’s new and explore the launch.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f4;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
      <tr><td style="background:#0b1020;padding:18px 26px;color:#fff;font:bold 15px Arial,sans-serif;letter-spacing:2px">ONLINE <span style="color:#f59e0b">BAR</span></td></tr>
      <tr><td style="padding:30px 28px 8px;font-family:Arial,sans-serif">
        <div style="color:#d97706;font-size:11px;font-weight:bold;letter-spacing:2px">A NOTE FOR OUR WAITLIST</div>
        <h1 style="margin:10px 0 20px;color:#111827;font-size:30px;line-height:1.2">${escapeHtml(input.subject)}</h1>
        ${paragraphs}
      </td></tr>
      ${hasCallToAction ? `<tr><td align="center" style="padding:8px 28px 24px"><a href="${escapedTicketUrl}" style="display:inline-block;background:#f59e0b;color:#1b1300;font:bold 15px Arial,sans-serif;text-decoration:none;padding:15px 28px;border-radius:12px">${escapeHtml(input.buttonLabel || 'Get your tickets')}</a></td></tr>` : ''}
      <tr><td style="padding:0 28px 22px;color:#667085;font:12px/1.65 Arial,sans-serif">You’re receiving this because you opted in to Online Bar email updates. 18+ only for alcohol products. Please drink responsibly.</td></tr>
      <tr><td style="background:#f3f4f6;padding:18px 28px;color:#667085;font:12px/1.65 Arial,sans-serif">Online Bar · Nairobi, Kenya<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#667085">Unsubscribe from marketing emails</a></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderVendorApplicationEmail(input: { businessName: string; uploadUrl: string }) {
  const businessName = input.businessName.trim() || 'your business';
  return {
    subject: `Welcome to Online Bar, ${businessName}`,
    text: `Welcome to Online Bar, ${businessName}. Your application has been received. Securely upload the remaining required documents within seven days: ${input.uploadUrl}. Alcohol products can be listed after required licences are verified.`,
    html: renderOnboardingPreview({
      title: `Welcome to Online Bar, ${businessName}`,
      preheader: 'Your application is in. Finish your secure document upload.',
      eyebrow: 'WELCOME, PARTNER',
      headline: 'Let’s finish setting up your shop.',
      message: `We received ${businessName}’s application. Securely upload the remaining required documents within seven days so our team can complete the review.`,
      steps: [
        { title: 'Open your secure upload link', detail: 'Use the button below to submit the missing business documents.' },
        { title: 'Keep your details up to date', detail: 'Make sure business and contact information is accurate.' },
        { title: 'Wait for verification', detail: 'We’ll review the application and let you know what comes next.' }
      ],
      buttonLabel: 'Upload documents',
      buttonUrl: input.uploadUrl,
      note: 'Alcohol products can be listed only after the required licences are verified.'
    })
  };
}

export function renderRiderApprovalEmail(input: { riderName: string; pin: string; terminalUrl: string }) {
  const riderName = input.riderName.trim() || 'Rider';
  return {
    subject: 'Your Online Bar rider account is approved',
    text: `Hi ${riderName}, your Online Bar rider account has been approved. Open your rider terminal at ${input.terminalUrl} and continue with your verified OnlineBar account using the same email or phone from your rider application. You can also sign in with your rider phone number and this four-digit PIN: ${input.pin}. Keep the PIN private.`,
    html: renderOnboardingPreview({
      title: 'Your Online Bar rider account is approved',
      preheader: 'Your rider account is approved. Sign in securely to continue.',
      eyebrow: 'RIDER ACCOUNT APPROVED',
      headline: `You’re approved, ${riderName}.`,
      message: 'Your Online Bar rider account is ready. Continue with the verified account from your application, or sign in with your rider phone number and the one-time PIN below.',
      steps: [
        { title: 'Open your rider terminal', detail: 'Sign in using the phone or email from your application.' },
        { title: 'Your one-time PIN', detail: `${input.pin} · Keep this code private.` },
        { title: 'Finish your setup', detail: 'Review your profile and go online when you are ready.' }
      ],
      buttonLabel: 'Open rider terminal',
      buttonUrl: input.terminalUrl,
      note: 'Never share your sign-in PIN. Delivery PINs are separate and must only be given after the customer ID check.'
    })
  };
}

function renderCustomerPreview(status: CustomerNotificationStatus, headline: string, message: string) {
  const rule = DEFAULT_CUSTOMER_NOTIFICATION_CONFIG[status];
  return renderCustomerOrderEmail({
    headline,
    message,
    buttonLabel: rule.emailButtonLabel,
    accentColor: '#f59e0b',
    orderId: '2091',
    total: 'KES 3,820',
    status,
    trackingUrl: 'https://onlinebar.co.ke/track?id=2091',
    customerName: 'Wanjiru',
    createdAt: '7 Nov 2026, 7:15 pm',
    paymentMethod: 'M-Pesa',
    paymentReference: 'SGH7K2LMNP',
    deliveryCost: 160,
    riderName: status === 'Out for Delivery' ? 'Brian K.' : undefined,
    eta: status === 'Out for Delivery' ? 'About 8 minutes' : undefined,
    items: status === 'Paid' ? [
      { name: 'Tusker Lager 500ml', quantity: 12, unitPrice: 280 },
      { name: 'Ice pack 2kg', quantity: 2, unitPrice: 150 }
    ] : undefined,
    testNotice: 'Sample preview · no email has been sent.'
  });
}

export function renderLifecycleEmailPreview(id: LifecycleEmailPreviewId) {
  switch (id) {
    case 'waitlist':
      return renderWaitlistCampaignEmail({
        subject: 'You’re in. Online Bar is open 🎉',
        message: 'It’s finally here. Thank you for waiting. Online Bar is open. Browse drinks, snacks and street food available near you.\n\nStart ordering: https://onlinebar.co.ke/market',
        ticketUrl: 'https://onlinebar.co.ke/market',
        unsubscribeUrl: 'https://onlinebar.co.ke/newsletter/unsubscribe?token=sample-preview',
        buttonLabel: 'Start ordering'
      });
    case 'order':
      return renderCustomerPreview('Paid', 'Thanks, Wanjiru. We’ve got it.', 'Your payment was received and the shop is preparing your order. We’ll message you when your rider is on the way.');
    case 'rider':
      return renderCustomerPreview('Out for Delivery', 'Brian is bringing your order.', 'Your order has left the shop. Follow your rider and estimated arrival in the app. Your delivery PIN stays in the app; share it only after the rider checks your ID.');
    case 'delivered':
      return renderCustomerPreview('Delivered', 'Enjoy your night, Wanjiru.', 'Your order #2091 was delivered. If anything is not right, contact support and we’ll help.');
    case 'payment':
      return renderCustomerPreview('Payment Failed', 'Your order is waiting.', 'We could not confirm payment for order #2091. Check your order before trying again. If money left your account, do not pay twice; contact support with your M-Pesa reference.');
    case 'vendor':
      return renderVendorApplicationEmail({
        businessName: 'Mama Pima Wines',
        uploadUrl: 'https://onlinebar.co.ke/merchant/documents?token=sample-preview'
      }).html;
    case 'rider-welcome':
      return renderRiderApprovalEmail({
        riderName: 'Brian',
        pin: '4827',
        terminalUrl: 'https://onlinebar.co.ke/rider/dashboard?account=1'
      }).html;
  }
}
