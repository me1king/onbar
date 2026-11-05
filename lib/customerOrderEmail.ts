import type { CustomerNotificationRule } from '@/lib/customerMessaging';

type CustomerOrderEmailInput = {
  headline: string;
  message: string;
  buttonLabel: string;
  accentColor: string;
  orderId: string;
  total: string;
  status: string;
  trackingUrl: string;
  customerName?: string;
  paymentMethod?: string;
  paymentReference?: string;
  createdAt?: string;
  items?: Array<{ name: string; quantity: number; unitPrice: number; size?: string | null }>;
  testNotice?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function emailParagraphs(message: string) {
  return message.split(/\n{2,}/).map(paragraph =>
    `<p style="margin:0 0 16px;color:#334155;font-size:16px;font-weight:600;line-height:1.7">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
  ).join('');
}

function formatEmailPrice(value: number) {
  return `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderCustomerOrderEmail(input: CustomerOrderEmailInput) {
  const accentColor = /^#[0-9a-f]{6}$/i.test(input.accentColor)
    ? input.accentColor
    : '#00a884';
  let trackingUrl = '';
  try {
    const url = new URL(input.trackingUrl);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      trackingUrl = url.toString();
    }
  } catch {
    trackingUrl = '';
  }

  const button = trackingUrl
    ? `<tr><td align="center" style="padding:8px 0 28px"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:${accentColor};border-radius:12px;color:#ffffff;font-size:15px;font-weight:700;line-height:1.2;padding:16px 28px;text-decoration:none">${escapeHtml(input.buttonLabel)}</a></td></tr>`
    : '';
  const items = input.items?.length
    ? input.items.map(item => `<tr>
        <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px">${escapeHtml(item.name)}${item.size ? ` (${escapeHtml(item.size)})` : ''}</td>
        <td align="center" style="padding:12px 10px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px">${item.quantity}</td>
        <td align="right" style="padding:12px 10px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px">${escapeHtml(formatEmailPrice(item.unitPrice))}</td>
        <td align="right" style="padding:12px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:700">${escapeHtml(formatEmailPrice(item.unitPrice * item.quantity))}</td>
      </tr>`).join('')
    : '';
  const itemTable = items
    ? `<tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
        <tr><th align="left" style="padding:10px;color:#64748b;font-size:10px;text-transform:uppercase">Item</th><th style="padding:10px;color:#64748b;font-size:10px;text-transform:uppercase">Qty</th><th align="right" style="padding:10px;color:#64748b;font-size:10px;text-transform:uppercase">Unit price</th><th align="right" style="padding:10px;color:#64748b;font-size:10px;text-transform:uppercase">Total</th></tr>
        ${items}
      </table></td></tr>`
    : '';
  const receiptDetails = [
    input.customerName ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Customer</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600">${escapeHtml(input.customerName)}</td></tr>` : '',
    input.createdAt ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Date</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px">${escapeHtml(input.createdAt)}</td></tr>` : '',
    input.paymentMethod ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Payment</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px">${escapeHtml(input.paymentMethod)}</td></tr>` : '',
    input.paymentReference ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Reference</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px">${escapeHtml(input.paymentReference)}</td></tr>` : ''
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.headline)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
        <tr><td style="background:${accentColor};padding:22px 28px;color:#ffffff">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px">ONLINE BAR</p>
        </td></tr>
        <tr><td style="padding:32px 28px 8px">
          <p style="margin:0 0 10px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${escapeHtml(input.status)}</p>
          <h1 style="margin:0 0 22px;color:#0f172a;font-size:28px;font-weight:700;line-height:1.2">${escapeHtml(input.headline)}</h1>
          ${emailParagraphs(input.message)}
        </td></tr>
        <tr><td style="padding:8px 28px 22px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
            <tr><td style="padding:16px 18px">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Order summary</p>
              <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700">Order #${escapeHtml(input.orderId)}</p>
            </td><td align="right" style="padding:16px 18px">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Total</p>
              <p style="margin:0;color:#0f172a;font-size:15px;font-weight:700">${escapeHtml(input.total)}</p>
            </td></tr>
          </table>
        </td></tr>
        ${receiptDetails ? `<tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${receiptDetails}</table></td></tr>` : ''}
        ${itemTable}
        ${button}
        <tr><td style="border-top:1px solid #e2e8f0;padding:20px 28px 26px">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6">Thanks for choosing Online Bar Nairobi. This is an update about your order; replies to this email may not be monitored.</p>
          ${input.testNotice ? `<p style="margin:12px 0 0;color:#64748b;font-size:12px;text-align:center">${escapeHtml(input.testNotice)}</p>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderCustomerOrderEmailText(input: CustomerOrderEmailInput) {
  return [
    input.headline,
    '',
    input.message,
    '',
    `Order #${input.orderId} · ${input.total} · ${input.status}`,
    ...(input.items || []).map(item => `${item.name}${item.size ? ` (${item.size})` : ''} × ${item.quantity} · ${formatEmailPrice(item.unitPrice)} each`),
    input.paymentMethod ? `Payment: ${input.paymentMethod}` : '',
    input.paymentReference ? `Reference: ${input.paymentReference}` : '',
    input.trackingUrl,
    '',
    'Online Bar Nairobi',
    input.testNotice || ''
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1] !== '')).join('\n');
}

export function getCustomerOrderEmailDesign(rule: CustomerNotificationRule) {
  return {
    headline: rule.emailHeadline,
    buttonLabel: rule.emailButtonLabel,
    accentColor: rule.emailAccentColor
  };
}
