import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrderTimeline } from '../lib/orderTimeline.ts';
import { findPaymentReviewCases } from '../lib/paymentReview.ts';

test('public order timeline filters invalid records and keeps the latest events chronologically', () => {
  const events = normalizeOrderTimeline([
    { to_status: ' Packed ', created_at: '2026-01-02T10:00:00Z' },
    { to_status: 'Paid', created_at: 'not-a-date' },
    { to_status: 42, created_at: '2026-01-01T10:00:00Z' },
    { to_status: 'Created', created_at: '2026-01-01T09:00:00Z' },
    { to_status: 'Out for Delivery', created_at: '2026-01-03T10:00:00Z' }
  ], 2);

  assert.deepEqual(events, [
    { status: 'Packed', createdAt: '2026-01-02T10:00:00.000Z' },
    { status: 'Out for Delivery', createdAt: '2026-01-03T10:00:00.000Z' }
  ]);
});

test('payment review flags stale online payments and does not flag cash orders or fresh attempts', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');
  const cases = findPaymentReviewCases([
    { id: 1, status: 'Pending', payment_method: 'Paystack', total_price: 800, created_at: '2026-11-18T23:40:00Z' },
    { id: 2, status: 'Pending', payment_method: 'Daraja', total_price: 800, created_at: '2026-11-18T23:55:00Z' },
    { id: 3, status: 'Pending', payment_method: 'COD', total_price: 800, created_at: '2026-11-18T23:30:00Z' }
  ], [], now);

  assert.equal(cases.length, 1);
  assert.equal(cases[0].orderId, 1);
  assert.match(cases[0].reason, /15 minutes/);
});

test('payment review detects verified amount/provider mismatches and duplicate confirmations', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');
  const cases = findPaymentReviewCases([
    { id: 1, status: 'Paid', payment_method: 'Paystack', total_price: 800, created_at: '2026-11-18T23:50:00Z' },
    { id: 2, status: 'Paid', payment_method: 'PayHero', total_price: 900, created_at: '2026-11-18T23:50:00Z' }
  ], [
    { order_id: 1, provider: 'Paystack', amount_kobo: 79999, currency: 'KES' },
    { order_id: 2, provider: 'PayHero', amount_kobo: 90000, currency: 'KES' },
    { order_id: 2, provider: 'PayHero', amount_kobo: 90000, currency: 'KES' }
  ], now);

  assert.equal(cases.length, 2);
  assert.equal(cases[0].orderId, 1);
  assert.match(cases[0].reason, /do not match/);
  assert.equal(cases[1].orderId, 2);
  assert.match(cases[1].reason, /Multiple verified/);
});
