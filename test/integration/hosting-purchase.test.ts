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
async function fixture() {
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
