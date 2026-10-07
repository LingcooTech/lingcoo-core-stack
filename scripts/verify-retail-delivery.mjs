// Actual Stack HTTP + PostgreSQL + source-free Retail bundle + production containers.
// Payment adapter is explicitly simulated; no merchant calls or real charges occur.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildApp } = require('../src/app.ts');
const { loadEnv } = require('../src/lib/env.ts');
const schema = require('../src/db/schema.ts');
const { createServiceFactories } = require('../src/composition/service-factories.ts');
const { validateAppProduct } = require('../src/lib/app-product-validation.ts');
const { DeliverySettingsService } = require('../src/modules/deployment/delivery-settings.ts');

const database = process.env.DATABASE_TEST_URL;
if (
  !database ||
  !new URL(database).pathname.endsWith('_test') ||
  !['localhost', '127.0.0.1'].includes(new URL(database).hostname)
)
  throw new Error('Explicit local disposable DATABASE_TEST_URL ending in _test required');
const retail = resolve(
  process.env.RETAIL_SOURCE_DIR ??
    '../Industry-solutions/Retail-system-solution/lingcoo-retail-oms',
);
const bundle = resolve(
  process.env.RETAIL_DELIVERY_DIR ?? join(retail, 'dist/stack-delivery/bundle'),
);
const image = 'lingcoo-retail-oms:smoke-stack-onboarding';
const imageV2 = image + '-v2';
execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
const workspace = await mkdtemp(join(tmpdir(), 'stack-retail-acceptance-'));
const installation = join(workspace, 'instance');
const hostPort = 22000 + (process.pid % 1000);
const publicUrl = `http://127.0.0.1:${hostPort}`;
const pool = new Pool({ connectionString: database });
const db = drizzle(pool, { schema });
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: database,
  REDIS_URL: process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:16379/15',
  JWT_SECRET: 'retail-acceptance-signing-key-only',
  SETTINGS_ENCRYPTION_KEY: 'retail-acceptance-settings-key-only',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_GLOBAL_MAX: '10000',
});
const env = loadEnv();
// These factories affect only this disposable test process.
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
    async refundPayment({ order }) {
      return {
        kind: 'refunded',
        provider: 'wechat_pay',
        ...order,
        refundId: 'acceptance-only',
        refundRequestNo: 'acceptance-only',
        refundedAt: new Date(),
        payload: {},
        reason: 'simulated acceptance',
      };
    },
  }),
});
let app;
let project;
const installations = [];
let restoredProject;
const stages = [];
const stage = (name) => {
  stages.push(name);
  console.log('PASS ' + name);
};
async function child(command, arguments_, childEnv = {}) {
  await new Promise((accept, reject) => {
    const process_ = spawn(command, arguments_, {
      env: { ...process.env, ...childEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    process_.stdout.on('data', (chunk) => {
      output += chunk;
    });
    process_.stderr.on('data', (chunk) => {
      output += chunk;
    });
    process_.once('error', reject);
    process_.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error('Child failed: ' + output.slice(-1200))),
    );
  });
}
try {
  await child(process.execPath, ['scripts/run-migrations.mjs'], { DATABASE_URL: database });
  app = await buildApp(env, { factories });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  // PUBLIC_BASE_URL is read lazily by deployment/checkout services.
  env.PUBLIC_BASE_URL = address;
  const [buyer] = await db
    .insert(schema.users)
    .values({ email: `${randomUUID()}@example.test`, emailVerified: true })
    .returning();
  const [operator] = await db
    .insert(schema.users)
    .values({ email: `${randomUUID()}@example.test`, role: 'admin', emailVerified: true })
    .returning();
  const bearer = app.jwt.sign({ sub: buyer.id, authVersion: 0 });
  async function api(method, path, body, expected = 200, authorization = bearer) {
    const response = await fetch(address + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization: 'Bearer ' + authorization } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${path}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  }
  const product = validateAppProduct(
    JSON.parse(await readFile('app-products/lingcoo_retail_oms/product.json', 'utf8')),
  );
  product.app.status = 'active';
  product.plans[0].status = 'active';
  product.offers[0].status = 'active';
  product.delivery.settings.values.APP_IMAGE = image;
  product.delivery.settings.values.ACR_USERNAME = 'test-only';
  const productFile = join(workspace, 'product.json');
  await writeFile(productFile, JSON.stringify(product));
  await child(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'src/scripts/import-app-product.ts',
      productFile,
      '--actor-user-id',
      operator.id,
      '--require-secrets',
    ],
    { ...env, RETAIL_OMS_ACR_PASSWORD: 'non-production-test' },
  );
  await child(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'src/scripts/import-app-product.ts',
      productFile,
      '--actor-user-id',
      operator.id,
      '--require-secrets',
    ],
    { ...env, RETAIL_OMS_ACR_PASSWORD: 'non-production-test' },
  );
  const catalog = await api('GET', '/v1/apps/lingcoo_retail_oms/catalog');
  assert(
    catalog.offers?.length || catalog.items?.length,
    'Published catalog exposes the acceptance offer',
  );
  assert(!JSON.stringify(catalog).includes('non-production-test'));
  stage('repeatable product import, catalog and secret redaction');
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
  await api('POST', `/v1/billing/orders/${checkout.order.orderNo}/mock-pay`, {});
  await api('POST', `/v1/billing/orders/${checkout.order.orderNo}/mock-pay`, {});
  const owned = await api('GET', '/v1/entitlements/me');
  const entries = owned.items ?? owned.entitlements ?? owned;
  const rights = entries.filter(
    (entry) => entry.appId === catalog.app?.id || entry.app?.code === product.app.code,
  );
  assert.equal(rights.length, 1);
  assert.equal(
    (await api('GET', `/v1/checkout/sessions/${checkout.sessionCode}/status`)).status,
    'paid',
  );
  stage('checkout, simulated payment and exactly one entitlement');
  const deployment = await api(
    'POST',
    '/v1/deployments',
    {
      appCode: product.app.code,
      entitlementId: rights[0].id,
      label: 'Retail Stack acceptance',
      serverHost: '192.0.2.10',
      domainValues: { primaryDomain: 'retail.example.test' },
      values: { INITIAL_ADMIN_EMAIL: 'retail-owner@example.invalid' },
      secrets: { INITIAL_ADMIN_PASSWORD: 'Retail-Only-Initial-Password-2026!' },
    },
    201,
  );
  project = 'retail-' + deployment.id.replaceAll('-', '');
  installations.push({ project, directory: installation });
  await api(
    'POST',
    '/v1/deployments',
    { appCode: product.app.code, entitlementId: rights[0].id, label: 'Quota bypass' },
    409,
  );
  const otherBearer = app.jwt.sign({ sub: operator.id, authVersion: 0 });
  await api('POST', `/v1/deployments/${deployment.id}/tokens`, {}, 404, otherBearer);
  stage('deployment quota and customer ownership');
  const issued = await api('POST', `/v1/deployments/${deployment.id}/tokens`, {});
  await child(
    'python3',
    [
      join(bundle, 'stack-delivery.py'),
      'install',
      '--directory',
      installation,
      '--test-local',
      publicUrl,
    ],
    {
      FD_STACK_DEPLOY_TOKEN: issued.token,
      FD_STACK_EXCHANGE_URL: address + '/v1/deployments/bootstrap/exchange',
    },
  );
  await api('POST', '/v1/deployments/bootstrap/exchange', { token: issued.token }, 401, null);
  const configuration = await readFile(join(installation, '.env'), 'utf8');
  assert(
    !configuration.includes('INITIAL_ADMIN') &&
      !configuration.includes('BOOTSTRAP_OWNER_PASSWORD') &&
      !configuration.includes('ACR_PASSWORD'),
  );
  const composeArgs = [
    'compose',
    '-p',
    project,
    '--env-file',
    join(installation, '.env'),
    '-f',
    join(installation, 'docker-compose.prod.yml'),
  ];
  for (const service of ['api', 'worker', 'web']) {
    const id = execFileSync('docker', [...composeArgs, 'ps', '-q', service], {
      encoding: 'utf8',
    }).trim();
    const settings = JSON.parse(
      execFileSync('docker', ['inspect', '-f', '{{json .Config.Env}}', id], { encoding: 'utf8' }),
    );
    assert(!settings.some((value) => value.includes('Retail-Only-Initial-Password')));
  }
  for (const path of ['/', '/admin/', '/health/ready', '/health/worker'])
    assert.equal((await fetch(publicUrl + path)).status, 200);
  let deployments = await api('GET', '/v1/deployments/me');
  let record = (deployments.items ?? deployments).find((entry) => entry.id === deployment.id);
  assert.equal(record.meta.runtimeAssetsUpdate.current['retail-runtime'], image);
  assert(record.lastDeployedAt);
  stage('one-use token, actual API/Web/Worker and version report');
  const firstPostgres = execFileSync('docker', [...composeArgs, 'ps', '-q', 'postgres'], {
    encoding: 'utf8',
  }).trim();
  const psql = (container, sql) =>
    execFileSync(
      'docker',
      [
        'exec',
        container,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'app',
        '-d',
        'app',
        '-Atc',
        sql,
      ],
      { encoding: 'utf8' },
    ).trim();
  psql(
    firstPostgres,
    "CREATE TABLE stack_delivery_probe(value text); INSERT INTO stack_delivery_probe VALUES ('retained');",
  );
  const firstApi = execFileSync('docker', [...composeArgs, 'ps', '-q', 'api'], {
    encoding: 'utf8',
  }).trim();
  execFileSync('docker', [
    'exec',
    firstApi,
    'node',
    '-e',
    "require('node:fs').writeFileSync('/app/data/storage/stack-delivery-probe.txt', 'attachment-retained')",
  ]);
  const [secondBuyer] = await db
    .insert(schema.users)
    .values({ email: `${randomUUID()}@example.test`, emailVerified: true })
    .returning();
  const secondBearer = app.jwt.sign({ sub: secondBuyer.id, authVersion: 0 });
  const secondCheckout = await api(
    'POST',
    '/v1/checkout/sessions',
    {
      appCode: product.app.code,
      planCode: product.plans[0].code,
      offerCode: product.offers[0].code,
      providerPreference: 'wechat_pay',
    },
    201,
    secondBearer,
  );
  await api(
    'POST',
    `/v1/billing/orders/${secondCheckout.order.orderNo}/mock-pay`,
    {},
    200,
    secondBearer,
  );
  const secondRights = await api('GET', '/v1/entitlements/me', undefined, 200, secondBearer);
  const secondDeployment = await api(
    'POST',
    '/v1/deployments',
    {
      appCode: product.app.code,
      entitlementId: secondRights.items[0].id,
      label: 'Second customer',
      serverHost: '192.0.2.10',
      domainValues: { primaryDomain: 'second.example.test' },
      values: { INITIAL_ADMIN_EMAIL: 'retail-owner@example.invalid' },
      secrets: { INITIAL_ADMIN_PASSWORD: 'Retail-Only-Initial-Password-2026!' },
    },
    201,
    secondBearer,
  );
  const secondDirectory = join(workspace, 'second-instance');
  const secondProject = 'retail-' + secondDeployment.id.replaceAll('-', '');
  installations.push({ project: secondProject, directory: secondDirectory });
  const secondToken = await api(
    'POST',
    `/v1/deployments/${secondDeployment.id}/tokens`,
    {},
    200,
    secondBearer,
  );
  await child(
    'python3',
    [
      join(bundle, 'stack-delivery.py'),
      'install',
      '--directory',
      secondDirectory,
      '--test-local',
      `http://127.0.0.1:${hostPort + 1}`,
    ],
    {
      FD_STACK_DEPLOY_TOKEN: secondToken.token,
      FD_STACK_EXCHANGE_URL: address + '/v1/deployments/bootstrap/exchange',
    },
  );
  const secondConfiguration = await readFile(join(secondDirectory, '.env'), 'utf8');
  assert.notEqual(
    configuration.match(/POSTGRES_PASSWORD='([^']+)'/)[1],
    secondConfiguration.match(/POSTGRES_PASSWORD='([^']+)'/)[1],
  );
  const secondPostgres = execFileSync(
    'docker',
    [
      'compose',
      '-p',
      secondProject,
      '--env-file',
      join(secondDirectory, '.env'),
      '-f',
      join(secondDirectory, 'docker-compose.prod.yml'),
      'ps',
      '-q',
      'postgres',
    ],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(
    psql(secondPostgres, "SELECT to_regclass('public.stack_delivery_probe') IS NULL"),
    't',
  );
  const secondApi = execFileSync(
    'docker',
    [
      'compose',
      '-p',
      secondProject,
      '--env-file',
      join(secondDirectory, '.env'),
      '-f',
      join(secondDirectory, 'docker-compose.prod.yml'),
      'ps',
      '-q',
      'api',
    ],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(
    execFileSync(
      'docker',
      [
        'exec',
        secondApi,
        'node',
        '-e',
        "console.log(require('node:fs').existsSync('/app/data/storage/stack-delivery-probe.txt'))",
      ],
      { encoding: 'utf8' },
    ).trim(),
    'false',
  );
  stage('two customer instances with independent databases and credentials');
  const dockerfile = join(workspace, 'Dockerfile.update');
  await writeFile(
    dockerfile,
    `FROM ${image}\nENV APP_VERSION=stack-acceptance-v2\nLABEL org.opencontainers.image.version=stack-acceptance-v2\n`,
  );
  await child('docker', ['build', '-f', dockerfile, '-t', imageV2, workspace]);
  const [registeredApp] = await db
    .select()
    .from(schema.apps)
    .where(eq(schema.apps.code, product.app.code));
  await new DeliverySettingsService(db, env).upsertSettings(
    product.app.code,
    { values: { APP_IMAGE: imageV2 } },
    operator.id,
  );
  const nextToken = await api('POST', `/v1/deployments/${deployment.id}/tokens`, {});
  await child(
    'python3',
    [
      join(bundle, 'stack-delivery.py'),
      'update',
      '--directory',
      installation,
      '--test-local',
      publicUrl,
    ],
    {
      FD_STACK_DEPLOY_TOKEN: nextToken.token,
      FD_STACK_EXCHANGE_URL: address + '/v1/deployments/bootstrap/exchange',
    },
  );
  const apiId = execFileSync('docker', [...composeArgs, 'ps', '-q', 'api'], {
    encoding: 'utf8',
  }).trim();
  const oldId = execFileSync('docker', ['image', 'inspect', '-f', '{{.Id}}', image], {
    encoding: 'utf8',
  }).trim();
  const newId = execFileSync('docker', ['inspect', '-f', '{{.Image}}', apiId], {
    encoding: 'utf8',
  }).trim();
  assert.notEqual(oldId, newId);
  assert.equal(psql(firstPostgres, 'SELECT value FROM stack_delivery_probe'), 'retained');
  assert.equal(
    execFileSync(
      'docker',
      [
        'exec',
        apiId,
        'node',
        '-e',
        "console.log(require('node:fs').readFileSync('/app/data/storage/stack-delivery-probe.txt', 'utf8'))",
      ],
      { encoding: 'utf8' },
    ).trim(),
    'attachment-retained',
  );
  const backups = execFileSync('find', [join(installation, 'backups'), '-name', 'COMPLETE'], {
    encoding: 'utf8',
  });
  assert(backups.includes('COMPLETE'));
  assert.equal(
    configuration.match(/POSTGRES_PASSWORD='([^']+)'/)[1],
    (await readFile(join(installation, '.env'), 'utf8')).match(/POSTGRES_PASSWORD='([^']+)'/)[1],
  );
  stage('new image redeployment, coordinated backup and preserved credentials');
  deployments = await api('GET', '/v1/deployments/me');
  record = deployments.items.find((entry) => entry.id === deployment.id);
  assert.equal(record.meta.runtimeAssetsUpdate.current['retail-runtime'], imageV2);
  const backupDirectory = backups
    .trim()
    .split('\n')[0]
    .replace(/\/COMPLETE$/, '');
  restoredProject = 'oms-restore-stack-' + randomUUID().slice(0, 8);
  await child('sh', [
    join(installation, 'deploy/scripts/restore-isolated.sh'),
    backupDirectory,
    restoredProject,
    join(workspace, 'restore'),
  ]);
  assert.equal(
    psql(restoredProject + '-postgres', 'SELECT value FROM stack_delivery_probe'),
    'retained',
  );
  assert.equal(
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--mount',
        `type=volume,source=${restoredProject}-storage,target=/restore,readonly`,
        image,
        'node',
        '-e',
        "console.log(require('node:fs').readFileSync('/restore/stack-delivery-probe.txt', 'utf8'))",
      ],
      { encoding: 'utf8' },
    ).trim(),
    'attachment-retained',
  );
  stage('pre-upgrade database and attachment backup restored to a separate isolated project');
  await app.services.BillingService.refundOrderByOrderNo(checkout.order.orderNo);
  await api('POST', `/v1/deployments/${deployment.id}/tokens`, {}, 403);
  assert.equal(
    (await fetch(publicUrl + '/health/ready')).status,
    200,
    'Refund does not delete independently deployed customer data',
  );
  assert(registeredApp);
  stage('refund revokes further delivery without deleting customer application');
  const report = {
    date: new Date().toISOString(),
    payment: 'simulated',
    target: 'isolated-self-hosted-compose',
    customerInstances: 2,
    applicationImage: image,
    updateImage: imageV2,
    stages,
    productionPublished: false,
    managedHostingCertified: false,
  };
  await writeFile(
    'docs/retail-stack-acceptance-result.json',
    JSON.stringify(report, null, 2) + '\n',
  );
} finally {
  for (const { project: ownedProject, directory } of installations) {
    try {
      execFileSync(
        'docker',
        [
          'compose',
          '-p',
          ownedProject,
          '--env-file',
          join(directory, '.env'),
          '-f',
          join(directory, 'docker-compose.prod.yml'),
          'down',
          '-v',
        ],
        { stdio: 'ignore' },
      );
    } catch {
      /* only this fixture project */
    }
  }
  if (restoredProject) {
    for (const args of [
      ['rm', '-f', restoredProject + '-postgres'],
      ['network', 'rm', restoredProject],
      ['volume', 'rm', restoredProject + '-postgres', restoredProject + '-storage'],
    ]) {
      try {
        execFileSync('docker', args, { stdio: 'ignore' });
      } catch {
        /* only uniquely named restore fixture */
      }
    }
  }
  if (app) await app.close();
  await pool.end();
  await rm(workspace, { recursive: true, force: true });
}
