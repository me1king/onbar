import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTicketOrderEmail } from '@/lib/ticketing/email.server';
import { sendTicketWalletWhatsApp } from '@/lib/ticketing/whatsapp.server';

type Database = SupabaseClient;
type DeliveryResult<T> = { status: 'sent'; value: T } | { status: 'failed'; error: Error };

async function captureDelivery<T>(operation: Promise<T>): Promise<DeliveryResult<T>> {
  try {
    return { status: 'sent', value: await operation };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error : new Error('Unknown ticket notification error.') };
  }
}

export async function sendTicketOrderNotifications(database: Database, orderId: string) {
  const [email, whatsapp] = await Promise.all([
    captureDelivery(sendTicketOrderEmail(database, orderId)),
    captureDelivery(sendTicketWalletWhatsApp(database, orderId))
  ]);
  return { email, whatsapp };
}

export function logTicketNotificationFailures(context: string, result: Awaited<ReturnType<typeof sendTicketOrderNotifications>>) {
  if (result.email.status === 'failed') {
    console.error(context, 'Ticket email delivery failed:', result.email.error);
  }
  if (result.whatsapp.status === 'failed') {
    console.error(context, 'Ticket WhatsApp delivery failed:', result.whatsapp.error);
  }
}
