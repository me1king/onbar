import type { SupabaseClient } from '@supabase/supabase-js';

export async function recordVerifiedPaystackPayment(
  database: SupabaseClient,
  input: {
    orderId: number;
    reference: string;
    amountKobo: number;
    source: 'webhook' | 'server_verification';
  }
) {
  const { error: insertError } = await database
    .from('payment_confirmations')
    .upsert({
      order_id: input.orderId,
      provider: 'Paystack',
      reference: input.reference,
      amount_kobo: input.amountKobo,
      currency: 'KES',
      confirmation_source: input.source
    }, { onConflict: 'reference', ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { data, error } = await database
    .from('payment_confirmations')
    .select('order_id, amount_kobo, currency')
    .eq('reference', input.reference)
    .maybeSingle();
  if (error) throw error;
  if (
    !data
    || Number(data.order_id) !== input.orderId
    || Number(data.amount_kobo) !== input.amountKobo
    || data.currency !== 'KES'
  ) {
    throw new Error('The payment reference has already been recorded for different order details.');
  }
}
