import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { apps, appOffers, hostingOffers, deployments } from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { createServiceFactories } from '../../src/composition/service-factories';
import { BillingService } from '../../src/modules/billing/service';
import { CheckoutService } from '../../src/modules/checkout/service';
import { HostingPurchases } from '../../src/modules/billing/hosting-purchases';
import { HostingServiceTerms } from '../../src/modules/deployment/hosting-service';
import { DeploymentService } from '../../src/modules/deployment/service';
import { WechatPayProvider } from '../../src/modules/billing/providers/wechat-pay';
import type {
  ProviderContext,
  PreparedPayment,
  PaymentRefundResult,
  PaymentRefundQueryResult,
} from '../../src/modules/billing/providers/types';
const { db, pool, env } = testDatabase();
after(() => pool.end());
const product = JSON.parse(readFileSync('app-products/lingcoo_retail_oms/product.json', 'utf8'));
async function fixture(clock = () => new Date()) {
  const f = await seedPurchase(db);
  await db
    .update(apps)
    .set({
      meta: {
        deliveryMode: 'one_click',
        deliveryManifest: {
          ...product.delivery.manifest,
          envFields: [],
          secretFields: [],
          assets: [],
        },
        hostingProfile: {
          enabled: true,
          domainField: 'primaryDomain',
          resources: { cpuMillis: 1000, memoryMb: 512, diskMb: 10240 },
        },
      },
    })
    .where(eq(apps.id, f.app.id));
  await db.insert(appOffers).values({
    appId: f.app.id,
    planId: f.plan.id,
    code: f.plan.code,
    title: 'Software',
    priceAmount: 100,
    currency: 'CNY',
  });
  const [offer] = await db
    .insert(hostingOffers)
    .values({
      id: randomUUID(),
      appId: f.app.id,
      code: 'monthly',
      title: 'Monthly hosting',
      description: 'Managed application hosting',
      interval: 'month',
      priceAmount: 1990,
      graceDays: 7,
      retentionDays: 30,
      status: 'active',
    })
    .returning();
  assert.ok(offer);
  let refunds = 0;
  let uncertain = false;
  const charged: number[] = [];
  class FakeProvider extends WechatPayProvider {
    override isConfigured() {
      return true;
    }
    override async preparePayment(context: ProviderContext): Promise<PreparedPayment> {
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
    override async refundPayment(context: ProviderContext): Promise<PaymentRefundResult> {
      refunds++;
      if (uncertain) throw new Error('fixture response lost');
      return {
        kind: 'refunded',
        provider: 'wechat_pay',
        orderNo: context.order.orderNo,
        amount: context.order.amount,
        currency: 'CNY',
        refundId: 'fixture',
        refundRequestNo: context.order.orderNo,
        refundedAt: new Date(),
        reason: 'test',
        payload: {},
      };
    }
  }
  FakeProvider.prototype.queryRefundPayment = async (
    context,
  ): Promise<PaymentRefundQueryResult> => ({
    kind: 'not_found',
    provider: 'wechat_pay',
    orderNo: context.order.orderNo,
    reason: 'fixture not yet visible',
    payload: {},
  });
  const factories = {
    ...createServiceFactories(),
    now: clock,
    getBillingProviderAdapter: () => new FakeProvider(),
  };
  const billing = new BillingService(factories, db, env);
  const checkout = new CheckoutService(
    {
      ...factories,
      createBillingService: (executor, config) => new BillingService(factories, executor, config),
    },
    db,
    env,
  );
  const input = {
    userId: f.user.id,
    appCode: f.app.code,
    planCode: f.plan.code,
    providerPreference: 'wechat_pay' as const,
    hosting: { offerId: offer.id, version: 1 },
  };
  return {
    ...f,
    offer,
    billing,
    checkout,
    input,
    charged,
    loseRefundResponse: () => {
      uncertain = true;
    },
    refunds: () => refunds,
    service: new DeploymentService(factories, db, env),
  };
}
test('combined checkout freezes policy, fulfills once and starts paid hosting only at first delivery', async () => {
  const f = await fixture();
  await assert.rejects(
    f.checkout.createSession({ ...f.input, hosting: { offerId: f.offer.id, version: 2 } }),
    /报价已变化/,
  );
  const session = await f.checkout.createSession(f.input);
  assert.equal(session.order.amount, 2090);
  assert.deepEqual(f.charged, [2090]);
  assert.equal(session.order.items[1]?.hostingTerms?.retentionDays, 30);
  const purchases = new HostingPurchases(db);
  assert.equal((await purchases.list(f.user.id)).items.length, 0);
  await db
    .update(hostingOffers)
    .set({ priceAmount: 4990, retentionDays: 60, version: 2 })
    .where(eq(hostingOffers.id, f.offer.id));
  const pay = { userId: f.user.id, orderNo: session.order.orderNo };
  await Promise.all([f.billing.mockPayOrder(pay), f.billing.mockPayOrder(pay)]);
  const grants = (await purchases.list(f.user.id)).items;
  assert.equal(grants.length, 1);
  const grant = grants[0]!;
  assert.equal(grant.item.amount, 1990);
  assert.equal(grant.item.hostingTerms?.retentionDays, 30);
  const payment = await f.billing.mockPayOrder(pay);
  const entitlement = payment.entitlements.items[0]!;
  assert.equal(payment.entitlements.items.length, 1);
  await assert.rejects(
    db.transaction((tx) => new HostingPurchases(tx).lockForBinding(grant.id, randomUUID())),
    /未找到/,
  );
  await assert.rejects(
    db.transaction((tx) =>
      new HostingPurchases(tx).bind(grant.id, randomUUID(), randomUUID(), f.user.id),
    ),
    /不匹配/,
  );
  assert.equal((await purchases.list(f.user.id)).items[0]?.status, 'available');
  const input = {
    userId: f.user.id,
    appCode: f.app.code,
    entitlementId: entitlement.id,
    hostingPurchaseId: grant.id,
    label: 'Paid managed test',
    environment: 'test',
    deploymentMode: 'managed' as const,
  };
  const results = await Promise.allSettled([
    f.service.createDeployment(input),
    f.service.createDeployment(input),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const success = results.find((r) => r.status === 'fulfilled');
  assert.ok(success?.status === 'fulfilled');
  const id = success.value.id;
  const terms = new HostingServiceTerms(db, () => new Date('2026-01-31T12:00:00Z'));
  assert.equal((await terms.read(id)).service?.source, 'paid');
  assert.equal((await terms.read(id)).service?.state, 'pending_delivery');
  assert.equal((await terms.read(id)).service?.retentionDays, 30);
  await assert.rejects(f.billing.refundOrderByOrderNo(session.order.orderNo), /托管已绑定/);
  assert.equal(f.refunds(), 0);
  await db.update(deployments).set({ hostingState: 'ready' }).where(eq(deployments.id, id));
  await terms.activateDelivered(id);
  await new HostingServiceTerms(db, () => new Date('2026-02-15T12:00:00Z')).activateDelivered(id);
  assert.equal((await terms.read(id)).service?.anchorAt, '2026-01-31T12:00:00.000Z');
  assert.equal((await terms.read(id)).service?.expiresAt, '2026-02-28T12:00:00.000Z');
});
test('refund reservation prevents binding, definitive full refund revokes the unbound grant', async () => {
  const f = await fixture();
  const session = await f.checkout.createSession(f.input);
  await f.billing.mockPayOrder({ userId: f.user.id, orderNo: session.order.orderNo });
  const purchases = new HostingPurchases(db);
  const grant = (await purchases.list(f.user.id)).items[0]!;
  await db.transaction((tx) => new HostingPurchases(tx).reserveRefund(grant.orderId));
  await assert.rejects(
    db.transaction((tx) => new HostingPurchases(tx).lockForBinding(grant.id, f.user.id)),
    /正在退款/,
  );
  await purchases.settleRefund(grant.orderId, false);
  assert.equal((await purchases.list(f.user.id)).items[0]?.status, 'available');
  await f.billing.refundOrderByOrderNo(session.order.orderNo);
  assert.equal(f.refunds(), 1);
  assert.equal((await purchases.list(f.user.id)).items[0]?.status, 'revoked');
  await f.billing.mockPayOrder({ userId: f.user.id, orderNo: session.order.orderNo });
  assert.equal((await purchases.list(f.user.id)).items[0]?.status, 'revoked');
});

test('ambiguous refund holds qualification and retries query without a second external refund', async () => {
  const f = await fixture();
  const session = await f.checkout.createSession(f.input);
  await f.billing.mockPayOrder({ userId: f.user.id, orderNo: session.order.orderNo });
  f.loseRefundResponse();
  await assert.rejects(f.billing.refundOrderByOrderNo(session.order.orderNo), /response lost/);
  const purchases = new HostingPurchases(db);
  const grant = (await purchases.list(f.user.id)).items[0]!;
  assert.equal(grant.status, 'refund_pending');
  await assert.rejects(f.billing.refundOrderByOrderNo(session.order.orderNo), /暂未确认/);
  assert.equal(f.refunds(), 1);
  await assert.rejects(
    db.transaction((tx) => new HostingPurchases(tx).lockForBinding(grant.id, f.user.id)),
    /正在退款/,
  );
});

test('existing software owners buy hosting alone and concurrent renewals extend one service without extra rights', async () => {
  const f = await fixture(() => new Date('2026-01-31T12:00:00Z'));
  const { entitlements, hostingServices } = await import('../../src/db/schema');
  const { HostingFulfillments } = await import('../../src/modules/billing/hosting-fulfillments');
  const initial = await f.billing.mockPayOrder({ userId: f.user.id, orderNo: f.order.orderNo });
  const entitlement = initial.entitlements.items[0]!;
  await db.update(appOffers).set({ status: 'inactive' }).where(eq(appOffers.appId, f.app.id));
  const standalone = await f.checkout.createSession({
    ...f.input,
    hostingOnly: { entitlementId: entitlement.id },
  });
  assert.equal(standalone.order.amount, 1990);
  assert.equal(standalone.order.items.length, 1);
  assert.equal(standalone.plan.interval, 'month');
  assert.equal(standalone.order.items[0]?.hostingTerms?.target?.kind, 'new');
  await f.billing.mockPayOrder({ userId: f.user.id, orderNo: standalone.order.orderNo });
  const grant = (await new HostingPurchases(db).list(f.user.id)).items[0]!;
  const deployed = await f.service.createDeployment({
    userId: f.user.id,
    appCode: f.app.code,
    entitlementId: entitlement.id,
    hostingPurchaseId: grant.id,
    label: 'Renewable service',
    environment: 'test',
    deploymentMode: 'managed',
  });
  await db
    .update(deployments)
    .set({ hostingState: 'ready' })
    .where(eq(deployments.id, deployed.id));
  const terms = new HostingServiceTerms(db, () => new Date('2026-01-31T12:00:00Z'));
  await terms.activateDelivered(deployed.id);
  const renewalInput = {
    ...f.input,
    hostingOnly: { entitlementId: entitlement.id, deploymentId: deployed.id },
  };
  const sessions = await Promise.all([
    f.checkout.createSession(renewalInput),
    f.checkout.createSession(renewalInput),
  ]);
  assert(sessions.every((s) => s.order.items[0]?.hostingTerms?.target?.kind === 'renewal'));
  await Promise.all(
    sessions.map((s) => f.billing.mockPayOrder({ userId: f.user.id, orderNo: s.order.orderNo })),
  );
  await f.billing.mockPayOrder({ userId: f.user.id, orderNo: sessions[0]!.order.orderNo });
  const service = (await terms.read(deployed.id)).service!;
  assert.equal(service.periods, 3);
  assert.equal(service.anchorAt, '2026-01-31T12:00:00.000Z');
  assert.equal(service.expiresAt, '2026-04-30T12:00:00.000Z');
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.userId, f.user.id))).length,
    1,
  );
  assert.equal((await new HostingPurchases(db).list(f.user.id)).items.length, 1);
  const receipts = await new HostingFulfillments(db).list(f.user.id);
  assert.equal(receipts.items.length, 3);
  assert(receipts.items.every((r) => r.status === 'applied'));
  await assert.rejects(f.billing.refundOrderByOrderNo(sessions[0]!.order.orderNo), /已履约续费/);
  assert.equal(f.refunds(), 0);
  await db
    .update(hostingServices)
    .set({ interval: 'year' })
    .where(eq(hostingServices.deploymentId, deployed.id));
  await assert.rejects(f.checkout.createSession(renewalInput), /沿用当前/);
});

test('payment after software withdrawal remains paid with a review receipt and no hosting qualification', async () => {
  const f = await fixture();
  const { entitlements, orders } = await import('../../src/db/schema');
  const { HostingFulfillments } = await import('../../src/modules/billing/hosting-fulfillments');
  const rights = await f.billing.mockPayOrder({ userId: f.user.id, orderNo: f.order.orderNo });
  const entitlement = rights.entitlements.items[0]!;
  await assert.rejects(
    f.checkout.createSession({ ...f.input, hostingOnly: { entitlementId: randomUUID() } }),
    /未找到/,
  );
  const session = await f.checkout.createSession({
    ...f.input,
    hostingOnly: { entitlementId: entitlement.id },
  });
  await assert.rejects(
    db
      .update(orders)
      .set({
        items: [
          {
            ...session.order.items[0]!,
            hostingTerms: {
              ...session.order.items[0]!.hostingTerms!,
              target: { kind: 'new', entitlementId: randomUUID() },
            },
          },
        ],
      })
      .where(eq(orders.orderNo, session.order.orderNo)),
  );
  await db
    .update(entitlements)
    .set({ status: 'cancelled' })
    .where(eq(entitlements.id, entitlement.id));
  const paid = await f.billing.mockPayOrder({ userId: f.user.id, orderNo: session.order.orderNo });
  assert.equal(paid.order.status, 'paid');
  assert.equal((await new HostingPurchases(db).list(f.user.id)).items.length, 0);
  const receipts = new HostingFulfillments(db);
  assert.equal((await receipts.list(f.user.id)).items[0]?.status, 'review');
  assert.equal((await receipts.list(randomUUID(), session.order.orderNo)).items.length, 0);
  const { buildApp } = await import('../../src/app');
  const app = await buildApp(env);
  try {
    const headers = { authorization: `Bearer ${app.jwt.sign({ sub: f.user.id, kind: 'user' })}` };
    const result = await app.inject({
      method: 'GET',
      url: `/v1/billing/hosting-fulfillments/${session.order.orderNo}`,
      headers,
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().items[0]?.status, 'review');
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/admin/billing/hosting-fulfillments/${session.order.orderNo}`,
      headers,
    });
    assert.equal(denied.statusCode, 403);
  } finally {
    await app.close();
  }
  await f.billing.refundOrderByOrderNo(session.order.orderNo);
  assert.equal((await receipts.list(f.user.id)).items[0]?.status, 'revoked');
});

for (const closing of ['cancelled', 'exit_requested'] as const) {
  test(`expired hosting renewal preserves terms; payment after ${closing} is reviewed`, async () => {
    let now = new Date('2026-01-31T12:00:00Z');
    const f = await fixture(() => now);
    const { HostingFulfillments } = await import('../../src/modules/billing/hosting-fulfillments');
    const combo = await f.checkout.createSession(f.input);
    const paid = await f.billing.mockPayOrder({ userId: f.user.id, orderNo: combo.order.orderNo });
    const entitlement = paid.entitlements.items[0]!;
    const grant = (await new HostingPurchases(db).list(f.user.id)).items[0]!;
    const deployed = await f.service.createDeployment({
      userId: f.user.id,
      appCode: f.app.code,
      entitlementId: entitlement.id,
      hostingPurchaseId: grant.id,
      label: 'Expired renewal',
      environment: 'test',
      deploymentMode: 'managed',
    });
    await db
      .update(deployments)
      .set({ hostingState: 'ready' })
      .where(eq(deployments.id, deployed.id));
    const terms = new HostingServiceTerms(db, () => now);
    await terms.activateDelivered(deployed.id);
    now = new Date('2026-03-05T12:00:00Z');
    const input = {
      ...f.input,
      hostingOnly: { entitlementId: entitlement.id, deploymentId: deployed.id },
    };
    const renewal = await f.checkout.createSession(input);
    await f.billing.mockPayOrder({ userId: f.user.id, orderNo: renewal.order.orderNo });
    const service = (await terms.read(deployed.id)).service!;
    assert.equal(service.anchorAt, '2026-03-05T12:00:00.000Z');
    assert.equal(service.expiresAt, '2026-04-05T12:00:00.000Z');
    const second = await f.checkout.createSession(input);
    await db
      .update(deployments)
      .set(closing === 'cancelled' ? { status: 'cancelled' } : { hostingState: 'exit_requested' })
      .where(eq(deployments.id, deployed.id));
    await f.billing.mockPayOrder({ userId: f.user.id, orderNo: second.order.orderNo });
    assert.equal(
      (await new HostingFulfillments(db).list(f.user.id, second.order.orderNo)).items[0]?.status,
      'review',
    );
    assert.equal((await terms.read(deployed.id)).service?.expiresAt, service.expiresAt);
  });
}

test('free software grant purchases and fulfills only paid hosting, without paid software rights', async () => {
  const f = await fixture();
  const { plans, entitlements } = await import('../../src/db/schema');
  const { LicenseService } = await import('../../src/modules/license/service');
  const [current] = await db.select().from(apps).where(eq(apps.id, f.app.id));
  await db
    .update(apps)
    .set({ meta: { ...(current!.meta as Record<string, unknown>), acquisition: 'free' } })
    .where(eq(apps.id, f.app.id));
  await db.update(plans).set({ priceAmount: 0 }).where(eq(plans.id, f.plan.id));
  await db.update(appOffers).set({ status: 'inactive' }).where(eq(appOffers.appId, f.app.id));
  const claim = await new LicenseService(createServiceFactories(), db).claimFreeApplication(
    f.app.code,
    f.user.id,
  );
  const session = await f.checkout.createSession({
    ...f.input,
    hostingOnly: { entitlementId: claim.entitlementId },
  });
  assert.equal(session.order.amount, 1990);
  assert.equal(session.order.items.length, 1);
  assert.equal(session.order.items[0]!.kind, 'hosting');
  await f.billing.mockPayOrder({ userId: f.user.id, orderNo: session.order.orderNo });
  const owned = await db.select().from(entitlements).where(eq(entitlements.appId, f.app.id));
  assert.equal(owned.length, 1);
  assert.equal(owned[0]!.sourceType, 'grant');
  const hosting = (await new HostingPurchases(db).list(f.user.id)).items;
  assert.equal(hosting.length, 1);
  const deployment = await f.service.createDeployment({
    userId: f.user.id,
    appCode: f.app.code,
    entitlementId: claim.entitlementId,
    hostingPurchaseId: hosting[0]!.id,
    label: 'Free app paid hosting',
    environment: 'test',
    deploymentMode: 'managed',
  });
  assert.equal(deployment.entitlementId, claim.entitlementId);
});
