import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { apps, deployments, hostingNodes, users } from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { HostingRepository } from '../../src/modules/deployment/hosting';

const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
const product = JSON.parse(readFileSync('app-products/lingcoo_retail_oms/product.json', 'utf8'));
const resources = { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 };
async function fixture() {
  const seeded = await seedPurchase(db);
  const manifest = { ...product.delivery.manifest, envFields: [], secretFields: [], assets: [] };
  await db
    .update(apps)
    .set({
      meta: {
        deliveryMode: 'one_click',
        deliveryManifest: manifest,
        hostingProfile: { enabled: true, domainField: 'primaryDomain', resources },
      },
    })
    .where(eq(apps.id, seeded.app.id));
  await app.services.BillingService.mockPayOrder({
    userId: seeded.user.id,
    orderNo: seeded.order.orderNo,
  });
  const rights = await app.services.LicenseService.listUserEntitlements(seeded.user.id);
  const input = {
    userId: seeded.user.id,
    appCode: seeded.app.code,
    entitlementId: rights.items[0]!.id,
    label: 'Managed fixture',
    environment: 'test',
    deploymentMode: 'managed' as const,
  };
  return {
    ...seeded,
    input,
    headers: { authorization: `Bearer ${app.jwt.sign({ sub: seeded.user.id, kind: 'user' })}` },
  };
}

test('managed application waits without capacity; no token or fabricated readiness is exposed', async () => {
  const f = await fixture();
  const payload = {
    appCode: f.input.appCode,
    entitlementId: f.input.entitlementId,
    label: f.input.label,
    environment: f.input.environment,
    deploymentMode: f.input.deploymentMode,
  };
  const response = await app.inject({
    method: 'POST',
    url: '/v1/deployments',
    headers: f.headers,
    payload,
  });
  assert.equal(response.statusCode, 201, response.body);
  const result = response.json();
  assert.equal(result.managed.state, 'waiting_capacity');
  assert.match(result.managed.hostname, /^app-[a-f0-9]+\.app\.lingcoo\.com$/);
  assert.equal(result.managed.accessUrl, null);
  assert.equal(result.latestToken, null);
  assert.equal(result.lastDeployedAt, null);
  for (const route of ['tokens']) {
    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/deployments/${result.id}/${route}`,
      headers: f.headers,
      payload: {},
    });
    assert.equal(rejected.statusCode, 409, rejected.body);
  }
  const other = await fixture();
  const hidden = await app.inject({
    method: 'POST',
    url: `/v1/deployments/${result.id}/allocate`,
    headers: other.headers,
  });
  assert.equal(hidden.statusCode, 404);
  const changed = await app.inject({
    method: 'PATCH',
    url: `/v1/deployments/${result.id}`,
    headers: f.headers,
    payload: { domainValues: { primaryDomain: 'hijack.example.com' } },
  });
  assert.equal(changed.statusCode, 422);
  await app.services.DeploymentService.deactivateDeployment({
    deploymentId: result.id,
    userId: f.user.id,
  });
});

test('same prefix across distinct purchases is reserved once and never immediately reused', async () => {
  const first = await fixture(),
    second = await fixture();
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  const outcomes = await Promise.allSettled(
    [first, second].map((f) =>
      app.services.DeploymentService.createDeployment({ ...f.input, hostedPrefix: prefix }),
    ),
  );
  const success = outcomes.find((item) => item.status === 'fulfilled');
  assert(success?.status === 'fulfilled');
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  const index = outcomes.indexOf(success);
  await app.services.DeploymentService.deactivateDeployment({
    deploymentId: success.value.id,
    userId: [first, second][index]!.user.id,
  });
  await assert.rejects(
    () =>
      app.services.DeploymentService.createDeployment({
        ...[first, second][1 - index]!.input,
        hostedPrefix: prefix,
      }),
    /此前缀已被使用/,
  );
});

test('two purchases cannot oversubscribe one node; authenticated reports allocate queued requests', async () => {
  const repository = new HostingRepository(db);
  const node = await repository.createNode(
    { name: 'Integration node', serverIp: '192.0.2.201', capacity: resources },
    new Date(),
  );
  try {
    await repository.setEnabled(node.node.id, true);
    const first = await fixture(),
      second = await fixture();
    const pending = await Promise.all(
      [first, second].map((f) => app.services.DeploymentService.createDeployment(f.input)),
    );
    assert(pending.every((item) => item.managed?.state === 'waiting_capacity'));
    const url = `/v1/hosting/nodes/${node.node.id}/report`;
    const payload = { dockerReady: true, available: resources };
    const unauth = await app.inject({ method: 'POST', url, payload });
    assert.equal(unauth.statusCode, 401);
    const report = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${node.reportToken}` },
      payload,
    });
    assert.equal(report.statusCode, 200, report.body);
    await Promise.all(
      pending.map((item, i) =>
        app.services.DeploymentService.retryManagedAllocation({
          deploymentId: item.id,
          userId: [first, second][i]!.user.id,
        }),
      ),
    );
    const assigned = await db
      .select()
      .from(deployments)
      .where(eq(deployments.hostingNodeId, node.node.id));
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0]!.hostingState, 'pending_infrastructure');
    assert.equal(assigned[0]!.lastDeployedAt, null);
    const allocated = assigned[0]!;
    await app.services.DeploymentService.deactivateDeployment({
      deploymentId: allocated.id,
      userId: allocated.userId,
    });
    const report2 = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${node.reportToken}` },
      payload,
    });
    assert.equal(report2.statusCode, 200, report2.body);
    const next = await db
      .select()
      .from(deployments)
      .where(eq(deployments.hostingNodeId, node.node.id));
    assert.equal(next.length, 1);
    assert.notEqual(next[0]!.id, allocated.id);
    await app.services.DeploymentService.deactivateDeployment({
      deploymentId: next[0]!.id,
      userId: next[0]!.userId,
    });
    assert.equal(
      (await repository.nodeViews(new Date())).items.find((item) => item.id === node.node.id)!
        .reserved.memoryMb,
      0,
    );
    const denied = await app.inject({
      method: 'GET',
      url: '/v1/admin/hosting/nodes',
      headers: first.headers,
    });
    assert.equal(denied.statusCode, 403);
  } finally {
    await db.delete(hostingNodes).where(eq(hostingNodes.id, node.node.id));
  }
});

test('administrator registers an empty node and lists it without exposing its report credential', async () => {
  const f = await fixture();
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.user.id));
  const created = await app.inject({
    method: 'POST',
    url: '/v1/admin/hosting/nodes',
    headers: f.headers,
    payload: { name: 'Empty node', serverIp: '192.0.2.202', capacity: resources },
  });
  assert.equal(created.statusCode, 201, created.body);
  const result = created.json();
  try {
    assert.equal(result.node.reserved.memoryMb, 0);
    assert.equal(result.node.enabled, false);
    assert.equal(typeof result.reportToken, 'string');
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/admin/hosting/nodes',
      headers: f.headers,
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert(!listed.body.includes(result.reportToken));
    assert(!listed.body.includes('reportTokenHash'));
    const enabled = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/hosting/nodes/${result.node.id}`,
      headers: f.headers,
      payload: { enabled: true },
    });
    assert.equal(enabled.statusCode, 200, enabled.body);
    const view = (await new HostingRepository(db).nodeViews(new Date())).items.find(
      (item) => item.id === result.node.id,
    )!;
    assert.equal(view.healthy, false);
  } finally {
    await db.delete(hostingNodes).where(eq(hostingNodes.id, result.node.id));
  }
});
