import 'server-only';

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptTicketCredential, encryptTicketCredential } from '@/lib/ticketing/credentials.server';
import { getPublicBaseUrl } from '@/lib/utils';
import { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';
import { getWhatsAppCredentials } from '@/lib/whatsappCredentials';

type Database = SupabaseClient;

export { normalizeTicketPhoneNumber } from '@/lib/ticketing/phone';

export function encryptTicketWalletToken(token: string) {
  return encryptTicketCredential(token);
}

export async function sendTicketWalletWhatsApp(database: Database, orderId: string): Promise<'sent' | 'already_sent' | 'busy' | 'skipped'> {
  const { token, phoneId } = getWhatsAppCredentials();
  const templateName = process.env.WHATSAPP_TICKET_TEMPLATE_NAME?.trim();
  const templateLanguage = process.env.WHATSAPP_TICKET_TEMPLATE_LANGUAGE?.trim() || 'en';
  if (!token || !phoneId || !templateName) {
    throw new Error('Ticket WhatsApp delivery is not configured. Set WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_TICKET_TEMPLATE_NAME.');
  }
  if (!/^[a-z0-9_]{1,512}$/.test(templateName) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(templateLanguage)) {
    throw new Error('The configured ticket WhatsApp template name or language is invalid.');
  }

  const claimId = randomUUID();
  const { data: claim, error: claimError } = await database.rpc('ticketing_claim_whatsapp_delivery', {
    p_order_id: orderId,
    p_claim_id: claimId
  });
  if (claimError) throw new Error(`Ticket WhatsApp message could not be queued: ${claimError.message}`);
  const claimResult = claim as { status?: string; claim_id?: string } | null;
  if (claimResult?.status === 'sent') return 'already_sent';
  if (claimResult?.status === 'busy') return 'busy';
  if (claimResult?.status === 'skipped') return 'skipped';
  if (claimResult?.status !== 'claimed' || claimResult.claim_id !== claimId) {
    throw new Error('The paid ticket order could not be claimed for WhatsApp delivery.');
  }

  try {
    const { data: order, error: orderError } = await database.from('ticketing_orders')
      .select('id,status,reference,buyer_name,buyer_phone,access_token_ciphertext,event_id')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.status !== 'paid') throw new Error('Paid ticket order could not be found.');
    const recipient = typeof order.buyer_phone === 'string' ? normalizeTicketPhoneNumber(order.buyer_phone)?.slice(1) : null;
    if (!recipient || !order.access_token_ciphertext) {
      throw new Error('The order is missing the phone number or protected wallet link required for WhatsApp delivery.');
    }
    const { data: event, error: eventError } = await database.from('ticketing_events')
      .select('title')
      .eq('id', order.event_id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event?.title) throw new Error('Ticket event details could not be loaded.');

    const accessToken = decryptTicketCredential(order.access_token_ciphertext);
    if (!/^[0-9a-f]{64}$/.test(accessToken)) {
      throw new Error('The protected ticket-wallet link is invalid.');
    }
    const walletUrl = new URL('/tickets/confirmation', getPublicBaseUrl());
    walletUrl.searchParams.set('order', order.id);
    walletUrl.searchParams.set('token', accessToken);
    const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: event.title.slice(0, 1024) },
              { type: 'text', text: order.reference.slice(0, 1024) },
              { type: 'text', text: walletUrl.toString().slice(0, 1024) }
            ]
          }]
        }
      }),
      cache: 'no-store'
    });
    if (!response.ok) {
      const responseBody = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(responseBody?.error?.message || `WhatsApp delivery failed (${response.status}).`);
    }
    await finishWhatsAppDelivery(database, orderId, claimId, true);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown WhatsApp delivery error.';
    await finishWhatsAppDelivery(database, orderId, claimId, false, message);
    throw error;
  }
}

async function finishWhatsAppDelivery(database: Database, orderId: string, claimId: string, sent: boolean, message?: string) {
  const { data, error } = await database.rpc('ticketing_finish_whatsapp_delivery', {
    p_order_id: orderId,
    p_claim_id: claimId,
    p_sent: sent,
    p_error: message?.slice(0, 1000) || null
  });
  if (error || data !== true) {
    console.error('[TicketingWhatsApp] Could not record message delivery outcome:', error);
    throw new Error('Ticket WhatsApp delivery status could not be saved.');
  }
}
