const ONLINE_PAYMENT_PROVIDERS = new Set(['Paystack', 'PayHero', 'Daraja']);
const PAYMENT_CONFIRMED_STATUSES = new Set([
  'Paid', 'Stock Reserved', 'Supplier Confirmed', 'Processing', 'Packed',
  'Dispatched', 'Picked Up', 'Out for Delivery', 'Delivered', 'Completed'
]);
const PENDING_PAYMENT_STATUSES = new Set(['Created', 'Pending', 'Payment Pending']);
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export type PaymentReviewOrder = {
  id: number;
  status: string;
  payment_method: string;
  total_price: number | string;
  created_at: string;
};

export type PaymentConfirmationRecord = {
  order_id: number;
  provider: string;
  amount_kobo: number | string;
  currency: string;
};

export type PaymentReviewCase = {
  orderId: number;
  provider: string;
  status: string;
  amountKsh: number;
  createdAt: string;
  reason: string;
};

export function findPaymentReviewCases(
  orders: PaymentReviewOrder[],
  confirmations: PaymentConfirmationRecord[],
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS
): PaymentReviewCase[] {
  const confirmationsByOrder = new Map<number, PaymentConfirmationRecord[]>();
  for (const confirmation of confirmations) {
    const rows = confirmationsByOrder.get(Number(confirmation.order_id)) || [];
    rows.push(confirmation);
    confirmationsByOrder.set(Number(confirmation.order_id), rows);
  }

  return orders.flatMap(order => {
    if (!ONLINE_PAYMENT_PROVIDERS.has(order.payment_method)) return [];
    const amountKsh = Number(order.total_price);
    const createdAtMs = Date.parse(order.created_at);
    if (!Number.isSafeInteger(order.id) || !Number.isFinite(amountKsh) || amountKsh < 0
      || !Number.isFinite(createdAtMs) || createdAtMs > now) return [];

    const orderConfirmations = confirmationsByOrder.get(order.id) || [];
    let reason: string | null = null;
    if (orderConfirmations.length > 1) {
      reason = 'Multiple verified payment records exist for this order.';
    } else if (orderConfirmations.length === 1) {
      const confirmation = orderConfirmations[0];
      const expectedAmountKobo = Math.round(amountKsh * 100);
      if (confirmation.provider !== order.payment_method
        || Number(confirmation.amount_kobo) !== expectedAmountKobo
        || confirmation.currency !== 'KES') {
        reason = 'Verified payment details do not match the order.';
      } else if (!PAYMENT_CONFIRMED_STATUSES.has(order.status)) {
        reason = 'Payment is verified, but the order has not advanced to Paid.';
      }
    } else if (PAYMENT_CONFIRMED_STATUSES.has(order.status)) {
      reason = 'Order is marked paid or in fulfillment without a verified payment record.';
    } else if (PENDING_PAYMENT_STATUSES.has(order.status) && now - createdAtMs >= staleAfterMs) {
      reason = 'Online payment has remained unconfirmed for more than 15 minutes.';
    }

    return reason ? [{
      orderId: order.id,
      provider: order.payment_method,
      status: order.status,
      amountKsh,
      createdAt: new Date(createdAtMs).toISOString(),
      reason
    }] : [];
  }).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}
