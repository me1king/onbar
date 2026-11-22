import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviousMerchantDigestWeek } from '../lib/merchantWeeklyDigest.ts';

test('selects the previous complete Nairobi week on Monday from 09:00', () => {
  assert.deepEqual(
    getPreviousMerchantDigestWeek(new Date('2026-03-16T06:00:00.000Z')),
    { start: '2026-03-09', end: '2026-03-16' }
  );
});

test('does not send weekly summaries before Monday at 09:00 Nairobi time', () => {
  assert.equal(getPreviousMerchantDigestWeek(new Date('2026-03-16T05:59:00.000Z')), null);
  assert.equal(getPreviousMerchantDigestWeek(new Date('2026-03-17T10:00:00.000Z')), null);
});
