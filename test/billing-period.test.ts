import test from 'node:test';
import assert from 'node:assert/strict';
import { billingPeriodEnd } from '../src/lib/billing-period';
test('calendar billing handles month ends, leap years and anchored renewals without drift', () => {
  const anchor = new Date('2026-01-31T16:23:45.678Z');
  assert.equal(billingPeriodEnd(anchor, 'month').toISOString(), '2026-02-28T16:23:45.678Z');
  assert.equal(billingPeriodEnd(anchor, 'month', 2).toISOString(), '2026-03-31T16:23:45.678Z');
  assert.equal(anchor.toISOString(), '2026-01-31T16:23:45.678Z');
  assert.equal(
    billingPeriodEnd(new Date('2024-01-31T00:00:00Z'), 'month').toISOString(),
    '2024-02-29T00:00:00.000Z',
  );
  assert.equal(
    billingPeriodEnd(new Date('2024-02-29T00:00:00Z'), 'year').toISOString(),
    '2025-02-28T00:00:00.000Z',
  );
  assert.equal(
    billingPeriodEnd(new Date('2026-12-15T00:00:00Z'), 'month').toISOString(),
    '2027-01-15T00:00:00.000Z',
  );
  for (const n of [0, -1, 1.5, NaN, 1201])
    assert.throws(() => billingPeriodEnd(anchor, 'month', n));
  assert.throws(() => billingPeriodEnd(new Date(NaN), 'month'));
});
