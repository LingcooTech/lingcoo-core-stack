import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostingOfferCreateSchema, hostingOfferWriteSchema } from '@lingcoo/contracts';
const offer = {
  id: '00000000-0000-4000-8000-000000000001',
  appId: '00000000-0000-4000-8000-000000000002',
  code: 'retail-month',
  title: 'Retail',
  description: 'Hosting with backups',
  interval: 'month',
  priceAmount: 0,
  currency: 'CNY',
  graceDays: 7,
  retentionDays: 30,
  status: 'draft',
  reason: 'Draft commercial terms',
};
test('hosting offers require explicit policies and a positive integer price to publish', () => {
  assert.equal(hostingOfferCreateSchema.safeParse(offer).success, true);
  for (const patch of [
    { status: 'active' },
    { priceAmount: 19.9 },
    { priceAmount: -1 },
    { graceDays: undefined },
    { retentionDays: 0 },
    { currency: 'USD' },
    { priceAmount: 100000001 },
    { interval: 'one_time' },
    { appId: 'bad' },
    { extra: 'ignored?' },
  ]) {
    assert.equal(hostingOfferCreateSchema.safeParse({ ...offer, ...patch }).success, false);
  }
  assert.equal(
    hostingOfferCreateSchema.safeParse({ ...offer, priceAmount: 1990, status: 'active' }).success,
    true,
  );
});
test('hosting offer updates cannot change application or stable code', () => {
  const { id: _id, appId: _appId, code: _code, ...fields } = offer;
  const update = { ...fields, expectedVersion: 1 };
  assert.equal(hostingOfferWriteSchema.safeParse(update).success, true);
  assert.equal(hostingOfferWriteSchema.safeParse({ ...update, appId: _appId }).success, false);
  assert.equal(hostingOfferWriteSchema.safeParse({ ...update, code: _code }).success, false);
  assert.equal(hostingOfferWriteSchema.safeParse({ ...update, id: _id }).success, false);
});
