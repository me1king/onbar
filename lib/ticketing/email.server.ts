import 'server-only';

import QRCode from 'qrcode';
import { Resend } from 'resend';
import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/serverSupabase';
import { decryptTicketCredential } from '@/lib/ticketing/credentials.server';
import { defaultTicketTheme, isTicketThemeId } from '@/lib/ticketing/theme';

type Database = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

const palettes = {
  midnight: { background: '#17121e', panel: '#28232e', foreground: '#fff7e6', muted: '#d4c7ae', accent: '#d6a83f', border: '#756443' },
  'official-white': { background: '#f8fafc', panel: '#ffffff', foreground: '#0f172a', muted: '#475569', accent: '#c2410c', border: '#cbd5e1' },
  'royal-violet': { background: '#f5f3ff', panel: '#ffffff', foreground: '#2e1065', muted: '#5b4b78', accent: '#6d28d9', border: '#c4b5fd' },
  emerald: { background: '#ecfdf5', panel: '#ffffff', foreground: '#064e3b', muted: '#3f6359', accent: '#047857', border: '#a7f3d0' }
} as const;

type EmailTicket = {
  reference: string;
  attendeeName: string;
  ticketName: string;
  credential: string;
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

function ticketHtml(input: {
  theme: keyof typeof palettes;
  event: { title: string; starts_at: string; doors_open_at: string | null; venue_name: string; venue_address: string; city: string; timezone: string; age_limit: number | null };
  order: { reference: string; total_minor: number; currency: string; buyer_name: string };
  tickets: EmailTicket[];
}) {
  const palette = palettes[input.theme];
  const tickets = input.tickets.map((ticket, index) => {
    const qrId = `ob-ticket-qr-${index + 1}`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid ${palette.border};border-radius:18px;border-collapse:separate;background:${palette.panel};color:${palette.foreground};overflow:hidden">
      <tr>
        <td style="padding:24px 22px;vertical-align:middle">
          <div style="color:${palette.accent};font:700 11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">ONLINE BAR · ADMIT ONE · ${index + 1} / ${input.tickets.length}</div>
          <div style="margin-top:10px;font:700 27px/1.12 Georgia,serif">${escapeHtml(input.event.title)}</div>
          <div style="margin-top:14px;color:${palette.muted};font:700 13px Arial,sans-serif">${escapeHtml(ticket.ticketName)}</div>
          <div style="margin-top:7px;color:${palette.foreground};font:14px Arial,sans-serif">${escapeHtml(ticket.attendeeName || input.order.buyer_name || 'Guest')}</div>
          <div style="margin-top:15px;color:${palette.muted};font:12px/1.6 Arial,sans-serif">
            <b style="color:${palette.foreground}">WHEN</b> &nbsp;${escapeHtml(dateTime(input.event.starts_at, input.event.timezone))}<br>
            ${input.event.doors_open_at ? `<b style="color:${palette.foreground}">DOORS</b> &nbsp;${escapeHtml(dateTime(input.event.doors_open_at, input.event.timezone))}<br>` : ''}
            <b style="color:${palette.foreground}">WHERE</b> &nbsp;${escapeHtml(input.event.venue_name)} · ${escapeHtml(input.event.city)}<br>
            ${input.event.venue_address ? `${escapeHtml(input.event.venue_address)}<br>` : ''}
            ${input.event.age_limit !== null ? `<b style="color:${palette.foreground}">AGE</b> &nbsp;${input.event.age_limit}+<br>` : ''}
            <b style="color:${palette.foreground}">TICKET</b> &nbsp;${escapeHtml(ticket.reference)}
          </div>
        </td>
        <td width="190" align="center" style="width:190px;padding:18px 14px;border-left:2px dashed ${palette.border};vertical-align:middle;text-align:center">
          <div style="font:700 15px Arial,sans-serif;letter-spacing:2px">ADMIT<br>ONE</div>
          <img src="cid:${qrId}" width="142" height="142" alt="Secure entry QR code for ${escapeHtml(ticket.reference)}" style="display:block;width:142px;height:142px;margin:12px auto 8px;background:#fff;border:7px solid #fff;border-radius:8px">
          <div style="color:${palette.muted};font:10px Arial,sans-serif">SCAN AT THE GATE</div>
        </td>
      </tr>
    </table>`;
  }).join('');

  return `<!doctype html><html><body style="margin:0;padding:24px 10px;background:${palette.background};color:${palette.foreground};font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px">
        <tr><td style="padding:12px 4px 22px">
          <div style="color:${palette.accent};font:700 11px Arial,sans-serif;letter-spacing:3px">ONLINE BAR TICKETING</div>
          <h1 style="margin:10px 0 7px;font:700 27px Georgia,serif">You’re in. Your ticket is ready.</h1>
          <p style="margin:0;color:${palette.muted};font:14px/1.6 Arial,sans-serif">Payment confirmed. Save this email and present each ticket’s QR code at the entrance. Every ticket is valid for one scan.</p>
        </td></tr>
        <tr><td>${tickets}</td></tr>
        <tr><td style="padding:4px 5px 18px;color:${palette.muted};font:12px/1.7 Arial,sans-serif">
          Order <b style="color:${palette.foreground}">${escapeHtml(input.order.reference)}</b> · Paid ${escapeHtml(new Intl.NumberFormat('en-KE', { style: 'currency', currency: input.order.currency.trim(), maximumFractionDigits: 2 }).format(input.order.total_minor / 100))}<br>
          Keep your QR codes private. Event details in this ticket reflect the information available when it was sent.
        </td></tr>
        <tr><td style="border-top:1px solid ${palette.border};padding:15px 5px;color:${palette.muted};font:11px/1.6 Arial,sans-serif">Ticket issue confirmed by ONLINE BAR · This email contains your valid entry credentials. Do not forward the QR codes.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from || !/^(?:[^<>]+<[^<>@\s]+@[^<>@\s]+>|[^<>\s@]+@[^<>\s@]+)$/.test(from)) {
    throw new Error('Ticket email delivery is not configured. Set RESEND_API_KEY and a verified RESEND_FROM_EMAIL.');
  }
  const resend = new Resend(apiKey);
  const { data: claim, error: claimError } = await database.rpc('ticketing_claim_email_delivery', {
    p_order_id: orderId
  });
  if (claimError) throw new Error(`Ticket email could not be queued: ${claimError.message}`);
  if (claim === 'sent') return 'already_sent';
  if (claim === 'busy') return 'busy';
  if (claim !== 'claimed') throw new Error('Tickets can only be emailed after the order is paid.');

  try {
    const { data: order, error: orderError } = await database.from('ticketing_orders')
      .select('id,reference,status,total_minor,currency,buyer_email,buyer_name,event_id')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.status !== 'paid') throw new Error('Paid ticket order could not be found.');

    const [eventResult, itemsResult, themeResult] = await Promise.all([
      database.from('ticketing_events')
        .select('title,starts_at,doors_open_at,venue_name,venue_address,city,timezone,age_limit')
        .eq('id', order.event_id)
        .maybeSingle(),
      database.from('ticketing_order_items')
        .select('id,ticket_name_snapshot')
        .eq('order_id', order.id),
      database.from('settings').select('value').eq('key', 'ticketing_theme').eq('is_published', true).maybeSingle()
    ]);
    if (eventResult.error || itemsResult.error || themeResult.error) {
      throw eventResult.error || itemsResult.error || themeResult.error;
    }
    if (!eventResult.data || !itemsResult.data?.length) throw new Error('Ticket event details could not be loaded.');
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
    const theme = isTicketThemeId(configuredTheme) ? configuredTheme : defaultTicketTheme;
    const attachments = await Promise.all(tickets.map(async (ticket, index) => ({
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
      event: eventResult.data,
      order: { ...order, buyer_name: order.buyer_name || '' },
      tickets
    });
    const result = await resend.emails.send({
      from,
      to: order.buyer_email,
      subject: `Your ticket${tickets.length === 1 ? '' : 's'}: ${eventResult.data.title.replace(/[\r\n]/g, ' ').trim()}`,
      html,
      attachments
    }, { idempotencyKey: `ticket-order-${order.id}` });
    if (result.error) throw new Error(result.error.message);
    await finishDelivery(database, order.id, true);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ticket email delivery error.';
    await finishDelivery(database, orderId, false, message);
    throw error;
  }
}
