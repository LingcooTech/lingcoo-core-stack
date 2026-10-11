import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { apps, appOffers, passwordCredentials, deployments } from '../../src/db/schema';
import { hashPassword } from '../../src/lib/security';
import { WechatPayProvider } from '../../src/modules/billing/providers/wechat-pay';
import { seedPurchase, testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
let server: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  server = await buildApp(env);
});
after(async () => {
  await server.close();
  await pool.end();
});
for (const entry of ['extension', 'storefront'])
  test(`direct-access ${entry} purchase grants rights visible from both clients without deployment`, async (t) => {
    t.mock.method(WechatPayProvider.prototype, 'isConfigured', () => true);
    t.mock.method(
      WechatPayProvider.prototype,
      'preparePayment',
      async (context: { order: { orderNo: string; amount: number; currency: string } }) => ({
        provider: 'wechat_pay',
        ...context.order,
        mode: 'native_qr',
        configured: true,
        integrationStatus: 'live',
        notifyUrl: 'https://example.test/notify',
        nextStep: '',
        payload: { codeUrl: 'weixin://fixture' },
      }),
    );
    const f = await seedPurchase(db);
    const password = 'Direct-access-test-password';
    await db
      .insert(passwordCredentials)
      .values({ userId: f.user.id, passwordHash: hashPassword(password) });
    await db
      .update(apps)
      .set({ type: 'extension', meta: { deliveryMode: 'none' } })
      .where(eq(apps.id, f.app.id));
    await db.insert(appOffers).values({
      appId: f.app.id,
      planId: f.plan.id,
      code: 'pro',
      title: 'Pro',
      priceAmount: 100,
      currency: 'CNY',
    });
    const bearerLogin = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: f.user.email, password },
    });
    assert.equal(bearerLogin.statusCode, 200, bearerLogin.body);
    const extensionHeaders = { authorization: `Bearer ${bearerLogin.json().token}` };
    const browserLogin = await server.inject({
      method: 'POST',
      url: '/v1/auth/session/login',
      payload: { email: f.user.email, password },
    });
    assert.equal(browserLogin.statusCode, 200, browserLogin.body);
    const browserHeaders = {
      cookie: browserLogin.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      'x-csrf-token': browserLogin.json().csrfToken as string,
    };
    const headers = entry === 'extension' ? extensionHeaders : browserHeaders;
    const created = await server.inject({
      method: 'POST',
      url: '/v1/checkout/sessions',
      headers,
      payload: {
        appCode: f.app.code,
        planCode: f.plan.code,
        offerCode: 'pro',
        providerPreference: 'wechat_pay',
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const order = created.json().order;
    await server.services.BillingService.handlePaymentNotification({
      kind: 'paid',
      provider: 'wechat_pay',
      providerEventId: order.orderNo,
      orderNo: order.orderNo,
      providerOrderId: `provider_${order.orderNo}`,
      amount: 100,
      currency: 'CNY',
      paidAt: new Date(),
      payload: {},
    });
    const extension = await server.inject({
      method: 'GET',
      url: '/v1/entitlements/me',
      headers: extensionHeaders,
    });
    const browser = await server.inject({
      method: 'GET',
      url: '/v1/entitlements/me',
      headers: browserHeaders,
    });
    assert.equal(extension.statusCode, 200, extension.body);
    assert.deepEqual(extension.json(), browser.json());
    assert.ok(
      extension
        .json()
        .summary.some(
          (s: { appCode: string; featureCodes: string[] }) =>
            s.appCode === f.app.code && s.featureCodes.includes(f.plan.code),
        ),
    );
    assert.equal(
      (await db.select().from(deployments).where(eq(deployments.appId, f.app.id))).length,
      0,
    );
    const other = await seedPurchase(db);
    const response = await server.inject({
      method: 'GET',
      url: '/v1/entitlements/me',
      headers: { authorization: `Bearer ${server.jwt.sign({ sub: other.user.id, kind: 'user' })}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.json().summary.some((s: { appCode: string }) => s.appCode === f.app.code),
      false,
    );
  });
