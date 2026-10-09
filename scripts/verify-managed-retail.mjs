// Explicit, disposable remote pilot. Never imports products into production Stack.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildApp } = require('../src/app.ts');
const { testDatabase, seedPurchase } = require('../test/integration/helpers.ts');
const { apps, users } = require('../src/db/schema.ts');
const { DeliverySettingsService } = require('../src/modules/deployment/delivery-settings.ts');
const { eq } = await import('drizzle-orm');
const database = process.env.DATABASE_TEST_URL;
assert(
  database &&
    new URL(database).hostname === '127.0.0.1' &&
    new URL(database).pathname.endsWith('_test'),
);
const host = process.env.HOSTING_PILOT_SSH;
assert(host && /^[a-zA-Z0-9._-]+$/.test(host), 'Explicit SSH alias required');
const image = process.env.PILOT_RUNTIME_IMAGE;
assert(image && /^[-a-zA-Z0-9./:_]+@sha256:[a-f0-9]{64}$/.test(image));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: database,
  REDIS_URL: process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:26379/15',
  JWT_SECRET: 'hosting-pilot-signing-only',
  SETTINGS_ENCRYPTION_KEY: 'hosting-pilot-encryption-only',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_GLOBAL_MAX: '10000',
});
const { db, pool, env } = testDatabase();
const id = randomUUID();
const workspace = await mkdtemp(join(tmpdir(), 'lingcoo-hosting-pilot-'));
const remote = '/opt/lingcoo-hosting-pilot-' + id;
const retail = resolve('../Industry-solutions/Retail-system-solution/lingcoo-retail-oms');
const bundle = join(workspace, 'bundle');
await mkdir(bundle);
const hashes = {};
for (const [source, destination] of [
  ['delivery/stack-delivery.py', 'stack-delivery.py'],
  ['docker-compose.prod.yml', 'docker-compose.prod.yml'],
  ['docker/Caddyfile', 'docker/Caddyfile'],
  ['deploy/scripts/backup.sh', 'deploy/scripts/backup.sh'],
  ['deploy/scripts/backup-metadata.mjs', 'deploy/scripts/backup-metadata.mjs'],
]) {
  await mkdir(resolve(bundle, destination, '..'), { recursive: true });
  await cp(join(retail, source), join(bundle, destination));
  hashes[destination] = createHash('sha256')
    .update(await readFile(join(bundle, destination)))
    .digest('hex');
}
const ssh = (command, input) =>
  execFileSync('ssh', ['-o', 'BatchMode=yes', host, command], {
    input,
    encoding: 'utf8',
    maxBuffer: 2_000_000,
  });
async function child(file, args, options = {}) {
  return new Promise((resolve_, reject) => {
    const task = spawn(file, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    task.stdout.on('data', (data) => {
      output += data;
    });
    task.stderr.on('data', (data) => {
      output += data;
    });
    task.on('error', reject);
    task.on('exit', (code) =>
      code === 0 ? resolve_(output) : reject(new Error(output.slice(-1500))),
    );
  });
}
const app = await buildApp(env);
let tunnel, deployment, config;
try {
  await app.listen({ host: '127.0.0.1', port: 28451 });
  env.PUBLIC_BASE_URL = 'http://127.0.0.1:28451';
  const f = await seedPurchase(db);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.user.id));
  const product = JSON.parse(
    await readFile('app-products/lingcoo_retail_oms/product.json', 'utf8'),
  );
  const resources = { cpuMillis: 1000, memoryMb: 1024, diskMb: 10240 };
  await db
    .update(apps)
    .set({
      code: 'lingcoo_retail_oms',
      meta: {
        deliveryMode: 'one_click',
        deliveryManifest: product.delivery.manifest,
        hostingProfile: { enabled: true, domainField: 'primaryDomain', resources },
      },
    })
    .where(eq(apps.id, f.app.id));
  await new DeliverySettingsService(db, env).upsertSettings(
    'lingcoo_retail_oms',
    {
      values: { APP_IMAGE: image, ACR_USERNAME: 'cached-image-pilot' },
      secrets: { ACR_PASSWORD: 'unused-cached-image-pilot' },
    },
    f.user.id,
  );
  const auth = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, authVersion: 0 }) };
  async function api(method, url, payload, headers = auth, expected = 200) {
    const response = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
    assert.equal(response.statusCode, expected, `${method} ${url}: ${response.statusCode}`);
    return response.json();
  }
  await api('POST', `/v1/billing/orders/${f.order.orderNo}/mock-pay`, {});
  const rights = await api('GET', '/v1/entitlements/me');
  const node = await api(
    'POST',
    '/v1/admin/hosting/nodes',
    { name: 'Disposable remote Retail pilot', serverIp: '118.25.36.15', capacity: resources },
    auth,
    201,
  );
  await api('PATCH', `/v1/admin/hosting/nodes/${node.node.id}`, { enabled: true });
  ssh(`umask 077; mkdir '${remote}'`);
  execFileSync('scp', ['-qr', bundle, host + ':' + remote + '/bundle']);
  execFileSync('scp', [
    '-q',
    'scripts/hosting-node-agent.py',
    'scripts/hosting-node-report.py',
    host + ':' + remote + '/',
  ]);
  const measured = JSON.parse(
    ssh(
      `python3 -c 'import runpy,json; m=runpy.run_path("${remote}/hosting-node-report.py"); print(json.dumps(m["collect"]("/opt")))'`,
    ),
  );
  assert(
    measured.available.memoryMb >= resources.memoryMb + 128,
    'Insufficient actual memory headroom for safe pilot',
  );
  await api('POST', `/v1/hosting/nodes/${node.node.id}/report`, measured, {
    authorization: 'Bearer ' + node.reportToken,
  });
  deployment = await api(
    'POST',
    '/v1/deployments',
    {
      appCode: 'lingcoo_retail_oms',
      entitlementId: rights.items[0].id,
      label: 'Remote managed pilot',
      deploymentMode: 'managed',
      environment: 'test',
      hostedPrefix: 'pilot-' + id.slice(0, 8),
      values: { INITIAL_ADMIN_EMAIL: 'pilot-owner@example.invalid' },
      secrets: { INITIAL_ADMIN_PASSWORD: randomUUID() + 'Aa1!' },
    },
    auth,
    201,
  );
  assert.equal(deployment.managed.state, 'pending_infrastructure');
  config = {
    stackUrl: env.PUBLIC_BASE_URL,
    nodeId: node.node.id,
    reportToken: node.reportToken,
    testLoopback: true,
    useCachedImagesOnly: true,
    adapters: {
      lingcoo_retail_oms: {
        ...JSON.parse(await readFile(join(retail, 'delivery/hosting-adapter.json'), 'utf8')),
        bundle: remote + '/bundle',
        hashes,
      },
    },
    workspace: remote + '/instances',
    portStart: 23451,
    portEnd: 23460,
  };
  ssh(`umask 077; cat > '${remote}/node.json'`, JSON.stringify(config));
  tunnel = spawn(
    'ssh',
    [
      '-N',
      '-o',
      'BatchMode=yes',
      '-o',
      'ExitOnForwardFailure=yes',
      '-R',
      '127.0.0.1:28451:127.0.0.1:28451',
      host,
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 15; i++) {
    try {
      await child('ssh', [
        '-o',
        'BatchMode=yes',
        host,
        'curl -fsS --max-time 2 http://127.0.0.1:28451/health >/dev/null',
      ]);
      break;
    } catch {
      if (i === 14) throw new Error('SSH pilot tunnel unavailable');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log('PASS real purchase entitlement, node report and managed allocation');
  console.log(
    await child('ssh', [
      '-o',
      'BatchMode=yes',
      host,
      `python3 '${remote}/hosting-node-agent.py' '${remote}/node.json'`,
    ]),
  );
  const record = (await api('GET', '/v1/deployments/me')).items.find(
    (item) => item.id === deployment.id,
  );
  assert.equal(record.managed.state, 'runtime_ready');
  assert.equal(record.managed.accessUrl, null);
  const project = 'retail-' + deployment.id.replaceAll('-', '');
  const metrics = ssh(
    `docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $(docker ps -q --filter 'label=com.docker.compose.project=${project}')`,
  );
  const report = {
    date: new Date().toISOString(),
    target: host,
    deploymentId: deployment.id,
    project,
    remoteDirectory: remote,
    payment: 'simulated',
    imageSource: 'existing immutable image cache',
    resources,
    runtimeState: record.managed.state,
    publicAccessCertified: false,
    metrics,
    stages: [
      'entitlement',
      'node assignment',
      'encrypted task',
      'database migration',
      'bootstrap',
      'API/Web/Worker health',
      'loopback HTTP',
    ],
    note: 'Runtime pilot only; no production DNS/TLS, payment or registry-download certification.',
  };
  await writeFile(join(workspace, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Private pilot artifacts: ' + workspace);
} finally {
  if (deployment) {
    const project = 'retail-' + deployment.id.replaceAll('-', '');
    // Stop only our new project. Preserve data for backup/restore verification.
    ssh(
      `ids=$(docker ps -q --filter 'label=com.docker.compose.project=${project}'); if [ -n "$ids" ]; then docker stop $ids >/dev/null; fi`,
    );
  }
  tunnel?.kill('SIGTERM');
  await app.close();
  await pool.end();
}
