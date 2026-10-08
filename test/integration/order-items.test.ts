import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { orders, plans, apps, checkoutSessions } from '../../src/db/schema';
import { BillingRepository } from '../../src/modules/billing/repository';
import { CheckoutService } from '../../src/modules/checkout/service';
import { createServiceFactories } from '../../src/composition/service-factories';
import { seedPurchase, testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
after(() => pool.end());
test('purchase snapshots survive catalog changes, are immutable, and appear in public checkout', async () => {
  const f = await seedPurchase(db);
  const item = {
    kind: 'software' as const,
    productId: f.plan.id,
    code: f.plan.code,
    title: 'Original purchase title',
    appName: 'Original application',
    interval: 'one_time' as const,
    quantity: 1,
    unitAmount: 1990,
    amount: 1990,
    currency: 'CNY',
  };
  const repository = new BillingRepository(db);
  const order = await repository.createOrder({
    userId: f.user.id,
    appId: f.app.id,
    planId: f.plan.id,
    orderNo: randomUUID(),
    provider: 'wechat_pay',
    subject: item.title,
    amount: 1990,
    currency: 'CNY',
    items: [item],
  });
  await db
    .update(plans)
    .set({ name: 'Renamed', priceAmount: 9999, interval: 'year' })
    .where(eq(plans.id, f.plan.id));
  await db.update(apps).set({ name: 'Renamed app' }).where(eq(apps.id, f.app.id));
  const code = randomUUID();
  await db.insert(checkoutSessions).values({
    sessionCode: code,
    userId: f.user.id,
    appId: f.app.id,
    planId: f.plan.id,
    orderId: order.id,
    provider: 'wechat_pay',
    actionType: 'qr_code',
    actionPayload: {},
    expiresAt: new Date(Date.now() + 60000),
  });
  const checkout = new CheckoutService(createServiceFactories(), db, env);
  const result = await checkout.getPublicSession(code);
  assert.equal(result.plan.name, item.title);
  assert.equal(result.plan.interval, 'one_time');
  assert.equal(result.app.name, item.appName);
  assert.deepEqual(result.order.items, [item]);
  assert.equal(result.order.amount, 1990);
  const owned = await checkout.getOwnedSession({ sessionCode: code, userId: f.user.id });
  assert.equal(owned.plan.priceAmount, 1990);
  assert.deepEqual(owned.order.items, [item]);
  await assert.rejects(
    db
      .update(orders)
      .set({ items: [{ ...item, title: 'Tampered' }] })
      .where(eq(orders.id, order.id)),
    (error: unknown) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      error.cause.message.includes('immutable'),
  );
  await assert.rejects(
    db.update(orders).set({ amount: 9999 }).where(eq(orders.id, order.id)),
    (error: unknown) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      error.cause.message.includes('immutable'),
  );
  await repository.markOrderPaidIfUnpaid({ orderId: order.id });
  assert.equal((await repository.findOrderById(order.id))?.status, 'paid');
  assert.deepEqual((await repository.findOrderById(f.order.id))?.items, []);
  await assert.rejects(
    repository.createOrder({
      userId: f.user.id,
      appId: f.app.id,
      planId: f.plan.id,
      orderNo: randomUUID(),
      provider: 'wechat_pay',
      subject: 'Invalid',
      amount: 100,
      currency: 'CNY',
      items: [item],
    }),
    /Invalid/,
  );
});

test('checkout only reuses a matching purchase snapshot and sends actual offer amount to provider', async () => {
  const f = await seedPurchase(db);
  const { appOffers } = await import('../../src/db/schema');
  const { WechatPayProvider } = await import('../../src/modules/billing/providers/wechat-pay');
  const { BillingService } = await import('../../src/modules/billing/service');
  const charged: number[] = [];
  class FakeProvider extends WechatPayProvider {
    override isConfigured() {
      return true;
    }
    override async preparePayment(
      context: import('../../src/modules/billing/providers/types').ProviderContext,
    ): Promise<import('../../src/modules/billing/providers/types').PreparedPayment> {
      charged.push(context.order.amount);
      return {
        provider: 'wechat_pay',
        orderNo: context.order.orderNo,
        amount: context.order.amount,
        currency: 'CNY',
        mode: 'native_qr',
        configured: true,
        integrationStatus: 'live',
        notifyUrl: 'https://example.test/notify',
        nextStep: '',
        payload: { codeUrl: 'weixin://fixture' },
      };
    }
  }
  const factories = {
    ...createServiceFactories(),
    getBillingProviderAdapter: () => new FakeProvider(),
  };
  const checkout = new CheckoutService(
    {
      ...factories,
      createBillingService: (executor, config) => new BillingService(factories, executor, config),
    },
    db,
    env,
  );
  await db.insert(appOffers).values({
    appId: f.app.id,
    planId: f.plan.id,
    code: f.plan.code,
    title: 'Original offer',
    priceAmount: 100,
    currency: 'CNY',
  });
  const input = {
    userId: f.user.id,
    appCode: f.app.code,
    planCode: f.plan.code,
    providerPreference: 'wechat_pay' as const,
  };
  const first = await checkout.createSession(input);
  const repeated = await checkout.createSession(input);
  assert.equal(repeated.sessionCode, first.sessionCode);
  assert.equal(first.plan.name, 'Original offer');
  await db.update(plans).set({ priceAmount: 250 }).where(eq(plans.id, f.plan.id));
  await db
    .update(appOffers)
    .set({ priceAmount: 250, title: 'New price' })
    .where(eq(appOffers.appId, f.app.id));
  const changed = await checkout.createSession(input);
  assert.notEqual(changed.sessionCode, first.sessionCode);
  assert.deepEqual(charged, [100, 250]);
  assert.equal((await checkout.getPublicSession(first.sessionCode)).plan.name, 'Original offer');
  assert.equal(changed.order.items[0]?.amount, 250);
});

test('admin order detail accepts persisted integer payment attempt numbers', async () => {
  const f = await seedPurchase(db);
  const { paymentAttempts } = await import('../../src/db/schema');
  const { AdminService } = await import('../../src/modules/admin/service');
  const { OrderDetailSchema } = await import('@lingcoo/contracts/models');
  const [session] = await db
    .insert(checkoutSessions)
    .values({
      sessionCode: randomUUID(),
      userId: f.user.id,
      appId: f.app.id,
      planId: f.plan.id,
      orderId: f.order.id,
      provider: 'wechat_pay',
      actionType: 'qr_code',
    })
    .returning();
  assert.ok(session);
  await db
    .insert(paymentAttempts)
    .values({
      checkoutSessionId: session.id,
      orderId: f.order.id,
      provider: 'wechat_pay',
      actionType: 'qr_code',
      status: 'prepared',
      attemptNo: 1,
    });
  const result = await new AdminService(createServiceFactories(), db, env).getOrderDetail(
    f.order.orderNo,
  );
  const parsed = OrderDetailSchema.parse(JSON.parse(JSON.stringify(result)));
  assert.equal(parsed.paymentAttempts[0]?.attemptNo, 1);
  assert.deepEqual(parsed.item.items, []);
});
