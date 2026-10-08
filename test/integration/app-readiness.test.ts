import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { apps, users } from '../../src/db/schema';
import { testDatabase, seedPurchase } from './helpers';
import { AppService } from '../../src/modules/app/service';
import { AppReadiness } from '../../src/modules/app/readiness';
import { DeliverySettingsService } from '../../src/modules/deployment/delivery-settings';
import { createServiceFactories } from '../../src/composition/service-factories';
import { buildApp } from '../../src/app';
const { db, pool, env } = testDatabase();
after(() => pool.end());
const factories = createServiceFactories();
const service = new AppService(factories, db, env);
const readiness = new AppReadiness(db, env, factories);
const manifest = {
  version: '1',
  installer: {
    repoUrl: 'https://github.com/example/app',
    repoBranch: 'main',
    remoteInstallScriptUrl: 'https://example.com/install.sh',
    installPath: '/opt/app',
  },
  domainSlots: [],
  envFields: [],
  secretFields: [
    {
      key: 'REGISTRY_TOKEN',
      label: 'Registry',
      type: 'secret',
      scope: 'preset',
      required: true,
      editable: false,
      advanced: true,
    },
  ],
  assets: [
    {
      key: 'api',
      label: 'API',
      type: 'docker_image',
      required: true,
      visibility: 'private',
      image: 'registry.example.com/app@sha256:' + 'a'.repeat(64),
      authSecret: 'REGISTRY_TOKEN',
    },
  ],
};
async function fixture() {
  const { user } = await seedPurchase(db);
  const code = 'publish_' + randomUUID().replaceAll('-', '');
  const input: Parameters<AppService['upsertApp']>[1] = {
    name: 'Publication fixture',
    type: 'web_app',
    status: 'inactive',
    meta: { deliveryMode: 'one_click', deliveryManifest: structuredClone(manifest) },
    features: [{ code: code + '_access', name: 'Access', kind: 'boolean', status: 'active' }],
    plans: [
      {
        code: code + '_plan',
        name: 'Plan',
        billingProvider: 'wechat_pay',
        priceAmount: 100,
        currency: 'CNY',
        interval: 'one_time',
        status: 'active',
        featureCodes: [code + '_access'],
      },
    ],
    offers: [
      {
        code: 'standard',
        planCode: code + '_plan',
        title: 'Standard',
        priceAmount: 100,
        currency: 'CNY',
        status: 'active',
      },
    ],
  };
  await service.upsertApp(code, input, user.id);
  return { code, input, user };
}
test('draft is saveable but activation atomically fails without credentials; configured publication remains explicitly unverified online', async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      service.upsertApp(f.code, { ...f.input, status: 'active', name: 'Must rollback' }, f.user.id),
    { statusCode: 422 },
  );
  const [stored] = await db.select().from(apps).where(eq(apps.code, f.code));
  assert.equal(stored?.status, 'inactive');
  assert.equal(stored?.name, 'Publication fixture');
  const secret = 'private-test-value-never-return';
  await new DeliverySettingsService(db, env).upsertSettings(
    f.code,
    { secrets: { REGISTRY_TOKEN: secret } },
    f.user.id,
  );
  const report = await readiness.inspect(f.code);
  assert.equal(report.configurationReady, true);
  assert.equal(report.checks.find((c) => c.code === 'registry_live')?.status, 'unverified');
  assert.ok(!JSON.stringify(report).includes(secret));
  await service.upsertApp(f.code, { ...f.input, status: 'active' }, f.user.id);
  assert.equal((await readiness.inspect(f.code)).appStatus, 'active');
});
test('digest, active rights and formal pricing block reactivation; failed update preserves draft', async () => {
  const f = await fixture();
  await new DeliverySettingsService(db, env).upsertSettings(
    f.code,
    { secrets: { REGISTRY_TOKEN: 'fixture' } },
    f.user.id,
  );
  for (const change of [
    {
      meta: {
        deliveryMode: 'one_click',
        deliveryManifest: {
          ...manifest,
          assets: [{ ...manifest.assets[0], image: 'registry.example.com/app:latest' }],
        },
      },
    },
    { plans: f.input.plans!.map((p) => ({ ...p, meta: { acceptanceOnlyPrice: true } })) },
    { features: f.input.features!.map((p) => ({ ...p, status: 'inactive' as const })) },
    { offers: f.input.offers!.map((o) => ({ ...o, priceAmount: 0 })) },
  ]) {
    await assert.rejects(
      () => service.upsertApp(f.code, { ...f.input, ...change, status: 'active' }, f.user.id),
      { statusCode: 422 },
    );
    assert.equal((await readiness.inspect(f.code)).appStatus, 'inactive');
  }
});
test('readiness API enforces admin permission and serializes a safe report', async () => {
  const f = await fixture();
  const app = await buildApp(env);
  try {
    const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) };
    const url = '/v1/admin/apps/' + f.code + '/readiness';
    assert.equal((await app.inject({ method: 'GET', url, headers })).statusCode, 403);
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.user.id));
    const result = await app.inject({ method: 'GET', url, headers });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().scope, 'configuration');
    assert.equal(result.json().configurationReady, false);
  } finally {
    await app.close();
  }
});
test('switching active non-delivery app into one-click cannot bypass publication gate', async () => {
  const f = await fixture();
  await service.upsertApp(
    f.code,
    { ...f.input, status: 'active', meta: { deliveryMode: 'none' } },
    f.user.id,
  );
  await assert.rejects(
    () => service.upsertApp(f.code, { ...f.input, status: 'active' }, f.user.id),
    { statusCode: 422 },
  );
});

test('active CLI import enforces shared gate without ready-for-sale flag and rolls back configuration', async () => {
  const f = await fixture();
  const dir = await mkdtemp(join(tmpdir(), 'stack-publish-'));
  const file = join(dir, 'product.json');
  const product = {
    schemaVersion: 1,
    app: {
      code: f.code,
      name: 'Must roll back CLI',
      type: 'web_app',
      status: 'active',
      meta: { deliveryMode: 'one_click' },
    },
    features: f.input.features,
    plans: f.input.plans,
    offers: f.input.offers!.map((o) => ({ ...o, priceAmount: 0 })),
    delivery: {
      manifest,
      settings: { secretsFromEnv: { REGISTRY_TOKEN: 'TEST_PUBLISH_REGISTRY_TOKEN' } },
    },
  };
  try {
    await writeFile(file, JSON.stringify(product));
    await assert.rejects(
      () =>
        promisify(execFile)(
          process.execPath,
          [
            '--import',
            'tsx',
            'src/scripts/import-app-product.ts',
            file,
            '--actor-user-id',
            f.user.id,
          ],
          {
            env: {
              ...process.env,
              DATABASE_URL: process.env.DATABASE_TEST_URL,
              TEST_PUBLISH_REGISTRY_TOKEN: 'test-only-credential',
            },
          },
        ),
      (error: unknown) => {
        const e = error as { code: number; stderr: string };
        assert.equal(e.code, 1);
        assert.match(e.stderr, /422|published|configuration|\u53d1\u5e03/);
        return true;
      },
    );
    const [stored] = await db.select().from(apps).where(eq(apps.code, f.code));
    assert.equal(stored?.status, 'inactive');
    assert.equal(stored?.name, 'Publication fixture');
    const config = await new DeliverySettingsService(db, env).getOverview(f.code);
    assert.equal(config.secrets.REGISTRY_TOKEN?.configured, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
