import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { composeInstallJobSchema } from '@lingcoo/contracts';
import { buildApp } from '../../src/app';
import {
  apps,
  deployments,
  hostingNodes,
  users,
  appReleases,
  deploymentComposeBindings,
  deploymentComposeRequests,
} from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { ComposeBindingService } from '../../src/modules/deployment/compose-binding';
import { composeRuntimeFixture } from '../fixtures/compose-runtime';
import { definitionDigest } from '../../src/modules/app/definition';
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
    allowUnpaidHosting: true,
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
  const unpaid = await app.inject({
    method: 'POST',
    url: '/v1/deployments',
    headers: f.headers,
    payload,
  });
  assert.equal(unpaid.statusCode, 422, unpaid.body);
  const forged = await app.inject({
    method: 'POST',
    url: '/v1/deployments',
    headers: f.headers,
    payload: { ...payload, allowUnpaidHosting: true },
  });
  assert.equal(forged.statusCode, 400, forged.body);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.user.id));
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
    const payload = {
      dockerReady: true,
      available: resources,
      supportedApps: [first.app.code, second.app.code],
    };
    const unauth = await app.inject({ method: 'POST', url, payload });
    assert.equal(unauth.statusCode, 401);
    const unsupported = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${node.reportToken}` },
      payload: { ...payload, supportedApps: [] },
    });
    assert.equal(unsupported.statusCode, 200);
    for (const [i, item] of pending.entries()) {
      const queued = await app.services.DeploymentService.retryManagedAllocation({
        deploymentId: item.id,
        userId: [first, second][i]!.user.id,
      });
      assert(queued);
      assert.equal(
        queued.managed?.state,
        'waiting_capacity',
        'a healthy node without the adapter must not receive the app',
      );
    }
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

test('node execution is scoped, replayable, encrypted and never implies public readiness', async () => {
  const f = await fixture();
  const image = 'registry.example/retail@sha256:' + 'a'.repeat(64);
  await db
    .update(apps)
    .set({
      meta: {
        deliveryMode: 'one_click',
        hostingProfile: { enabled: true, domainField: 'primaryDomain', resources },
        deliveryManifest: {
          ...product.delivery.manifest,
          envFields: [
            {
              key: 'APP_IMAGE',
              label: 'Runtime',
              type: 'text',
              scope: 'preset',
              required: true,
              defaultValue: image,
            },
          ],
          secretFields: [],
          assets: [],
        },
      },
    })
    .where(eq(apps.id, f.app.id));
  const repository = new HostingRepository(db);
  const node = await repository.createNode(
    { name: 'Execution node', serverIp: '192.0.2.203', capacity: resources },
    new Date(),
  );
  const node2 = await repository.createNode(
    { name: 'Other node', serverIp: '192.0.2.204', capacity: resources },
    new Date(),
  );
  let id: string | undefined;
  try {
    await repository.setEnabled(node.node.id, true);
    await repository.report(
      node.node.id,
      node.reportToken,
      { dockerReady: true, available: resources, supportedApps: [f.app.code] },
      new Date(),
    );
    const deployment = await app.services.DeploymentService.createDeployment(f.input);
    id = deployment.id;
    const headers = { authorization: `Bearer ${node.reportToken}` };
    const url = `/v1/hosting/nodes/${node.node.id}`;
    assert.equal(
      (await app.inject({ method: 'POST', url: url + '/claim', payload: {} })).statusCode,
      401,
    );
    const claim = await app.inject({ method: 'POST', url: url + '/claim', headers, payload: {} });
    assert.equal(claim.statusCode, 200, claim.body);
    const job = claim.json().job;
    assert.equal(job.deploymentId, id);
    const again = await app.inject({ method: 'POST', url: url + '/claim', headers, payload: {} });
    assert.deepEqual(again.json().job, job);
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/deployments/me',
      headers: f.headers,
    });
    assert(!listed.body.includes(job.env.FD_STACK_STATUS_REPORT_TOKEN));
    assert(!listed.body.includes('hostingExecution'));
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/hosting/nodes/${node2.node.id}/complete`,
          headers: { authorization: `Bearer ${node2.reportToken}` },
          payload: { deploymentId: id, jobId: job.id, success: false },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: url + '/complete',
          headers,
          payload: { deploymentId: id, jobId: randomUUID(), success: false },
        })
      ).statusCode,
      409,
    );
    const failed = await app.inject({
      method: 'POST',
      url: url + '/complete',
      headers,
      payload: { deploymentId: id, jobId: job.id, success: false },
    });
    assert.equal(failed.statusCode, 200, failed.body);
    assert.equal(
      (await repository.nodeViews(new Date())).items.find((n) => n.id === node.node.id)!.reserved
        .memoryMb,
      resources.memoryMb,
    );
    await app.services.DeploymentService.retryManagedAllocation({
      deploymentId: id,
      userId: f.user.id,
    });
    const retry = await app.inject({ method: 'POST', url: url + '/claim', headers, payload: {} });
    assert.deepEqual(retry.json().job, job);
    const done = await app.inject({
      method: 'POST',
      url: url + '/complete',
      headers,
      payload: { deploymentId: id, jobId: job.id, success: true, image },
    });
    assert.equal(done.statusCode, 200, done.body);
    const result = (await app.services.DeploymentService.listUserDeployments(f.user.id)).items[0]!;
    assert.equal(result.managed?.state, 'runtime_ready');
    assert.equal(result.managed?.accessUrl, null);
    assert.equal(result.lastDeployedAt, null);
    await assert.rejects(
      () =>
        app.services.DeploymentService.deactivateDeployment({
          deploymentId: id!,
          userId: f.user.id,
        }),
      /资源回收/,
    );
  } finally {
    if (id) await db.delete(deployments).where(eq(deployments.id, id));
    await db.delete(hostingNodes).where(eq(hostingNodes.id, node.node.id));
    await db.delete(hostingNodes).where(eq(hostingNodes.id, node2.node.id));
  }
});

test('generic hosting requires node capability and matching release evidence, while keeping configuration private', async () => {
  const f = await fixture();
  const { definition } = composeRuntimeFixture(
    'docker.io/library/busybox@sha256:' + 'a'.repeat(64),
  );
  definition.app.code = f.app.code;
  if (definition.delivery.kind !== 'compose') throw Error('fixture');
  definition.delivery.resources.diskMb = 1024;
  const [release] = await db
    .insert(appReleases)
    .values({
      appId: f.app.id,
      version: 'compose-1',
      commit: 'b'.repeat(40),
      definition,
      definitionDigest: definitionDigest(definition),
      images: { app: 'docker.io/library/busybox@sha256:' + 'a'.repeat(64) },
      status: 'published',
      publishedAt: new Date(),
    })
    .returning();
  assert.ok(release);
  await db
    .update(apps)
    .set({ meta: { deliveryMode: 'one_click', deliveryProtocol: 'compose_v2' } })
    .where(eq(apps.id, f.app.id));
  const publicApp = await app.services.AppService.getPublicApp(f.app.code);
  assert.equal((publicApp.meta as Record<string, unknown>).deliveryReleaseId, release.id);
  const repository = new HostingRepository(db);
  const node = await repository.createNode(
    { name: 'Compose protocol node', serverIp: '192.0.2.205', capacity: resources },
    new Date(),
  );
  let id: string | undefined;
  try {
    await repository.setEnabled(node.node.id, true);
    const report = { dockerReady: true, available: resources, supportedApps: [] };
    await repository.report(node.node.id, node.reportToken, report, new Date());
    const deployment = await app.services.DeploymentService.createDeployment(f.input);
    id = deployment.id;
    assert.equal(deployment.managed?.state, 'waiting_capacity');
    await db.update(appReleases).set({ status: 'withdrawn' }).where(eq(appReleases.id, release.id));
    await db
      .update(apps)
      .set({ meta: { deliveryMode: 'one_click' } })
      .where(eq(apps.id, f.app.id));
    const headers = { authorization: `Bearer ${node.reportToken}` };
    const url = `/v1/hosting/nodes/${node.node.id}`;
    const claim = () => app.inject({ method: 'POST', url: url + '/claim', headers, payload: {} });
    assert.equal((await claim()).json().job, null);
    await repository.report(
      node.node.id,
      node.reportToken,
      { ...report, supportedProtocols: ['compose_install_v1'] },
      new Date(),
    );
    await db.transaction(async (tx) => {
      const hosting = new HostingRepository(tx);
      await hosting.lockPool();
      const [row] = await tx.select().from(deployments).where(eq(deployments.id, id!));
      assert.ok(row);
      await hosting.allocate(row, new Date());
    });
    assert.equal(
      (
        await db
          .select()
          .from(deploymentComposeBindings)
          .where(eq(deploymentComposeBindings.deploymentId, id))
      ).length,
      0,
    );
    const response = await claim();
    assert.equal(response.statusCode, 200, response.body);
    const job = response.json().job;
    const installation = composeInstallJobSchema.parse(job.installation);
    assert.deepEqual(await new ComposeBindingService(db, env).readJob(id), installation);
    assert.deepEqual((await claim()).json().job, job);
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/deployments/me',
      headers: f.headers,
    });
    const secret = (
      installation.compose.services as Record<string, { environment: Record<string, string> }>
    ).web!.environment.PASSWORD!;
    assert(!listed.body.includes(secret));
    const complete = (extra: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: url + '/complete',
        headers,
        payload: { deploymentId: id, jobId: job.id, success: true, ...extra },
      });
    assert.equal(
      (await complete({ image: 'docker.io/library/busybox@sha256:' + 'a'.repeat(64) })).statusCode,
      409,
    );
    const evidence = {
      protocol: 'compose_install_v1',
      instanceId: id,
      releaseId: release.id,
      releaseDigest: installation.releaseDigest,
      phase: 'runtime_ready',
      runnerVersion: '1',
      imageSource: 'registry',
      completed: ['migrate:0', 'initialize:0'],
    };
    assert.equal(
      (await complete({ composeEvidence: { ...evidence, releaseId: randomUUID() } })).statusCode,
      409,
    );
    assert.equal(
      (await complete({ composeEvidence: { ...evidence, completed: [] } })).statusCode,
      409,
    );
    const done = await complete({ composeEvidence: evidence });
    assert.equal(done.statusCode, 200, done.body);
    const view = (await app.services.DeploymentService.listUserDeployments(f.user.id)).items[0]!;
    assert.equal(view.managed?.state, 'runtime_ready');
    assert.equal(view.managed?.accessUrl, null);
  } finally {
    if (id) {
      await db
        .delete(deploymentComposeBindings)
        .where(eq(deploymentComposeBindings.deploymentId, id));
      await db
        .delete(deploymentComposeRequests)
        .where(eq(deploymentComposeRequests.deploymentId, id));
      await db.delete(deployments).where(eq(deployments.id, id));
    }
    await db.delete(hostingNodes).where(eq(hostingNodes.id, node.node.id));
  }
});
