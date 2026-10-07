// Disposable commerce acceptance: actual product import and HTTP routes, simulated payment only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const database = process.env.DATABASE_TEST_URL;
assert(
  database &&
    new URL(database).hostname === '127.0.0.1' &&
    new URL(database).pathname.endsWith('_test'),
);
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: database,
  REDIS_URL: 'redis://127.0.0.1:26379/15',
  JWT_SECRET: 'commerce-test-signing-only',
  SETTINGS_ENCRYPTION_KEY: 'commerce-test-encryption-only',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_GLOBAL_MAX: '10000',
});
const { testDatabase } = require('../test/integration/helpers.ts');
const { users } = require('../src/db/schema.ts');
const { buildApp } = require('../src/app.ts');
const { createServiceFactories } = require('../src/composition/service-factories.ts');
execFileSync(process.execPath, ['scripts/run-migrations.mjs'], { env: process.env, stdio: 'pipe' });
const { db, pool, env } = testDatabase();
const factories = createServiceFactories({
  getBillingProviderAdapter: () => ({
    code: 'wechat_pay',
    isConfigured: () => true,
    async preparePayment({ order }) {
      return {
        provider: 'wechat_pay',
        ...order,
        mode: 'native_qr',
        configured: true,
        integrationStatus: 'live',
        notifyUrl: 'https://acceptance.invalid/notify',
        nextStep: 'test-only',
        payload: { codeUrl: 'weixin://acceptance-only', qrCodeText: 'weixin://acceptance-only' },
      };
    },
  }),
});
const app = await buildApp(env, { factories });
const stages = [];
try {
  const [user] = await db
    .insert(users)
    .values({ email: randomUUID() + '@example.invalid', role: 'admin', emailVerified: true })
    .returning();
  const product = JSON.parse(readFileSync('app-products/lingcoo_retail_oms/product.json', 'utf8'));
  product.app.status = product.plans[0].status = product.offers[0].status = 'active';
  product.delivery.settings.values.APP_IMAGE =
    'registry.example.invalid/retail@sha256:' + 'a'.repeat(64);
  product.delivery.settings.values.ACR_USERNAME = 'acceptance-only';
  const file = join(mkdtempSync(join(tmpdir(), 'retail-commerce-')), 'product.json');
  writeFileSync(file, JSON.stringify(product));
  for (let i = 0; i < 2; i++)
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/scripts/import-app-product.ts',
        file,
        '--actor-user-id',
        user.id,
        '--require-secrets',
      ],
      { env: { ...process.env, RETAIL_OMS_ACR_PASSWORD: 'acceptance-only' }, stdio: 'pipe' },
    );
  stages.push('repeatable product import');
  const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: user.id, authVersion: 0 }) };
  const api = async (method, url, payload, status = 200) => {
    const r = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, status, `${method} ${url}: ${r.body}`);
    return r.json();
  };
  const catalog = await api('GET', '/v1/apps/lingcoo_retail_oms/catalog');
  assert(!JSON.stringify(catalog).includes('acceptance-only'));
  stages.push('catalog and secret redaction');
  const checkout = await api(
    'POST',
    '/v1/checkout/sessions',
    {
      appCode: product.app.code,
      planCode: product.plans[0].code,
      offerCode: product.offers[0].code,
      providerPreference: 'wechat_pay',
    },
    201,
  );
  for (let i = 0; i < 2; i++)
    await api('POST', `/v1/billing/orders/${checkout.order.orderNo}/mock-pay`, {});
  assert.equal(
    (await api('GET', `/v1/checkout/sessions/${checkout.sessionCode}/status`)).status,
    'paid',
  );
  const rights = await api('GET', '/v1/entitlements/me');
  assert.equal(rights.items.length, 1);
  stages.push('checkout and repeated simulated payment grants exactly one entitlement');
  const deployment = await api(
    'POST',
    '/v1/deployments',
    {
      appCode: product.app.code,
      entitlementId: rights.items[0].id,
      label: 'Commerce managed acceptance',
      deploymentMode: 'managed',
      environment: 'test',
      values: { INITIAL_ADMIN_EMAIL: 'owner@example.invalid' },
      secrets: { INITIAL_ADMIN_PASSWORD: randomUUID() + 'Aa1!' },
    },
    201,
  );
  assert.equal(deployment.managed.state, 'waiting_capacity');
  assert.equal(deployment.managed.accessUrl, null);
  stages.push('purchased entitlement creates managed deployment without false readiness');
  const result = {
    date: new Date().toISOString(),
    payment: 'simulated',
    controlPlane: 'isolated test database',
    stages,
    success: true,
  };
  writeFileSync(
    'docs/retail-commerce-acceptance-result.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
} finally {
  await app.close();
  await pool.end();
}
