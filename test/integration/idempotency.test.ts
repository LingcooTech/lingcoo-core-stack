import { requireResult } from '../../src/db/required-result';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import {
  orders,
  idempotencyRequests,
  entitlements,
  deployments,
  users,
  checkoutSessions,
} from '../../src/db/schema';
import { WechatPayProvider } from '../../src/modules/billing/providers/wechat-pay';
import { BillingService } from '../../src/modules/billing/service';
import { createServiceFactories } from '../../src/composition/service-factories';
import { seedPurchase, testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
test('concurrent same-key orders share one provider operation and reject different payloads', async (t) => {
  const fixture = await seedPurchase(db);
  let calls = 0;
  t.mock.method(WechatPayProvider.prototype, 'isConfigured', () => true);
  t.mock.method(
    WechatPayProvider.prototype,
    'preparePayment',
    async (context: Parameters<WechatPayProvider['preparePayment']>[0]) => {
      calls++;
      await delay(150);
      return {
        provider: 'wechat_pay',
        orderNo: context.order.orderNo,
        amount: 100,
        currency: 'CNY',
        mode: 'native_qr',
        configured: true,
        integrationStatus: 'live',
        notifyUrl: 'https://example.test/notify',
        nextStep: 'Pay',
        payload: { codeUrl: 'weixin://fixture' },
      };
    },
  );
  const key = randomUUID();
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: fixture.user.id, kind: 'user' })}`,
    'idempotency-key': key,
  };
  const payload = {
    appCode: fixture.app.code,
    planCode: fixture.plan.code,
    provider: 'wechat_pay',
  };
  const results = await Promise.all(
    [1, 2].map(() => app.inject({ method: 'POST', url: '/v1/billing/orders', headers, payload })),
  );
  assert.deepEqual(
    results.map((r) => r.statusCode),
    [201, 201],
  );
  assert.deepEqual(
    requireResult(results[0], 'fixture array element').json(),
    requireResult(results[1], 'fixture array element').json(),
  );
  assert.equal(calls, 1);
  const mismatch = await app.inject({
    method: 'POST',
    url: '/v1/billing/orders',
    headers,
    payload: { ...payload, planCode: 'different' },
  });
  assert.equal(mismatch.statusCode, 409);
  const rows = await db.select().from(orders).where(eq(orders.userId, fixture.user.id));
  assert.equal(rows.length, 2);
  const records = await db.select().from(idempotencyRequests);
  assert(records.some((row) => (row.result as { version?: number })?.version === 2));
});
test('a failed provider response is safely replayed without another side effect', async (t) => {
  const fixture = await seedPurchase(db);
  let calls = 0;
  t.mock.method(WechatPayProvider.prototype, 'isConfigured', () => true);
  t.mock.method(WechatPayProvider.prototype, 'preparePayment', async () => {
    calls++;
    throw new Error('fixture-private-secret');
  });
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: fixture.user.id, kind: 'user' })}`,
    'idempotency-key': randomUUID(),
  };
  const payload = {
    appCode: fixture.app.code,
    planCode: fixture.plan.code,
    provider: 'wechat_pay',
  };
  for (let i = 0; i < 2; i++) {
    const result = await app.inject({
      method: 'POST',
      url: '/v1/billing/orders',
      headers,
      payload,
    });
    assert.equal(result.statusCode, 500);
    assert(!result.body.includes('fixture-private-secret'));
  }
  assert.equal(calls, 1);
});

test('deployment replay keeps the original resource and command correlation', async () => {
  const fixture = await seedPurchase(db);
  await new BillingService(createServiceFactories(), db, env).handlePaymentNotification({
    kind: 'paid',
    provider: 'wechat_pay',
    providerEventId: fixture.order.orderNo,
    orderNo: fixture.order.orderNo,
    providerOrderId: 'fixture',
    amount: 100,
    currency: 'CNY',
    paidAt: new Date(),
    payload: {},
  });
  const [entitlement] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.sourceId, fixture.order.id));
  if (!entitlement) throw new Error('Missing test fixture: entitlement');
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: fixture.user.id, kind: 'user' })}`,
    'idempotency-key': randomUUID(),
  };
  const payload = {
    appCode: fixture.app.code,
    entitlementId: entitlement.id,
    label: 'Replay fixture',
    environment: 'production',
  };
  const results = await Promise.all(
    [1, 2].map(() => app.inject({ method: 'POST', url: '/v1/deployments', headers, payload })),
  );
  assert.deepEqual(
    results.map((result) => result.statusCode),
    [201, 201],
  );
  assert.equal(
    requireResult(results[0], 'fixture array element').json().id,
    requireResult(results[1], 'fixture array element').json().id,
  );
  const records = await db
    .select()
    .from(deployments)
    .where(eq(deployments.entitlementId, entitlement.id));
  assert.equal(records.length, 1);
  assert.equal(
    typeof (requireResult(records[0], 'fixture array element').meta as { commandId?: string })
      .commandId,
    'string',
  );
});

test('checkout creation replays the shared response and retains one session', async (t) => {
  const fixture = await seedPurchase(db);
  t.mock.method(WechatPayProvider.prototype, 'isConfigured', () => true);
  let calls = 0;
  t.mock.method(
    WechatPayProvider.prototype,
    'preparePayment',
    async (context: Parameters<WechatPayProvider['preparePayment']>[0]) => {
      calls++;
      return {
        provider: 'wechat_pay',
        orderNo: context.order.orderNo,
        amount: 100,
        currency: 'CNY',
        mode: 'native_qr',
        configured: true,
        integrationStatus: 'live',
        notifyUrl: 'https://example.test/notify',
        nextStep: 'Pay',
        payload: { codeUrl: 'weixin://fixture' },
      };
    },
  );
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: fixture.user.id, kind: 'user' })}`,
    'idempotency-key': randomUUID(),
  };
  const payload = {
    appCode: fixture.app.code,
    planCode: fixture.plan.code,
    providerPreference: 'wechat_pay',
  };
  const responses = await Promise.all(
    [1, 2].map(() =>
      app.inject({ method: 'POST', url: '/v1/checkout/sessions', headers, payload }),
    ),
  );
  assert.deepEqual(
    responses.map((r) => r.statusCode),
    [201, 201],
  );
  assert.deepEqual(
    requireResult(responses[0], 'fixture array element').json(),
    requireResult(responses[1], 'fixture array element').json(),
  );
  assert.equal(calls, 1);
  const rows = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.userId, fixture.user.id));
  assert.equal(rows.length, 1);
  assert.equal(
    typeof (requireResult(rows[0], 'fixture array element').meta as { commandId?: string })
      .commandId,
    'string',
  );
});
test('admin refund replay invokes the provider once with its stable refund identifier', async (t) => {
  const fixture = await seedPurchase(db);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, fixture.user.id));
  await new BillingService(createServiceFactories(), db, env).handlePaymentNotification({
    kind: 'paid',
    provider: 'wechat_pay',
    providerEventId: fixture.order.orderNo,
    orderNo: fixture.order.orderNo,
    providerOrderId: 'fixture',
    amount: 100,
    currency: 'CNY',
    paidAt: new Date(),
    payload: {},
  });
  let calls = 0;
  t.mock.method(WechatPayProvider.prototype, 'refundPayment', async () => {
    calls++;
    await delay(100);
    return {
      kind: 'processing',
      provider: 'wechat_pay',
      orderNo: fixture.order.orderNo,
      refundId: 'fixture',
      refundRequestNo: fixture.order.orderNo + '_refund',
      amount: 100,
      currency: 'CNY',
      payload: {},
      reason: 'Processing',
    };
  });
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: fixture.user.id, kind: 'user' })}`,
    'idempotency-key': randomUUID(),
  };
  const responses = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        method: 'POST',
        url: '/v1/admin/orders/' + fixture.order.orderNo + '/refund',
        headers,
      }),
    ),
  );
  assert.deepEqual(
    responses.map((r) => r.statusCode),
    [200, 200],
  );
  assert.deepEqual(
    requireResult(responses[0], 'fixture array element').json(),
    requireResult(responses[1], 'fixture array element').json(),
  );
  assert.equal(calls, 1);
  assert(responses.some((r) => r.headers['idempotency-replayed'] === 'true'));
});
