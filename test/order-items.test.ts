import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateOrderItems, type OrderItem } from '@lingcoo/contracts';
const software: OrderItem = {
  kind: 'software',
  productId: '00000000-0000-4000-8000-000000000001',
  code: 'retail',
  title: 'Retail original',
  appName: 'Retail',
  interval: 'one_time',
  quantity: 1,
  unitAmount: 10000,
  amount: 10000,
  currency: 'CNY',
};
test('order items enforce exact integer totals and distinct same-currency components', () => {
  const hosting: OrderItem = {
    ...software,
    kind: 'hosting',
    interval: 'month',
    unitAmount: 1990,
    amount: 1990,
  };
  assert.equal(validateOrderItems([software, hosting], 11990, 'CNY').length, 2);
  for (const items of [
    [],
    [software, software],
    [{ ...software, amount: 1 }],
    [{ ...software, quantity: 0 }],
    [{ ...software, currency: 'USD' }],
    [{ ...software, unitAmount: 10000.5 }],
  ]) {
    assert.throws(() => validateOrderItems(items, 10000, 'CNY'));
  }
  assert.throws(() => validateOrderItems([software], 9999, 'CNY'));
});
