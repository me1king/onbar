import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendTransactionalEmail } from '@/lib/jmsurfMail.server';
import { getPreviousMerchantDigestWeek } from '@/lib/merchantWeeklyDigest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character);
}

function missingPayoutMigration(error: { code?: string }) {
  return error.code === '42P01' || error.code === '42703';
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const period = getPreviousMerchantDigestWeek(new Date());
  if (!period) return NextResponse.json({ sent: 0, skipped: true, reason: 'outside_digest_window' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return NextResponse.json({ error: 'Merchant summaries are not configured.' }, { status: 503 });
  const database = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: preferences, error: preferencesError } = await database
    .from('merchant_weekly_digest_preferences')
    .select('application_id,recipient_email')
    .eq('enabled', true)
    .limit(1000);
  if (preferencesError) {
    console.error('[MerchantWeeklyDigest] Could not load opted-in merchants:', preferencesError);
    return NextResponse.json({ error: 'Weekly summary preferences could not be loaded.' }, { status: 503 });
  }
  if ((preferences || []).length === 1000) {
    return NextResponse.json({ error: 'The merchant digest batch limit was reached; increase pagination before sending.' }, { status: 503 });
  }

  let sent = 0;
  let failed = 0;
  for (const preference of preferences || []) {
    const { data: currentPreference, error: currentPreferenceError } = await database
      .from('merchant_weekly_digest_preferences')
      .select('enabled,recipient_email')
      .eq('application_id', preference.application_id)
      .maybeSingle();
    if (currentPreferenceError) {
      console.error('[MerchantWeeklyDigest] Could not recheck merchant consent:', currentPreferenceError);
      failed += 1;
      continue;
    }
    if (!currentPreference?.enabled) continue;

    const { data: deliveryId, error: claimError } = await database.rpc('claim_merchant_weekly_digest', {
      p_application_id: preference.application_id,
      p_week_start: period.start
    });
    if (claimError) {
      console.error('[MerchantWeeklyDigest] Could not claim digest delivery:', claimError);
      failed += 1;
      continue;
    }
    if (!deliveryId) continue;

    try {
      const { data: application, error: applicationError } = await database
        .from('merchant_applications')
        .select('business_name,trading_name')
        .eq('id', preference.application_id)
        .eq('status', 'approved')
        .maybeSingle();
      if (applicationError) throw applicationError;
      if (!application) throw new Error('The merchant application is no longer approved.');

      const { data: fulfillment, error: fulfillmentError } = await database
        .from('merchant_fulfillment_events')
        .select('order_id')
        .eq('application_id', preference.application_id)
        .eq('event_type', 'delivered')
        .gte('occurred_at', `${period.start}T00:00:00+03:00`)
        .lt('occurred_at', `${period.end}T00:00:00+03:00`)
        .limit(5000);
      if (fulfillmentError) throw fulfillmentError;
      if ((fulfillment || []).length === 5000) throw new Error('The weekly order batch limit was reached; increase pagination before sending.');
      const deliveredOrderIds = [...new Set((fulfillment || []).map(event => Number(event.order_id)).filter(Number.isSafeInteger))];
      let recordedItemValue = 0;
      let deliveredItemCount = 0;

      if (deliveredOrderIds.length) {
        const { data: items, error: itemsError } = await database
          .from('order_items')
          .select('id,order_id,unit_price')
          .in('order_id', deliveredOrderIds)
          .limit(5000);
        if (itemsError) throw itemsError;
        if ((items || []).length === 5000) throw new Error('The weekly order-item batch limit was reached; increase pagination before sending.');
        const itemIds = (items || []).map(item => Number(item.id)).filter(Number.isSafeInteger);
        const { data: batches, error: batchesError } = await database
          .from('merchant_product_batches')
          .select('id')
          .eq('application_id', preference.application_id)
          .limit(5000);
        if (batchesError) throw batchesError;
        const batchIds = (batches || []).map(batch => batch.id);
        if (batchIds.length && itemIds.length) {
          const { data: traces, error: tracesError } = await database
            .from('merchant_order_item_trace')
            .select('order_item_id,quantity')
            .in('batch_id', batchIds)
            .in('order_item_id', itemIds)
            .limit(5000);
          if (tracesError) throw tracesError;
          if ((traces || []).length === 5000) throw new Error('The weekly stock-trace batch limit was reached; increase pagination before sending.');
          const quantities = new Map<number, number>();
          for (const trace of traces || []) {
            const itemId = Number(trace.order_item_id);
            if (Number.isSafeInteger(itemId)) {
              quantities.set(itemId, (quantities.get(itemId) || 0) + Number(trace.quantity || 0));
            }
          }
          for (const item of items || []) {
            const quantity = quantities.get(Number(item.id)) || 0;
            recordedItemValue += quantity * Number(item.unit_price || 0);
            deliveredItemCount += quantity;
          }
        }
      }

      let paidPayoutAmount: number | null = null;
      const { data: payouts, error: payoutsError } = await database
        .from('merchant_settlements')
        .select('amount_kes')
        .eq('application_id', preference.application_id)
        .eq('status', 'paid')
        .gte('updated_at', `${period.start}T00:00:00+03:00`)
        .lt('updated_at', `${period.end}T00:00:00+03:00`)
        .limit(1000);
      if (payoutsError && !missingPayoutMigration(payoutsError)) throw payoutsError;
      if (!payoutsError) paidPayoutAmount = (payouts || []).reduce((total, payout) => total + Number(payout.amount_kes || 0), 0);

      const merchantName = application.trading_name || application.business_name;
      const formattedValue = `KES ${recordedItemValue.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
      const payoutText = paidPayoutAmount === null
        ? 'Payout details are unavailable until the verified merchant settlement ledger is installed.'
        : `Recorded paid payouts: KES ${paidPayoutAmount.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
      const title = `${merchantName} · weekly merchant summary`;
      const text = [
        `Week: ${period.start} to ${period.end} (Africa/Nairobi)`,
        `Delivered orders: ${deliveredOrderIds.length}`,
        `Delivered item units: ${deliveredItemCount}`,
        `Recorded delivered item value: ${formattedValue}`,
        payoutText,
        'Tips are not recorded in the verified merchant ledger.',
        'Item value is order-record data, not merchant earnings, a balance owed, or a payout promise.'
      ].join('\n');
      const html = `<h1>${escapeHtml(title)}</h1><p>Week: ${period.start} to ${period.end} (Africa/Nairobi)</p><ul><li>Delivered orders: ${deliveredOrderIds.length}</li><li>Delivered item units: ${deliveredItemCount}</li><li>Recorded delivered item value: ${escapeHtml(formattedValue)}</li><li>${escapeHtml(payoutText)}</li><li>Tips are not recorded in the verified merchant ledger.</li></ul><p>Item value is order-record data, not merchant earnings, a balance owed, or a payout promise.</p>`;
      const delivery = await sendTransactionalEmail({
        to: currentPreference.recipient_email,
        subject: `${merchantName} weekly summary · ${period.start}`,
        html,
        text,
        idempotencyKey: `merchant-weekly-digest-${preference.application_id}-${period.start}`
      });
      const { error: saveError } = await database
        .from('merchant_weekly_digest_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: delivery.messageId || null,
          error: null
        })
        .eq('id', deliveryId);
      if (saveError) throw saveError;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Weekly summary could not be sent.';
      console.error('[MerchantWeeklyDigest] Could not send merchant summary:', message);
      const { error: saveError } = await database
        .from('merchant_weekly_digest_deliveries')
        .update({ status: 'failed', error: message.slice(0, 1000) })
        .eq('id', deliveryId);
      if (saveError) console.error('[MerchantWeeklyDigest] Could not record failed delivery:', saveError);
      failed += 1;
    }
  }
  return NextResponse.json({ sent, failed, period: period.start });
}
