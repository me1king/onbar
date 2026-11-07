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
  riderName?: string;
  riderPhone?: string;
  eta?: string;
  paymentMethod?: string;
  paymentReference?: string;
  createdAt?: string;
  deliveryCost?: number;
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
        ${input.deliveryCost === undefined ? '' : `<tr><td colspan="3" align="right" style="padding:8px 10px;color:#667085;font-size:13px">Delivery fee</td><td align="right" style="padding:8px 10px;color:#344054;font-size:13px">${escapeHtml(formatEmailPrice(input.deliveryCost))}</td></tr>`}
      </table></td></tr>`
    : '';
  const receiptDetails = [
    input.customerName ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Customer</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600">${escapeHtml(input.customerName)}</td></tr>` : '',
    input.createdAt ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Date</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px">${escapeHtml(input.createdAt)}</td></tr>` : '',
    input.paymentMethod ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Payment</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px">${escapeHtml(input.paymentMethod)}</td></tr>` : '',
    input.paymentReference ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Payment reference</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px">${escapeHtml(input.paymentReference)}</td></tr>` : '',
    input.riderName ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Rider</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600">${escapeHtml(input.riderName)}${input.riderPhone ? ` · ${escapeHtml(input.riderPhone)}` : ''}</td></tr>` : '',
    input.eta ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Estimated arrival</td><td align="right" style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600">${escapeHtml(input.eta)}</td></tr>` : ''
  ].filter(Boolean).join('');
  const previewText = `${input.status}: ${input.headline}. ${input.message.split(/\n/)[0] || ''}`.trim();

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.headline)}</title></head>
<body style="margin:0;background:#eef0f4;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef0f4;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">
        <tr><td style="background:#0b1020;padding:18px 26px;color:#ffffff">
          <p style="margin:0;font-size:15px;font-weight:800;letter-spacing:2px">ONLINE <span style="color:#f59e0b">BAR</span></p>
        </td></tr>
        <tr><td style="padding:30px 28px 8px">
          <p style="margin:0 0 10px;color:${accentColor};font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase">${escapeHtml(input.status)}</p>
          <h1 style="margin:0 0 18px;color:#111827;font-size:30px;font-weight:800;line-height:1.2">${escapeHtml(input.headline)}</h1>
          ${emailParagraphs(input.message)}
        </td></tr>
        <tr><td style="padding:8px 28px 18px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fffaf0;border:1px solid #f4d28a;border-radius:14px">
            <tr><td style="padding:16px 18px">
              <p style="margin:0 0 6px;color:#7c5a15;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">Order summary</p>
              <p style="margin:0;color:#111827;font-size:15px;font-weight:700">Order #${escapeHtml(input.orderId)}</p>
            </td><td align="right" style="padding:16px 18px">
              <p style="margin:0 0 6px;color:#7c5a15;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">Total</p>
              <p style="margin:0;color:#111827;font-size:15px;font-weight:700">${escapeHtml(input.total)}</p>
            </td></tr>
          </table>
        </td></tr>
        ${receiptDetails ? `<tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${receiptDetails}</table></td></tr>` : ''}
        ${itemTable}
        ${button}
        <tr><td style="border-top:1px solid #e5e7eb;padding:18px 28px 24px">
          <p style="margin:0;color:#667085;font-size:12px;line-height:1.65">Thanks for choosing Online Bar Nairobi. This is an update about your order; replies to this email may not be monitored.</p>
          <p style="margin:10px 0 0;color:#667085;font-size:12px;line-height:1.65">18+ only for alcohol orders. Our rider will check ID at handover. Please drink responsibly.</p>
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
    input.deliveryCost === undefined ? '' : `Delivery fee: ${formatEmailPrice(input.deliveryCost)}`,
    input.riderName ? `Rider: ${input.riderName}${input.riderPhone ? ` · ${input.riderPhone}` : ''}` : '',
    input.eta ? `Estimated arrival: ${input.eta}` : '',
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
