import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { billingWebhookEvents, entitlements, orders, planFeatures } from '../../src/db/schema';
import { BillingService } from '../../src/modules/billing/service';
import { WechatPayProvider } from '../../src/modules/billing/providers/wechat-pay';
import { seedPurchase, testDatabase } from './helpers';

const { db, pool, env } = testDatabase();
after(() => pool.end());
async function paymentFixture() {
  const fixture = await seedPurchase(db);
  return {
    ...fixture,
    notification: {
      kind: 'paid' as const,
      provider: 'wechat_pay' as const,
      providerEventId: fixture.order.orderNo,
      orderNo: fixture.order.orderNo,
      providerOrderId: 'test_provider_order',
      amount: 100,
      currency: 'CNY',
      paidAt: new Date(),
      payload: {},
    },
  };
}
test('duplicate and concurrent payment callbacks grant one entitlement', async () => {
  const fixture = await paymentFixture();
  const service = new BillingService(db, env);
  const results = await Promise.all([
    service.handlePaymentNotification(fixture.notification),
    service.handlePaymentNotification(fixture.notification),
  ]);
  assert.equal(results.filter((result) => result.duplicate).length, 1);
  const granted = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.sourceId, fixture.order.id));
  assert.equal(granted.length, 1);
  const replay = await service.handlePaymentNotification(fixture.notification);
  assert.equal(replay.duplicate, true);
});
for (const field of ['amount', 'currency'] as const) {
  test(`invalid payment ${field} rolls back callback and order writes`, async () => {
    const fixture = await paymentFixture();
    const invalid = {
      ...fixture.notification,
      ...(field === 'amount' ? { amount: 101 } : { currency: 'USD' }),
    };
    await assert.rejects(
      new BillingService(db, env).handlePaymentNotification(invalid),
      /mismatch/,
    );
    assert.equal(
      (await db.select().from(orders).where(eq(orders.id, fixture.order.id)))[0].status,
      'pending',
    );
    assert.equal(
      (
        await db
          .select()
          .from(billingWebhookEvents)
          .where(eq(billingWebhookEvents.providerEventId, fixture.notification.providerEventId))
      ).length,
      0,
    );
  });
}
test('entitlement failure rolls back the paid order and webhook record', async () => {
  const fixture = await paymentFixture();
  await db.delete(planFeatures).where(eq(planFeatures.planId, fixture.plan.id));
  await assert.rejects(
    new BillingService(db, env).handlePaymentNotification(fixture.notification),
    /feature mappings/,
  );
  assert.equal(
    (await db.select().from(orders).where(eq(orders.id, fixture.order.id)))[0].status,
    'pending',
  );
  assert.equal(
    (
      await db
        .select()
        .from(billingWebhookEvents)
        .where(eq(billingWebhookEvents.providerEventId, fixture.notification.providerEventId))
    ).length,
    0,
  );
});
test('refund reconciliation replay preserves revoked entitlement and skips the provider', async (t) => {
  const fixture = await paymentFixture();
  const service = new BillingService(db, env);
  await service.handlePaymentNotification(fixture.notification);
  await db.update(orders).set({ status: 'refunding' }).where(eq(orders.id, fixture.order.id));
  const provider = t.mock.method(WechatPayProvider.prototype, 'queryRefundPayment', async () => ({
    kind: 'refunded' as const,
    provider: 'wechat_pay' as const,
    orderNo: fixture.order.orderNo,
    amount: 100,
    currency: 'CNY',
    refundedAt: new Date(),
    payload: {},
    reason: 'fixture',
  }));
  await service.reconcileRefundByOrderNo(fixture.order.orderNo);
  assert.equal((await service.reconcileRefundByOrderNo(fixture.order.orderNo)).changed, false);
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.sourceId, fixture.order.id)))[0]
      .status,
    'cancelled',
  );
});
