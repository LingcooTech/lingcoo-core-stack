import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from '../../src/app';
import { seedPurchase, testDatabase } from './helpers';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { apps } from '../../src/db/schema';

const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});

test('mock payment returns the declared boolean and replay does not grant twice', async () => {
  const fixture = await seedPurchase(db);
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: fixture.user.id })}` };
  const path = `/v1/billing/orders/${fixture.order.orderNo}/mock-pay`;
  const first = await app.inject({ method: 'POST', url: path, headers });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().granted, true);
  const replay = await app.inject({ method: 'POST', url: path, headers });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().granted, false);
  assert.equal(replay.json().entitlements.items.length, 1);
});

test('token exchange is not deployment success; only a ready report records completion', async () => {
  const fixture = await seedPurchase(db);
  await app.services.BillingService.mockPayOrder({
    userId: fixture.user.id,
    orderNo: fixture.order.orderNo,
  });
  const rights = await app.services.LicenseService.listUserEntitlements(fixture.user.id);
  const entitlement = rights.items[0];
  assert(entitlement);
  const deployment = await app.services.DeploymentService.createDeployment({
    userId: fixture.user.id,
    appCode: fixture.app.code,
    entitlementId: entitlement.id,
    label: 'Ready reporting fixture',
    environment: 'test',
  });
  const issued = await app.services.DeploymentService.issueDeploymentToken({
    userId: fixture.user.id,
    deploymentId: deployment.id,
    expiresInHours: 1,
  });
  const exchanged = await app.services.DeploymentService.exchangeBootstrapToken(issued.token);
  assert.equal(exchanged.deployment!.lastDeployedAt, null);
  const token = exchanged.bootstrap.envDefaults.FD_STACK_STATUS_REPORT_TOKEN;
  assert(token);
  for (const health of ['unhealthy', 'ready'] as const) {
    const response: { statusCode: number; body: string } = await app.inject({
      method: 'POST',
      url: '/v1/deployments/status/report',
      payload: {
        deploymentId: deployment.id,
        token,
        runtimeHealth: health,
        runtimeAssets: { current: { runtime: 'fixture-image' } },
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const listed = await app.services.DeploymentService.listUserDeployments(fixture.user.id);
    const current = listed.items.find((entry) => entry.id === deployment.id);
    assert(current);
    if (health === 'unhealthy') assert.equal(current.lastDeployedAt, null);
    else assert(current.lastDeployedAt);
  }
});

test('delivery settings failure rolls back the entire product import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stack-import-rollback-'));
  const code = 'import_' + randomUUID().replaceAll('-', '');
  try {
    const product = JSON.parse(
      await readFile('app-products/lingcoo_retail_oms/product.json', 'utf8'),
    );
    product.app.code = code;
    product.features[0].code = code + '_feature';
    product.plans[0].code = code + '_plan';
    product.plans[0].featureCodes = [code + '_feature'];
    product.offers[0].planCode = code + '_plan';
    const file = join(directory, 'product.json');
    await writeFile(file, JSON.stringify(product));
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/import-app-product.ts',
        file,
        '--actor-user-id',
        randomUUID(),
      ],
      { encoding: 'utf8', env: { ...process.env, DATABASE_URL: process.env.DATABASE_TEST_URL } },
    );
    assert.notEqual(result.status, 0, 'Nonexistent settings actor must fail');
    const remaining = await db.select().from(apps).where(eq(apps.code, code));
    assert.equal(
      remaining.length,
      0,
      'Catalog and plan writes must roll back with delivery settings',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
