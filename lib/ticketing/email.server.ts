import 'server-only';

import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { decryptTicketCredential } from '@/lib/ticketing/credentials.server';
import { defaultTicketTheme, isTicketThemeId } from '@/lib/ticketing/theme';
import type { TicketThemeId } from '@/lib/ticketing/theme';
import {
  DEFAULT_TICKET_EMAIL_SETTINGS,
  normalizeTicketEmailSettings,
  renderTicketEmailTemplate,
  type TicketEmailSettings
} from '@/lib/ticketing/emailSettings';
import { getTransactionalEmailConfig, sendTransactionalEmail } from '@/lib/jmsurfMail.server';

type Database = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

const palettes = {
  midnight: { background: '#17121e', panel: '#28232e', foreground: '#fff7e6', muted: '#d4c7ae', accent: '#d6a83f', border: '#756443' },
  'official-white': { background: '#f8fafc', panel: '#ffffff', foreground: '#0f172a', muted: '#475569', accent: '#c2410c', border: '#cbd5e1' },
  'sapphire-blue': { background: '#eff6ff', panel: '#ffffff', foreground: '#172554', muted: '#475569', accent: '#2563eb', border: '#bfdbfe' },
  'royal-violet': { background: '#f5f3ff', panel: '#ffffff', foreground: '#2e1065', muted: '#5b4b78', accent: '#6d28d9', border: '#c4b5fd' },
  emerald: { background: '#ecfdf5', panel: '#ffffff', foreground: '#064e3b', muted: '#3f6359', accent: '#047857', border: '#a7f3d0' }
} as const;

type EmailTicket = {
  reference: string;
  attendeeName: string;
  ticketName: string;
  credential: string;
  qrSource?: string;
};

type EmailEvent = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  doors_open_at: string | null;
  venue_name: string;
  venue_address: string;
  city: string;
  venue_latitude: number | null;
  venue_longitude: number | null;
  entrance_guide: string;
  parking_guide: string;
  transport_guide: string;
  timezone: string;
  cancellation_policy: string;
  cover_image_url: string | null;
};

type EmailOrder = {
  reference: string;
  total_minor: number;
  subtotal_minor: number;
  fees_minor: number;
  discount_minor: number;
  currency: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  paid_at: string | null;
  created_at: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function dateTime(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'To be confirmed';
  try {
    return new Intl.DateTimeFormat('en-KE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-KE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Africa/Nairobi'
    }).format(date);
  }
}

function getDirectionsUrl(event: EmailEvent) {
  const destination = event.venue_latitude !== null && event.venue_longitude !== null
    ? `${event.venue_latitude},${event.venue_longitude}`
    : [event.venue_name, event.venue_address, event.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

function maskedPhone(phone: string | null) {
  if (!phone) return 'Not provided';
  const digits = phone.replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 2)}••••${digits.slice(-4)}` : '••••';
}

function formatCurrency(minor: number, currency: string) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: currency.trim(),
    maximumFractionDigits: 2
  }).format(minor / 100);
}

function getEmailTemplateVariables(input: {
  event: EmailEvent;
  order: EmailOrder;
  ticketCount: number;
  organizerName?: string;
}) {
  return {
    event_title: input.event.title,
    event_date: dateTime(input.event.starts_at, input.event.timezone),
    buyer_name: input.order.buyer_name || 'Guest',
    ticket_count: String(input.ticketCount),
    order_reference: input.order.reference,
    amount_paid: formatCurrency(input.order.total_minor, input.order.currency),
    venue: [input.event.venue_name, input.event.city].filter(Boolean).join(', '),
    organizer_name: input.organizerName || 'Event organizer'
  };
}

export async function getTicketEmailSettings(database: Database | null) {
  if (!database) return DEFAULT_TICKET_EMAIL_SETTINGS;
  const { data, error } = await database.from('settings')
    .select('value')
    .eq('key', 'ticketing_email_settings')
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw new Error(`Ticket email settings could not be loaded: ${error.message}`);
  const settings = data ? normalizeTicketEmailSettings(data.value) : DEFAULT_TICKET_EMAIL_SETTINGS;
  if (!settings) throw new Error('Stored ticket email settings are invalid.');
  return settings;
}

function renderEmailCopy(template: string, variables: Record<string, string>) {
  return renderTicketEmailTemplate(template, variables);
}

function calendarText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function calendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function createCalendarAttachment(event: EmailEvent, order: EmailOrder) {
  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ONLINE BAR//Ticketing//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${order.reference}@onlinebar`,
    `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${calendarDate(event.starts_at)}`,
    `DTEND:${calendarDate(event.ends_at)}`,
    `SUMMARY:${calendarText(event.title)}`,
    `LOCATION:${calendarText([event.venue_name, event.venue_address, event.city].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${calendarText(`Ticket order ${order.reference}. Doors open ${event.doors_open_at ? dateTime(event.doors_open_at, event.timezone) : 'at event start'}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return {
    filename: `event-${order.reference}.ics`,
    content: Buffer.from(calendar, 'utf8'),
    contentType: 'text/calendar'
  };
}

function createTicketPdf(input: {
  theme: keyof typeof palettes;
  event: EmailEvent;
  order: EmailOrder;
  ticket: EmailTicket;
  ticketIndex: number;
  ticketCount: number;
  qrDataUrl: string;
  sampleOnly?: boolean;
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const textWidth = pageWidth - margin * 2;
  const palette = palettes[input.theme];
  pdf.setFillColor(palette.background);
  pdf.rect(0, 0, pageWidth, pdf.internal.pageSize.getHeight(), 'F');
  pdf.setDrawColor(palette.accent);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(7, 7, pageWidth - 14, pdf.internal.pageSize.getHeight() - 14, 4, 4, 'S');
  if (input.sampleOnly) {
    pdf.setTextColor(190, 45, 45);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(17);
    pdf.text('SAMPLE ONLY · INVALID TICKET', pageWidth / 2, 28, { align: 'center', angle: -8 });
  }
  const headerY = input.sampleOnly ? 40 : 19;
  pdf.setTextColor(palette.accent);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('APEX MARKET · ONLINE BAR', margin, headerY);
  pdf.setTextColor(palette.foreground);
  pdf.setFontSize(20);
  const titleLines = pdf.splitTextToSize(input.event.title, textWidth);
  const titleY = headerY + 12;
  pdf.text(titleLines, margin, titleY);
  let cursorY = titleY + titleLines.length * 8;
  pdf.setTextColor(palette.muted);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const details = [
    input.ticket.ticketName,
    `Attendee: ${input.ticket.attendeeName || input.order.buyer_name || 'Guest'}`,
    `When: ${dateTime(input.event.starts_at, input.event.timezone)}`,
    ...(input.event.doors_open_at ? [`Doors: ${dateTime(input.event.doors_open_at, input.event.timezone)}`] : []),
    `Where: ${input.event.venue_name}, ${input.event.city}`,
    input.event.venue_address,
  ].filter(Boolean);
  details.forEach(detail => {
    const lines = pdf.splitTextToSize(detail, textWidth);
    pdf.text(lines, margin, cursorY);
    cursorY += lines.length * 5 + 2;
  });
  const qrSize = 48;
  const qrY = Math.min(cursorY + 3, 126);
  pdf.addImage(input.qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, qrY, qrSize, qrSize);
  pdf.setTextColor(palette.foreground);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(input.ticket.reference, pageWidth / 2, qrY + qrSize + 8, { align: 'center' });
  pdf.setTextColor(palette.muted);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Ticket ${input.ticketIndex + 1} of ${input.ticketCount} · Order ${input.order.reference}`, pageWidth / 2, qrY + qrSize + 14, { align: 'center' });
  pdf.text(`Paid ${new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim(), maximumFractionDigits: 2 }).format(input.order.total_minor / 100)}`, pageWidth / 2, qrY + qrSize + 19, { align: 'center' });
  pdf.setFontSize(7);
  pdf.text(`Subtotal ${new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim() }).format(input.order.subtotal_minor / 100)} · fees ${new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim() }).format(input.order.fees_minor / 100)}${input.order.discount_minor > 0 ? ` · discount ${new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim() }).format(input.order.discount_minor / 100)}` : ''}`, pageWidth / 2, qrY + qrSize + 23, { align: 'center' });
  pdf.setTextColor(255, 190, 190);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ONE SCAN ONLY · DO NOT SHARE THIS QR CODE', pageWidth / 2, qrY + qrSize + 29, { align: 'center' });
  return Buffer.from(pdf.output('arraybuffer'));
}

function ticketHtml(input: {
  theme: keyof typeof palettes;
  event: EmailEvent;
  order: EmailOrder;
  tickets: EmailTicket[];
  organizerName?: string;
  promotionCode?: string | null;
  paymentMethod?: string;
  sampleOnly?: boolean;
  emailSettings: TicketEmailSettings;
}) {
  const palette = palettes[input.theme];
  const sections = input.emailSettings.sections;
  const variables = getEmailTemplateVariables({
    event: input.event,
    order: input.order,
    ticketCount: input.tickets.length,
    organizerName: input.organizerName
  });
  const heading = renderEmailCopy(input.emailSettings.headingTemplate, variables);
  const intro = renderEmailCopy(input.emailSettings.introTemplate, variables);
  const closing = renderEmailCopy(input.emailSettings.closingTemplate, variables);
  const tickets = input.tickets.map((ticket, index) => {
    const qrId = `ob-ticket-qr-${index + 1}`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid ${palette.border};border-radius:18px;border-collapse:separate;background:${palette.panel};color:${palette.foreground};overflow:hidden">
      <tr>
        <td style="padding:24px 22px;vertical-align:middle">
          <div style="color:${palette.accent};font:700 11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">${escapeHtml(input.emailSettings.brandTitle)} · ADMIT ONE · ${index + 1} / ${input.tickets.length}</div>
          <div style="margin-top:10px;font:700 27px/1.12 Georgia,serif">${escapeHtml(input.event.title)}</div>
          ${sections.showTicketType ? `<div style="margin-top:14px;color:${palette.muted};font:700 13px Arial,sans-serif">${escapeHtml(ticket.ticketName)}</div>` : ''}
          ${sections.showAttendeeName ? `<div style="margin-top:7px;color:${palette.foreground};font:14px Arial,sans-serif">${escapeHtml(ticket.attendeeName || input.order.buyer_name || 'Guest')}</div>` : ''}
          <div style="margin-top:15px;color:${palette.muted};font:12px/1.6 Arial,sans-serif">
            ${sections.showEventTiming ? `<b style="color:${palette.foreground}">WHEN</b> &nbsp;${escapeHtml(dateTime(input.event.starts_at, input.event.timezone))}<br>` : ''}
            ${sections.showDoors && input.event.doors_open_at ? `<b style="color:${palette.foreground}">DOORS</b> &nbsp;${escapeHtml(dateTime(input.event.doors_open_at, input.event.timezone))}<br>` : ''}
            ${sections.showVenue ? `<b style="color:${palette.foreground}">WHERE</b> &nbsp;${escapeHtml(input.event.venue_name)} · ${escapeHtml(input.event.city)}<br>` : ''}
            ${sections.showVenue && sections.showVenueAddress && input.event.venue_address ? `${escapeHtml(input.event.venue_address)}<br>` : ''}
            <b style="color:${palette.foreground}">TICKET</b> &nbsp;${escapeHtml(ticket.reference)}
          </div>
        </td>
        <td width="190" align="center" style="width:190px;padding:18px 14px;border-left:2px dashed ${palette.border};vertical-align:middle;text-align:center">
          <div style="font:700 15px Arial,sans-serif;letter-spacing:2px">ADMIT<br>ONE</div>
          <img src="${escapeHtml(ticket.qrSource || `cid:${qrId}`)}" width="142" height="142" alt="Secure entry QR code for ${escapeHtml(ticket.reference)}" style="display:block;width:142px;height:142px;margin:12px auto 8px;background:#fff;border:7px solid #fff;border-radius:8px">
          <div style="color:${palette.muted};font:10px Arial,sans-serif">SCAN AT THE GATE</div>
        </td>
      </tr>
    </table>`;
  }).join('');
  const mapUrl = getDirectionsUrl(input.event);
  const safeCoverImageUrl = sections.showEventCover && input.event.cover_image_url && /^https:\/\//i.test(input.event.cover_image_url)
    ? input.event.cover_image_url
    : '';

  return `<!doctype html><html><body style="margin:0;padding:24px 10px;background:${palette.background};color:${palette.foreground};font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px">
        <tr><td style="padding:12px 4px 22px">
          ${input.sampleOnly ? `<div style="margin-bottom:14px;border:2px solid #b91c1c;border-radius:10px;background:#fee2e2;padding:12px;color:#7f1d1d;font:700 14px Arial,sans-serif;text-align:center">SAMPLE PREVIEW · QR CODES ARE NOT VALID FOR ENTRY</div>` : ''}
          <div style="color:${palette.accent};font:700 11px Arial,sans-serif;letter-spacing:3px">${escapeHtml(input.emailSettings.brandTitle)}</div>
          <div style="margin-top:5px;color:${palette.muted};font:11px Arial,sans-serif">${escapeHtml(input.emailSettings.brandSubtitle)}</div>
          ${safeCoverImageUrl ? `<img src="${escapeHtml(safeCoverImageUrl)}" alt="${escapeHtml(input.event.title)} event banner" width="680" style="display:block;width:100%;max-height:240px;object-fit:cover;margin:0 0 16px;border-radius:12px">` : ''}
          <h1 style="margin:10px 0 7px;font:700 27px Georgia,serif">${escapeHtml(heading)}</h1>
          <p style="margin:0;color:${palette.muted};font:14px/1.6 Arial,sans-serif">${escapeHtml(intro).replace(/\r?\n/g, '<br>')}</p>
        </td></tr>
        <tr><td style="padding:0 5px 20px;color:${palette.muted};font:13px/1.7 Arial,sans-serif">
          ${sections.showEventTiming ? `<b style="color:${palette.foreground}">WHEN</b> &nbsp;${escapeHtml(dateTime(input.event.starts_at, input.event.timezone))}${input.event.ends_at ? ` – ${escapeHtml(dateTime(input.event.ends_at, input.event.timezone))}` : ''}<br>` : ''}
          ${sections.showDoors && input.event.doors_open_at ? `<b style="color:${palette.foreground}">DOORS</b> &nbsp;${escapeHtml(dateTime(input.event.doors_open_at, input.event.timezone))}<br>` : ''}
          ${sections.showVenue ? `<b style="color:${palette.foreground}">WHERE</b> &nbsp;${escapeHtml(input.event.venue_name)} · ${escapeHtml(input.event.city)}<br>` : ''}
          ${sections.showVenue && sections.showVenueAddress && input.event.venue_address ? `${escapeHtml(input.event.venue_address)}<br>` : ''}
          ${sections.showVenue && sections.showDirections ? `<a href="${escapeHtml(mapUrl)}" style="display:inline-block;margin-top:10px;border-radius:8px;background:${palette.accent};padding:10px 16px;color:${palette.background};font-weight:bold;text-decoration:none">Get directions</a>` : ''}
        </td></tr>
        <tr><td>${tickets}</td></tr>
        ${sections.showFinancialSummary || sections.showBuyerContact || sections.showOrganizer || sections.showEventDescription || sections.showArrivalGuides || sections.showCancellationPolicy ? `<tr><td style="padding:4px 5px 18px;color:${palette.muted};font:12px/1.7 Arial,sans-serif">
          ${sections.showFinancialSummary ? `
          Order <b style="color:${palette.foreground}">${escapeHtml(input.order.reference)}</b> · Paid ${escapeHtml(new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim(), maximumFractionDigits: 2 }).format(input.order.total_minor / 100))}<br>
          Subtotal ${escapeHtml(new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim(), maximumFractionDigits: 2 }).format(input.order.subtotal_minor / 100))} · Fees ${escapeHtml(new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim(), maximumFractionDigits: 2 }).format(input.order.fees_minor / 100))}${input.order.discount_minor > 0 ? ` · Discount −${escapeHtml(new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim(), maximumFractionDigits: 2 }).format(input.order.discount_minor / 100))}` : ''}<br>
          ${input.order.paid_at ? `Payment confirmed ${escapeHtml(dateTime(input.order.paid_at, input.event.timezone))}<br>` : ''}
          ${input.paymentMethod ? `Payment: ${escapeHtml(input.paymentMethod)}<br>` : ''}
          ${input.promotionCode ? `Promo: ${escapeHtml(input.promotionCode)}<br>` : ''}` : ''}
          ${sections.showBuyerContact ? `${escapeHtml(input.order.buyer_email)}${input.order.buyer_phone ? ` · ${escapeHtml(maskedPhone(input.order.buyer_phone))}` : ''}<br>` : ''}
          ${sections.showOrganizer && input.organizerName ? `Organizer: ${escapeHtml(input.organizerName)}<br>` : ''}
          ${sections.showEventDescription && input.event.description ? `<br>${escapeHtml(input.event.description)}<br>` : ''}
          ${sections.showArrivalGuides && input.event.entrance_guide ? `<b style="color:${palette.foreground}">ENTRANCE</b> &nbsp;${escapeHtml(input.event.entrance_guide)}<br>` : ''}
          ${sections.showArrivalGuides && input.event.parking_guide ? `<b style="color:${palette.foreground}">PARKING</b> &nbsp;${escapeHtml(input.event.parking_guide)}<br>` : ''}
          ${sections.showArrivalGuides && input.event.transport_guide ? `<b style="color:${palette.foreground}">TRANSPORT</b> &nbsp;${escapeHtml(input.event.transport_guide)}<br>` : ''}
          ${sections.showCancellationPolicy && input.event.cancellation_policy ? `<br><b style="color:${palette.foreground}">CANCELLATION POLICY</b><br>${escapeHtml(input.event.cancellation_policy)}<br>` : ''}
          <br>Tickets attached as PDF · Calendar event attached as .ics.<br>
          ${escapeHtml(closing).replace(/\r?\n/g, '<br>')}
        </td></tr>` : `<tr><td style="padding:4px 5px 18px;color:${palette.muted};font:12px/1.7 Arial,sans-serif">${escapeHtml(closing).replace(/\r?\n/g, '<br>')}</td></tr>`}
        <tr><td style="border-top:1px solid ${palette.border};padding:15px 5px;color:${palette.muted};font:11px/1.6 Arial,sans-serif">${escapeHtml(input.emailSettings.brandTitle)} · This email contains your valid entry credentials. Do not forward the QR codes.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

export async function generateTicketEmailPreview(
  theme: TicketThemeId,
  emailSettings: TicketEmailSettings = DEFAULT_TICKET_EMAIL_SETTINGS
) {
  const tickets = [
    { reference: 'OB-PREVIEW-001', attendeeName: 'Jordan Sample', ticketName: 'Early Bird', credential: 'PREVIEW-ONLY-NOT-A-VALID-TICKET-001' },
    { reference: 'OB-PREVIEW-002', attendeeName: 'Taylor Sample', ticketName: 'General Admission', credential: 'PREVIEW-ONLY-NOT-A-VALID-TICKET-002' }
  ];
  const ticketsWithQr = await Promise.all(tickets.map(async ticket => ({
    ...ticket,
    qrSource: await QRCode.toDataURL(ticket.credential, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'H'
    })
  })));

  const event: EmailEvent = {
    title: 'Midnight Society — Sample Event',
    description: 'A sample night of live music, DJs and dancing. This is example copy for the email preview.',
    starts_at: '2027-06-19T18:00:00.000Z',
    ends_at: '2027-06-20T01:00:00.000Z',
    doors_open_at: '2027-06-19T17:00:00.000Z',
    venue_name: 'The Sample Rooftop',
    venue_address: 'Westlands, Nairobi',
    city: 'Nairobi',
    venue_latitude: -1.2676,
    venue_longitude: 36.8108,
    entrance_guide: 'Use the main entrance on the west side of the building.',
    parking_guide: 'Limited paid parking is available at the venue.',
    transport_guide: 'Ride-hailing drop-off is on the north side.',
    timezone: 'Africa/Nairobi',
    cancellation_policy: 'Tickets are subject to the event organizer’s published cancellation policy.',
    cover_image_url: null
  };
  const order: EmailOrder = {
    reference: 'OB-ORDER-PREVIEW',
    total_minor: 750000,
    subtotal_minor: 700000,
    fees_minor: 50000,
    discount_minor: 0,
    currency: 'KES',
    buyer_name: 'Jordan Sample',
    buyer_email: 'jordan@example.com',
    buyer_phone: '+254712345678',
    paid_at: '2027-05-20T10:30:00.000Z',
    created_at: '2027-05-20T10:25:00.000Z'
  };
  const html = ticketHtml({
    theme,
    event,
    order,
    tickets: ticketsWithQr,
    organizerName: 'ONLINE BAR',
    promotionCode: 'PREVIEW10',
    paymentMethod: 'M-Pesa',
    sampleOnly: true,
    emailSettings
  });
  const attachments = [
    ...ticketsWithQr.map((ticket, index) => ({
      filename: `ticket-${ticket.reference}.pdf`,
      content: createTicketPdf({
        theme,
        event,
        order,
        ticket,
        ticketIndex: index,
        ticketCount: ticketsWithQr.length,
        qrDataUrl: ticket.qrSource || '',
        sampleOnly: true
      }),
      contentType: 'application/pdf'
    })),
    ...await Promise.all(ticketsWithQr.map(async (ticket, index) => ({
      filename: `ticket-${ticket.reference}-qr.png`,
      content: await QRCode.toBuffer(ticket.credential, {
        type: 'png',
        width: 420,
        margin: 2,
        errorCorrectionLevel: 'H'
      }),
      contentType: 'image/png',
      contentId: `ob-ticket-qr-${index + 1}`
    }))),
    createCalendarAttachment(event, order)
  ];
  return {
    html,
    attachments,
    subject: renderEmailCopy(emailSettings.subjectTemplate, getEmailTemplateVariables({
      event,
      order,
      ticketCount: ticketsWithQr.length,
      organizerName: 'ONLINE BAR'
    })).replace(/[\r\n]/g, ' ').trim(),
    text: [
      renderEmailCopy(emailSettings.brandTitle, getEmailTemplateVariables({ event, order, ticketCount: ticketsWithQr.length, organizerName: 'ONLINE BAR' })),
      renderEmailCopy(emailSettings.brandSubtitle, getEmailTemplateVariables({ event, order, ticketCount: ticketsWithQr.length, organizerName: 'ONLINE BAR' })),
      '',
      renderEmailCopy(emailSettings.headingTemplate, getEmailTemplateVariables({ event, order, ticketCount: ticketsWithQr.length, organizerName: 'ONLINE BAR' })),
      '',
      renderEmailCopy(emailSettings.introTemplate, getEmailTemplateVariables({ event, order, ticketCount: ticketsWithQr.length, organizerName: 'ONLINE BAR' })),
      '',
      ...(emailSettings.sections.showEventTiming ? [`When: ${dateTime(event.starts_at, event.timezone)} – ${dateTime(event.ends_at, event.timezone)}`] : []),
      ...(emailSettings.sections.showDoors ? [`Doors: ${dateTime(event.doors_open_at || event.starts_at, event.timezone)}`] : []),
      ...(emailSettings.sections.showVenue ? [`Where: ${event.venue_name}${emailSettings.sections.showVenueAddress ? `, ${event.venue_address}` : ''}, ${event.city}`] : []),
      ...(emailSettings.sections.showVenue && emailSettings.sections.showDirections ? [`Directions: ${getDirectionsUrl(event)}`] : []),
      '',
      ...ticketsWithQr.map((ticket, index) => [
        `${index + 1}/${ticketsWithQr.length}`,
        ...(emailSettings.sections.showTicketType ? [ticket.ticketName] : []),
        ...(emailSettings.sections.showAttendeeName ? [ticket.attendeeName] : []),
        ticket.reference
      ].join(' · ')),
      '',
      ...(emailSettings.sections.showFinancialSummary ? [
        `Order: ${order.reference}`,
        `Total paid: ${formatCurrency(order.total_minor, order.currency)}`,
        'Payment: M-Pesa'
      ] : []),
      ...(emailSettings.sections.showBuyerContact ? [order.buyer_email] : []),
      ...(emailSettings.sections.showOrganizer ? ['Organizer: ONLINE BAR'] : []),
      ...(emailSettings.sections.showEventDescription ? [event.description] : []),
      ...(emailSettings.sections.showArrivalGuides ? [event.entrance_guide, event.parking_guide, event.transport_guide] : []),
      ...(emailSettings.sections.showCancellationPolicy ? [`Cancellation policy: ${event.cancellation_policy}`] : []),
      '',
      renderEmailCopy(emailSettings.closingTemplate, getEmailTemplateVariables({ event, order, ticketCount: ticketsWithQr.length, organizerName: 'ONLINE BAR' })),
      '',
      'Sample-only PDF tickets and calendar file attached. QR codes are not valid for entry.'
    ].join('\n')
  };
}

export async function buildTicketEmailPreview(theme: TicketThemeId) {
  const database = createServerSupabaseClient();
  const emailSettings = await getTicketEmailSettings(database);
  return generateTicketEmailPreview(theme, emailSettings);
}

async function finishDelivery(database: Database, orderId: string, sent: boolean, message?: string) {
  const { data, error } = await database.rpc('ticketing_finish_email_delivery', {
    p_order_id: orderId,
    p_sent: sent,
    p_error: message?.slice(0, 1000) || null
  });
  if (error || data !== true) {
    console.error('[TicketingEmail] Could not record email delivery outcome:', error);
    throw new Error('Ticket email delivery status could not be saved.');
  }
}

export async function sendTicketOrderEmail(database: Database, orderId: string): Promise<'sent' | 'already_sent' | 'busy'> {
  const emailConfig = getTransactionalEmailConfig();
  if (!emailConfig.configured || !emailConfig.from
    || !/^(?:[^<>]+<[^<>@\s]+@[^<>@\s]+>|[^<>\s@]+@[^<>\s@]+)$/.test(emailConfig.from)) {
    throw new Error('Ticket email delivery is not configured. Set JMSURF_MAIL_KEY and a verified JMSURF_FROM_EMAIL.');
  }
  const { data: claim, error: claimError } = await database.rpc('ticketing_claim_email_delivery', {
    p_order_id: orderId
  });
  if (claimError) throw new Error(`Ticket email could not be queued: ${claimError.message}`);
  if (claim === 'sent') return 'already_sent';
  if (claim === 'busy') return 'busy';
  if (claim !== 'claimed') throw new Error('Tickets can only be emailed after the order is paid.');

  try {
    const { data: order, error: orderError } = await database.from('ticketing_orders')
      .select('id,reference,status,total_minor,subtotal_minor,fees_minor,discount_minor,currency,buyer_email,buyer_name,buyer_phone,buyer_email_theme,paid_at,created_at,event_id,promotion_id')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.status !== 'paid') throw new Error('Paid ticket order could not be found.');

    const [eventResult, itemsResult, themeResult, paymentResult, emailSettings] = await Promise.all([
      database.from('ticketing_events')
        .select('organizer_id,title,description,starts_at,ends_at,doors_open_at,venue_name,venue_address,venue_latitude,venue_longitude,entrance_guide,parking_guide,transport_guide,city,timezone,cancellation_policy,cover_image_url')
        .eq('id', order.event_id)
        .maybeSingle(),
      database.from('ticketing_order_items')
        .select('id,ticket_name_snapshot')
        .eq('order_id', order.id),
      database.from('settings').select('value').eq('key', 'ticketing_theme').eq('is_published', true).maybeSingle(),
      database.from('ticketing_payment_attempts').select('provider').eq('order_id', order.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      getTicketEmailSettings(database)
    ]);
    if (eventResult.error || itemsResult.error || themeResult.error || paymentResult.error) {
      throw eventResult.error || itemsResult.error || themeResult.error || paymentResult.error;
    }
    if (!eventResult.data || !itemsResult.data?.length) throw new Error('Ticket event details could not be loaded.');
    const event = eventResult.data;
    const [organizerResult, promotionResult] = await Promise.all([
      database.from('ticketing_organizers').select('name').eq('id', event.organizer_id).maybeSingle(),
      order.promotion_id
        ? database.from('ticketing_promotions').select('code').eq('id', order.promotion_id).maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (organizerResult.error || promotionResult.error) throw organizerResult.error || promotionResult.error;
    const itemNames = new Map(itemsResult.data.map(item => [item.id, item.ticket_name_snapshot]));
    const { data: storedTickets, error: ticketError } = await database.from('ticketing_tickets')
      .select('ticket_reference,attendee_name,credential_hash,credential_ciphertext,order_item_id,status')
      .in('order_item_id', itemsResult.data.map(item => item.id))
      .eq('status', 'issued')
      .order('created_at', { ascending: true });
    if (ticketError) throw ticketError;
    if (!storedTickets?.length) throw new Error('No active tickets were found for this paid order.');

    const tickets = storedTickets.map(ticket => {
      if (!ticket.credential_ciphertext || !itemNames.has(ticket.order_item_id)) {
        throw new Error('An issued ticket is missing its protected credential or ticket type.');
      }
      const credential = decryptTicketCredential(ticket.credential_ciphertext);
      if (createHash('sha256').update(credential).digest('hex') !== ticket.credential_hash) {
        throw new Error('An issued ticket credential failed integrity validation.');
      }
      return {
        reference: ticket.ticket_reference,
        attendeeName: ticket.attendee_name,
        ticketName: itemNames.get(ticket.order_item_id) || 'Event ticket',
        credential
      };
    });
    const configuredTheme = themeResult.data?.value && typeof themeResult.data.value === 'object'
      ? (themeResult.data.value as { theme?: unknown }).theme
      : null;
    const theme = isTicketThemeId(order.buyer_email_theme)
      ? order.buyer_email_theme
      : isTicketThemeId(configuredTheme) ? configuredTheme : defaultTicketTheme;
    const orderDetails: EmailOrder = {
      ...order,
      buyer_name: order.buyer_name || '',
      buyer_phone: order.buyer_phone || null
    };
    const qrImages = await Promise.all(tickets.map(ticket => QRCode.toDataURL(ticket.credential, {
      type: 'image/png',
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'H'
    })));
    const pdfAttachments = tickets.map((ticket, index) => ({
      filename: `ticket-${ticket.reference}.pdf`,
      content: createTicketPdf({
        theme,
        event,
        order: orderDetails,
        ticket,
        ticketIndex: index,
        ticketCount: tickets.length,
        qrDataUrl: qrImages[index]
      }),
      contentType: 'application/pdf'
    }));
    const inlineQrAttachments = await Promise.all(tickets.map(async (ticket, index) => ({
      filename: `ticket-${ticket.reference}-qr.png`,
      content: await QRCode.toBuffer(ticket.credential, {
        type: 'png',
        width: 420,
        margin: 2,
        errorCorrectionLevel: 'H'
      }),
      contentType: 'image/png',
      contentId: `ob-ticket-qr-${index + 1}`
    })));
    const html = ticketHtml({
      theme,
      event,
      order: orderDetails,
      tickets,
      organizerName: organizerResult.data?.name || undefined,
      promotionCode: promotionResult.data?.code || null,
      paymentMethod: paymentResult.data?.provider === 'payhero'
        ? 'M-Pesa'
        : paymentResult.data?.provider === 'paystack'
          ? 'Paystack'
          : paymentResult.data?.provider || undefined,
      emailSettings
    });
    const subjectDate = new Intl.DateTimeFormat('en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: event.timezone
    }).format(new Date(event.starts_at));
    const emailVariables = getEmailTemplateVariables({
      event,
      order: orderDetails,
      ticketCount: tickets.length,
      organizerName: organizerResult.data?.name || undefined
    });
    const emailSections = emailSettings.sections;
    const text = [
      renderEmailCopy(emailSettings.brandTitle, emailVariables),
      renderEmailCopy(emailSettings.brandSubtitle, emailVariables),
      '',
      renderEmailCopy(emailSettings.headingTemplate, emailVariables),
      '',
      renderEmailCopy(emailSettings.introTemplate, emailVariables),
      '',
      `Event: ${event.title}`,
      ...(emailSections.showEventTiming ? [`When: ${dateTime(event.starts_at, event.timezone)}${event.ends_at ? ` – ${dateTime(event.ends_at, event.timezone)}` : ''}`] : []),
      ...(emailSections.showDoors && event.doors_open_at ? [`Doors: ${dateTime(event.doors_open_at, event.timezone)}`] : []),
      ...(emailSections.showVenue ? [`Where: ${event.venue_name}${emailSections.showVenueAddress ? `, ${event.venue_address}` : ''}, ${event.city}`] : []),
      ...(emailSections.showVenue && emailSections.showDirections ? [`Directions: ${getDirectionsUrl(event)}`] : []),
      '',
      ...tickets.map((ticket, index) => [
        `${index + 1}/${tickets.length}`,
        ...(emailSections.showTicketType ? [ticket.ticketName] : []),
        ...(emailSections.showAttendeeName ? [ticket.attendeeName || orderDetails.buyer_name || 'Guest'] : []),
        ticket.reference
      ].join(' · ')),
      '',
      ...(emailSections.showFinancialSummary ? [
        `Order: ${orderDetails.reference}`,
        `Subtotal: ${formatCurrency(orderDetails.subtotal_minor, orderDetails.currency)}`,
        `Fees: ${formatCurrency(orderDetails.fees_minor, orderDetails.currency)}`,
        ...(orderDetails.discount_minor > 0 ? [`Discount: -${formatCurrency(orderDetails.discount_minor, orderDetails.currency)}`] : []),
        `Total paid: ${formatCurrency(orderDetails.total_minor, orderDetails.currency)}`
      ] : []),
      ...(emailSections.showBuyerContact ? [orderDetails.buyer_email] : []),
      ...(emailSections.showOrganizer && organizerResult.data?.name ? [`Organizer: ${organizerResult.data.name}`] : []),
      ...(emailSections.showEventDescription && event.description ? [event.description] : []),
      ...(emailSections.showArrivalGuides ? [
        ...(event.entrance_guide ? [`Entrance: ${event.entrance_guide}`] : []),
        ...(event.parking_guide ? [`Parking: ${event.parking_guide}`] : []),
        ...(event.transport_guide ? [`Transport: ${event.transport_guide}`] : [])
      ] : []),
      ...(emailSections.showCancellationPolicy && event.cancellation_policy ? [`Cancellation policy: ${event.cancellation_policy}`] : []),
      '',
      renderEmailCopy(emailSettings.closingTemplate, emailVariables)
    ].join('\n');
    const pdfs = pdfAttachments;
    const attachments = [
      ...pdfs,
      ...inlineQrAttachments,
      createCalendarAttachment(eventResult.data, orderDetails)
    ];
    const sentEmail = await sendTransactionalEmail({
      from: emailConfig.from,
      to: order.buyer_email,
      subject: renderEmailCopy(emailSettings.subjectTemplate, {
        ...emailVariables,
        event_date: subjectDate
      }).replace(/[\r\n]/g, ' ').trim(),
      html,
      text,
      attachments,
      idempotencyKey: `ticket-order-${order.id}`
    });
    if (sentEmail.messageId) {
      const { error: messageIdError } = await database.from('ticketing_email_deliveries')
        .update({ provider_message_id: sentEmail.messageId })
        .eq('order_id', order.id);
      if (messageIdError) console.error('[TicketingEmail] Could not link provider message ID to the order:', messageIdError);
    }
    await finishDelivery(database, order.id, true);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ticket email delivery error.';
    await finishDelivery(database, orderId, false, message);
    throw error;
  }
}
