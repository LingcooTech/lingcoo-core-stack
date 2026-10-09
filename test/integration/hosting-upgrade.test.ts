import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { deployments, users, hostingNodes, hostingUpgrades } from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { HostingRepository } from '../../src/modules/deployment/hosting';
import { HostingOperations } from '../../src/modules/deployment/hosting-operations';
import { HostingUpgradeService } from '../../src/modules/deployment/hosting-upgrade';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
const capacity = { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 };
async function fixture() {
  const f = await seedPurchase(db);
  const n = await new HostingRepository(db).createNode(
    {
      name: 'upgrade fixture',
      serverIp:
        '2001:db8::' + randomBytes(2).toString('hex') + ':' + randomBytes(2).toString('hex'),
      capacity,
    },
    new Date(),
  );
  const [d] = await db
    .insert(deployments)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      label: 'upgrade',
      deploymentMode: 'managed',
      hostingNodeId: n.node.id,
      hostingState: 'ready',
      hostingResources: { cpuMillis: 250, memoryMb: 256, diskMb: 1024 },
    })
    .returning();
  const plan = {
    id: randomUUID(),
    appCode: f.app.code,
    label: 'Reviewed compatible release',
    fromImage: 'example/app@sha256:' + 'a'.repeat(64),
    toImage: 'example/app@sha256:' + 'b'.repeat(64),
    schemaPolicy: 'no-migration' as const,
    reviewEvidence: 'Fixture compatibility review; no startup migration',
  };
  const report = {
    dockerReady: true,
    canDeploy: true,
    available: capacity,
    supportedOperations: ['upgrade' as const],
    runtimeImages: [{ deploymentId: d!.id, image: plan.fromImage }],
    upgradeReleases: [plan],
  };
  await new HostingRepository(db).report(n.node.id, n.reportToken, report, new Date());
  const input = {
    releaseId: plan.id,
    requestKey: randomUUID(),
    expectedImage: plan.fromImage,
    confirmDeploymentId: d!.id,
  };
  const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) };
  return { ...f, n, d: d!, plan, report, input, headers };
}
test('upgrade APIs enforce admin, reviewed targets, expected version, idempotency and maintenance exclusion', async () => {
  const f = await fixture(),
    url = `/v1/admin/deployments/${f.d.id}/upgrades`;
  assert.equal((await app.inject({ method: 'GET', url, headers: f.headers })).statusCode, 403);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.user.id));
  const options = await app.inject({ method: 'GET', url, headers: f.headers });
  assert.equal(options.statusCode, 200, options.body);
  assert.equal(options.json().releases.length, 1);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: f.headers,
        payload: { ...f.input, releaseId: randomUUID() },
      })
    ).statusCode,
    409,
  );
  const responses = await Promise.all(
    [1, 2].map(() => app.inject({ method: 'POST', url, headers: f.headers, payload: f.input })),
  );
  assert.equal(responses[0]!.statusCode, 202, responses[0]!.body);
  assert.equal(responses[0]!.json().operationId, responses[1]!.json().operationId);
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.id, f.d.id)))[0]!.hostingState,
    'maintenance',
  );
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).request(f.d.id, f.user.id, {
        kind: 'restart',
        requestKey: randomUUID(),
      }),
    ),
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: f.headers,
        payload: { ...f.input, requestKey: randomUUID() },
      })
    ).statusCode,
    409,
  );
  const op = responses[0]!.json().operationId as string;
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `/v1/hosting/nodes/${f.n.node.id}/operations/${op}/upgrade`,
        headers: { authorization: 'Bearer ' + f.n.reportToken },
      })
    ).statusCode,
    409,
  );
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
  const plan = await app.inject({
    method: 'GET',
    url: `/v1/hosting/nodes/${f.n.node.id}/operations/${op}/upgrade`,
    headers: { authorization: 'Bearer ' + f.n.reportToken },
  });
  assert.equal(plan.statusCode, 200, plan.body);
  assert.equal(plan.json().toImage, f.plan.toImage);
  await assert.rejects(
    db
      .update(hostingUpgrades)
      .set({ plan: { ...f.plan, toImage: f.plan.fromImage } })
      .where(eq(hostingUpgrades.operationId, op)),
  );
});
test('upgrade completion binds evidence, retries unknown failures and records verified rollback without changing data', async () => {
  const f = await fixture();
  const op = await db.transaction((tx) =>
    new HostingUpgradeService(tx).request(f.d.id, f.user.id, f.input),
  );
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, op.operationId, false),
  );
  assert.equal(
    (await new HostingOperations(db).claim(f.n.node.id, f.n.reportToken)).operation,
    null,
  );
  const evidence = {
    operationId: op.operationId,
    deploymentId: f.d.id,
    releaseId: f.plan.id,
    outcome: 'rolled_back',
    runningImage: f.plan.fromImage,
    completedAt: new Date().toISOString(),
    backup: null,
  };
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).complete(
        f.n.node.id,
        f.n.reportToken,
        op.operationId,
        true,
        new Date(),
        undefined,
        undefined,
        { ...evidence, releaseId: randomUUID() },
      ),
    ),
  );
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(
      f.n.node.id,
      f.n.reportToken,
      op.operationId,
      true,
      new Date(),
      undefined,
      undefined,
      evidence,
    ),
  );
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, op.operationId, false),
  );
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.id, f.d.id)))[0]!.hostingState,
    'ready',
  );
  const view = await new HostingUpgradeService(db).read(f.d.id);
  assert.equal(view.history[0]!.evidence?.outcome, 'rolled_back');
  await new HostingRepository(db).report(
    f.n.node.id,
    f.n.reportToken,
    {
      ...f.report,
      upgradeReleases: [{ ...f.plan, toImage: 'example/app@sha256:' + 'c'.repeat(64) }],
    },
    new Date(),
  );
  await assert.rejects(
    db.transaction((tx) =>
      new HostingUpgradeService(tx).request(f.d.id, f.user.id, {
        ...f.input,
        requestKey: randomUUID(),
      }),
    ),
    /发行编号/,
  );

  await assert.rejects(
    db
      .update(hostingUpgrades)
      .set({ evidence: null })
      .where(eq(hostingUpgrades.operationId, op.operationId)),
  );
  await assert.rejects(
    db.delete(hostingUpgrades).where(eq(hostingUpgrades.operationId, op.operationId)),
  );
});
test('successful upgrade requires bound backup and new runtime, stale/offline nodes cannot start', async () => {
  const f = await fixture();
  await db
    .update(hostingNodes)
    .set({ lastReportedAt: new Date(Date.now() - 600000) })
    .where(eq(hostingNodes.id, f.n.node.id));
  await assert.rejects(
    db.transaction((tx) => new HostingUpgradeService(tx).request(f.d.id, f.user.id, f.input)),
  );
  await new HostingRepository(db).report(f.n.node.id, f.n.reportToken, f.report, new Date());
  const op = await db.transaction((tx) =>
    new HostingUpgradeService(tx).request(f.d.id, f.user.id, f.input),
  );
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
  const evidence = {
    operationId: op.operationId,
    deploymentId: f.d.id,
    releaseId: f.plan.id,
    outcome: 'upgraded',
    runningImage: f.plan.toImage,
    completedAt: new Date().toISOString(),
    backup: null,
  };
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).complete(
        f.n.node.id,
        f.n.reportToken,
        op.operationId,
        true,
        new Date(),
        undefined,
        undefined,
        evidence,
      ),
    ),
  );
  const time = new Date().toISOString();
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(
      f.n.node.id,
      f.n.reportToken,
      op.operationId,
      true,
      new Date(),
      undefined,
      undefined,
      {
        ...evidence,
        completedAt: time,
        backup: {
          backupId: f.d.id + '-exit-' + op.operationId,
          manifestSha256: 'a'.repeat(64),
          stoppedAt: time,
          offsiteAt: time,
        },
      },
    ),
  );
  const view = await new HostingUpgradeService(db).read(f.d.id);
  assert.equal(view.currentImage, f.plan.toImage);
  assert.equal(view.releases.length, 0);
});
