import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import {
  apps,
  orders,
  entitlements,
  orderItemRefunds,
  hostingPurchases,
  deployments,
} from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { createServiceFactories } from '../../src/composition/service-factories';
import { BillingService } from '../../src/modules/billing/service';
import { DeploymentService } from '../../src/modules/deployment/service';
import { WechatPayProvider } from '../../src/modules/billing/providers/wechat-pay';
import type {
  ProviderRefundContext,
  ProviderRefundQueryContext,
  PaymentRefundResult,
  PaymentRefundQueryResult,
} from '../../src/modules/billing/providers/types';
const { db, pool, env } = testDatabase();
after(() => pool.end());
async function fixture() {
  const f = await seedPurchase(db);
  const product = JSON.parse(readFileSync('app-products/lingcoo_retail_oms/product.json', 'utf8'));
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
  const [order] = await db
    .insert(orders)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      planId: f.plan.id,
      orderNo: `refund_${randomUUID()}`,
      subject: 'Software and hosting',
      provider: 'wechat_pay',
      amount: 300,
      items: [
        {
          kind: 'software',
          productId: f.plan.id,
          code: 'software',
          title: 'Software',
          appName: f.app.name,
          interval: 'one_time',
          quantity: 1,
          unitAmount: 100,
          amount: 100,
          currency: 'CNY',
        },
        {
          kind: 'hosting',
          productId: randomUUID(),
          code: 'hosting',
          title: 'Hosting',
          appName: f.app.name,
          interval: 'month',
          quantity: 1,
          unitAmount: 200,
          amount: 200,
          currency: 'CNY',
          hostingTerms: {
            offerVersion: 1,
            description: 'Managed hosting',
            graceDays: 7,
            retentionDays: 30,
          },
        },
      ],
    })
    .returning();
  assert.ok(order);
  let mode: 'success' | 'lost' | 'processing' | 'mismatch' | 'refused' = 'success';
  let query: 'success' | 'missing' | 'failed' = 'success';
  let calls = 0;
  const result = (c: ProviderRefundContext | ProviderRefundQueryContext): PaymentRefundResult => ({
    kind: mode === 'processing' ? 'processing' : 'refunded',
    provider: 'wechat_pay',
    orderNo: c.order.orderNo,
    providerOrderId: c.order.providerOrderId,
    amount: c.refund!.amount!,
    currency: 'CNY',
    refundRequestNo: mode === 'mismatch' ? 'wrong' : c.refund!.refundRequestNo,
    refundId: 'fake',
    refundedAt: new Date(),
    reason: 'fake result',
    payload: {},
  });
  class FakeProvider extends WechatPayProvider {
    override async refundPayment(c: ProviderRefundContext): Promise<PaymentRefundResult> {
      calls++;
      if (mode === 'lost') throw new Error('lost response');
      if (mode === 'refused')
        return {
          kind: 'not_refundable',
          provider: 'wechat_pay',
          orderNo: c.order.orderNo,
          refundRequestNo: c.refund!.refundRequestNo,
          payload: {},
          reason: 'refused',
        };
      return result(c);
    }
    override async queryRefundPayment(
      c: ProviderRefundQueryContext,
    ): Promise<PaymentRefundQueryResult> {
      if (query === 'missing' || query === 'failed')
        return {
          kind: query === 'missing' ? 'not_found' : 'failed',
          provider: 'wechat_pay',
          orderNo: c.order.orderNo,
          refundRequestNo: c.refund.refundRequestNo,
          payload: {},
          reason: 'query result',
        };
      return result(c) as PaymentRefundQueryResult;
    }
  }
  const capabilities = {
    ...createServiceFactories(),
    getBillingProviderAdapter: () => new FakeProvider(),
  };
  const billing = new BillingService(capabilities, db, env);
  const paid = await billing.mockPayOrder({ userId: f.user.id, orderNo: order.orderNo });
  const entitlement = paid.entitlements.items.find((e) => e.sourceId === order.id)!;
  const [grant] = await db
    .select()
    .from(hostingPurchases)
    .where(eq(hostingPurchases.orderId, order.id));
  assert.ok(grant);
  assert.ok(entitlement);
  return {
    ...f,
    order,
    billing,
    entitlement,
    grant,
    deploy: new DeploymentService(capabilities, db, env),
    setMode: (v: typeof mode) => (mode = v),
    setQuery: (v: typeof query) => (query = v),
    calls: () => calls,
    command: (kind: 'hosting' | 'software', amount: number) => ({
      requestId: randomUUID(),
      kind,
      amount,
      reason: 'Customer approved refund',
    }),
  };
}
test('item refunds preserve other lines and privileges, cap amounts and settle the parent only after all lines', async () => {
  const f = await fixture();
  const input = f.command('hosting', 50);
  let ledger = await f.billing.requestItemRefund(f.order.orderNo, f.user.id, input);
  assert.equal(ledger.lines.find((l) => l.kind === 'hosting')?.remaining, 150);
  assert.equal(ledger.orderStatus, 'paid');
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.id, f.entitlement.id)))[0]?.status,
    'active',
  );
  assert.equal(
    (await db.select().from(hostingPurchases).where(eq(hostingPurchases.id, f.grant.id)))[0]
      ?.status,
    'available',
  );
  await f.billing.requestItemRefund(f.order.orderNo, f.user.id, input);
  assert.equal(f.calls(), 1);
  await assert.rejects(
    db.update(orderItemRefunds).set({ amount: 1 }).where(eq(orderItemRefunds.id, input.requestId)),
  );
  await assert.rejects(
    db
      .update(orderItemRefunds)
      .set({ status: 'pending' })
      .where(eq(orderItemRefunds.id, input.requestId)),
  );
  await assert.rejects(db.delete(orderItemRefunds).where(eq(orderItemRefunds.id, input.requestId)));
  await assert.rejects(
    f.billing.requestItemRefund(f.order.orderNo, f.user.id, { ...input, amount: 51 }),
    /标识/,
  );
  await assert.rejects(f.billing.refundOrderByOrderNo(f.order.orderNo), /分项退款/);
  await assert.rejects(
    f.billing.requestItemRefund(f.order.orderNo, f.user.id, f.command('hosting', 151)),
    /余额/,
  );
  ledger = await f.billing.requestItemRefund(f.order.orderNo, f.user.id, f.command('hosting', 150));
  assert.equal(ledger.orderStatus, 'paid');
  assert.equal(
    (await db.select().from(hostingPurchases).where(eq(hostingPurchases.id, f.grant.id)))[0]
      ?.status,
    'revoked',
  );
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.id, f.entitlement.id)))[0]?.status,
    'active',
  );
  ledger = await f.billing.requestItemRefund(
    f.order.orderNo,
    f.user.id,
    f.command('software', 100),
  );
  assert.equal(ledger.orderStatus, 'refunded');
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.id, f.entitlement.id)))[0]?.status,
    'cancelled',
  );
  await f.billing.reconcileItemRefund(f.order.orderNo, input.requestId);
  assert.equal(f.calls(), 3);
});
test('uncertain requests retain reservation, block deployment and query stable ids without resubmission', async () => {
  const f = await fixture();
  f.setMode('lost');
  f.setQuery('missing');
  const input = f.command('hosting', 200);
  let ledger = await f.billing.requestItemRefund(f.order.orderNo, f.user.id, input);
  assert.equal(ledger.lines.find((l) => l.kind === 'hosting')?.pending, 200);
  await assert.rejects(
    f.deploy.createDeployment({
      userId: f.user.id,
      appCode: f.app.code,
      entitlementId: f.entitlement.id,
      hostingPurchaseId: f.grant.id,
      deploymentMode: 'managed',
      label: 'Blocked',
      environment: 'test',
    }),
    /退款/,
  );
  await f.billing.requestItemRefund(f.order.orderNo, f.user.id, input);
  assert.equal(f.calls(), 1);
  await assert.rejects(
    f.billing.reconcileItemRefund(f.order.orderNo, input.requestId, true),
    /尚未确认/,
  );
  f.setMode('success');
  f.setQuery('success');
  ledger = await f.billing.reconcileItemRefund(f.order.orderNo, input.requestId);
  assert.equal(ledger.records[0]?.status, 'succeeded');
  assert.equal(f.calls(), 1);
});
test('concurrent requests cannot exceed a line and partial software refund does not cancel entitlement', async () => {
  const f = await fixture();
  f.setMode('processing');
  const results = await Promise.allSettled(
    [f.command('software', 70), f.command('software', 70)].map((c) =>
      f.billing.requestItemRefund(f.order.orderNo, f.user.id, c),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls(), 1);
  const ledger = await f.billing.itemRefundLedger(f.order.orderNo);
  const id = ledger.records[0]!.id;
  await assert.rejects(
    f.deploy.createDeployment({
      userId: f.user.id,
      appCode: f.app.code,
      entitlementId: f.entitlement.id,
      deploymentMode: 'self_hosted',
      label: 'Blocked',
      environment: 'test',
    }),
    /退款/,
  );
  f.setMode('success');
  await f.billing.reconcileItemRefund(f.order.orderNo, id);
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.id, f.entitlement.id)))[0]?.status,
    'active',
  );
  assert.equal((await f.billing.itemRefundLedger(f.order.orderNo)).lines[0]?.remaining, 30);
});
test('mismatched responses remain pending; verified terminal failure restores availability', async () => {
  const f = await fixture();
  f.setMode('mismatch');
  const input = f.command('hosting', 200);
  assert.equal(
    (await f.billing.requestItemRefund(f.order.orderNo, f.user.id, input)).records[0]?.status,
    'pending',
  );
  f.setQuery('failed');
  await f.billing.reconcileItemRefund(f.order.orderNo, input.requestId);
  assert.equal((await f.billing.itemRefundLedger(f.order.orderNo)).lines[1]?.remaining, 200);
  assert.equal(
    (await db.select().from(hostingPurchases).where(eq(hostingPurchases.id, f.grant.id)))[0]
      ?.status,
    'available',
  );
  f.setMode('refused');
  const refused = f.command('hosting', 100);
  assert.equal(
    (await f.billing.requestItemRefund(f.order.orderNo, f.user.id, refused)).records.find(
      (r) => r.id === refused.requestId,
    )?.status,
    'failed',
  );
});
test('full refunds of deployed software or bound hosting require termination; partial compensation keeps deployment', async () => {
  const f = await fixture();
  const deployed = await f.deploy.createDeployment({
    userId: f.user.id,
    appCode: f.app.code,
    entitlementId: f.entitlement.id,
    hostingPurchaseId: f.grant.id,
    deploymentMode: 'managed',
    label: 'Bound',
    environment: 'test',
  });
  await assert.rejects(
    f.billing.requestItemRefund(f.order.orderNo, f.user.id, f.command('software', 100)),
    /服务终止/,
  );
  await assert.rejects(
    f.billing.requestItemRefund(f.order.orderNo, f.user.id, f.command('hosting', 200)),
    /服务终止/,
  );
  await f.billing.requestItemRefund(f.order.orderNo, f.user.id, f.command('hosting', 50));
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.id, deployed.id)))[0]?.status,
    'active',
  );
  assert.equal(
    (await db.select().from(hostingPurchases).where(eq(hostingPurchases.id, f.grant.id)))[0]
      ?.status,
    'bound',
  );
  assert.equal(f.calls(), 1);
});
test('refund API enforces ownership and finance permission; safe projection omits provider details', async () => {
  const f = await fixture();
  const other = await seedPurchase(db);
  const { buildApp } = await import('../../src/app');
  const app = await buildApp(env);
  try {
    const headers = { authorization: `Bearer ${app.jwt.sign({ sub: f.user.id, kind: 'user' })}` };
    const url = `/v1/billing/orders/${f.order.orderNo}/item-refunds`;
    const own = await app.inject({ method: 'GET', url, headers });
    assert.equal(own.statusCode, 200, own.body);
    const denied = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: other.user.id, kind: 'user' })}` },
    });
    assert.equal(denied.statusCode, 404);
    const write = await app.inject({
      method: 'POST',
      url: `/v1/admin/billing/orders/${f.order.orderNo}/item-refunds`,
      headers,
      payload: f.command('hosting', 50),
    });
    assert.equal(write.statusCode, 403);
    await f.billing.requestItemRefund(f.order.orderNo, f.user.id, f.command('hosting', 50));
    const record = (await app.inject({ method: 'GET', url, headers })).json().records[0];
    assert.equal(record.providerRefundId, undefined);
    assert.equal(record.actorId, undefined);
    assert.equal(
      (await db.select().from(orderItemRefunds).where(eq(orderItemRefunds.orderId, f.order.id)))
        .length,
      1,
    );
  } finally {
    await app.close();
  }
});
