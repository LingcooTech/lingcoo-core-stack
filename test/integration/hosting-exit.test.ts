import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import {
  deployments,
  hostingServices,
  hostingExits,
  hostingExitEvents,
  hostingOperations,
  users,
} from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { HostingRepository } from '../../src/modules/deployment/hosting';
import { HostingExitService } from '../../src/modules/deployment/hosting-exit';
import { HostingServiceTerms } from '../../src/modules/deployment/hosting-service';
import { HostingOperations } from '../../src/modules/deployment/hosting-operations';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
const resources = { cpuMillis: 500, memoryMb: 512, diskMb: 10240 };
async function fixture() {
  const f = await seedPurchase(db),
    admin = await seedPurchase(db);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.user.id));
  const repo = new HostingRepository(db);
  const n = await repo.createNode(
    {
      name: 'Exit fixture',
      serverIp:
        '2001:db8::' + randomBytes(2).toString('hex') + ':' + randomBytes(2).toString('hex'),
      capacity: { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 },
    },
    new Date(),
  );
  await repo.report(
    n.node.id,
    n.reportToken,
    {
      dockerReady: true,
      canDeploy: true,
      supportedOperations: ['retire'],
      available: { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 },
    },
    new Date(),
  );
  const [d] = await db
    .insert(deployments)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      label: 'Disposable exit fixture',
      deploymentMode: 'managed',
      hostingNodeId: n.node.id,
      hostingState: 'ready',
      hostingResources: resources,
    })
    .returning();
  await db.insert(hostingServices).values({
    deploymentId: d!.id,
    source: 'manual',
    interval: 'month',
    periods: 1,
    graceDays: 7,
    retentionDays: 30,
  });
  return { ...f, admin, n, d: d!, service: new HostingExitService(db) };
}
async function request(f: Awaited<ReturnType<typeof fixture>>) {
  return f.service.command(f.d.id, f.user.id, {
    kind: 'request',
    requestKey: randomUUID(),
    reason: '客户申请退出测试',
  });
}
async function start(f: Awaited<ReturnType<typeof fixture>>) {
  await request(f);
  return f.service.command(
    f.d.id,
    f.admin.user.id,
    { kind: 'start', requestKey: randomUUID(), expectedVersion: 1, retentionDays: 30 },
    true,
  );
}
const proof = (deploymentId: string, operationId: string) => ({
  backupId: deploymentId + '-exit-' + operationId,
  manifestSha256: 'a'.repeat(64),
  stoppedAt: new Date().toISOString(),
  offsiteAt: new Date().toISOString(),
});
test('exit enforces tenant/role boundaries, idempotency, policy minimum and blocks renewals/restarts', async () => {
  const f = await fixture();
  const input = { kind: 'request' as const, requestKey: randomUUID(), reason: '客户申请退出测试' };
  const results = await Promise.all([1, 2].map(() => f.service.command(f.d.id, f.user.id, input)));
  assert.equal(results[0]!.exit!.id, results[1]!.exit!.id);
  await assert.rejects(f.service.read(f.d.id, f.admin.user.id));
  await assert.rejects(
    f.service.command(f.d.id, f.user.id, {
      kind: 'start',
      requestKey: randomUUID(),
      expectedVersion: 1,
      retentionDays: 30,
    }),
  );
  await assert.rejects(
    f.service.command(
      f.d.id,
      f.admin.user.id,
      { kind: 'start', requestKey: randomUUID(), expectedVersion: 1, retentionDays: 29 },
      true,
    ),
  );
  await assert.rejects(
    new HostingServiceTerms(db).command(f.d.id, f.admin.user.id, {
      kind: 'extend',
      requestKey: randomUUID(),
      expectedVersion: 1,
      periods: 1,
      reason: '不得延长退出中实例',
    }),
  );
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).request(f.d.id, f.admin.user.id, {
        kind: 'restart',
        requestKey: randomUUID(),
      }),
    ),
  );
  const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) };
  assert.equal(
    (await app.inject({ method: 'GET', url: `/v1/deployments/${f.d.id}/hosting-exit`, headers }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/v1/admin/deployments/${f.d.id}/hosting-exit`,
        headers,
        payload: { kind: 'start', requestKey: randomUUID(), expectedVersion: 1, retentionDays: 30 },
      })
    ).statusCode,
    403,
  );
  await assert.rejects(
    db
      .update(hostingExitEvents)
      .set({ kind: 'tampered' })
      .where(eq(hostingExitEvents.deploymentId, f.d.id)),
  );
});
test('retirement requires matching node/backup evidence, retains disk, and customer handover gates full refunds', async () => {
  const f = await fixture();
  const state = await start(f);
  const op = state.exit!.operationId!;
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, op, true),
    ),
  );
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).complete(
        f.n.node.id,
        f.n.reportToken,
        op,
        true,
        new Date(),
        proof(randomUUID(), op),
      ),
    ),
  );
  assert.deepEqual((await new HostingRepository(db).reservations()).get(f.n.node.id), resources);
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(
      f.n.node.id,
      f.n.reportToken,
      op,
      true,
      new Date(),
      proof(f.d.id, op),
    ),
  );
  const retained = await f.service.read(f.d.id);
  assert.equal(retained.exit!.state, 'retained');
  assert.deepEqual((await new HostingRepository(db).reservations()).get(f.n.node.id), {
    ...resources,
    cpuMillis: 0,
    memoryMb: 0,
  });
  await assert.rejects(new HostingServiceTerms(db).assertHostingRefundable(f.d.id));
  const handover = await f.service.command(
    f.d.id,
    f.admin.user.id,
    {
      kind: 'handover',
      requestKey: randomUUID(),
      expectedVersion: retained.exit!.version,
      reference: '受控测试数据包交接凭证 #12345',
    },
    true,
  );
  await assert.rejects(
    f.service.command(
      f.d.id,
      f.admin.user.id,
      { kind: 'acknowledge', requestKey: randomUUID(), expectedVersion: handover.exit!.version },
      true,
    ),
  );
  await f.service.command(f.d.id, f.user.id, {
    kind: 'acknowledge',
    requestKey: randomUUID(),
    expectedVersion: handover.exit!.version,
  });
  await new HostingServiceTerms(db).assertHostingRefundable(f.d.id);
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(
      f.n.node.id,
      f.n.reportToken,
      op,
      true,
      new Date(),
      proof(f.d.id, op),
    ),
  );
  assert.equal(
    (await f.service.read(f.d.id)).events.filter((e) => e.kind === 'node_confirmed').length,
    1,
  );
  await assert.rejects(
    db
      .update(hostingExits)
      .set({ state: 'requested', version: 5 })
      .where(eq(hostingExits.deploymentId, f.d.id)),
  );
});
test('lost or failed stop confirmation remains retryable with original operation after lease timeout', async () => {
  const f = await fixture();
  const state = await start(f);
  const op = state.exit!.operationId!;
  const old = new Date(Date.now() - 7200000);
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
  await db.update(hostingOperations).set({ startedAt: old }).where(eq(hostingOperations.id, op));
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, op, false),
  );
  const again = await db.transaction((tx) =>
    new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken, new Date(Date.now() + 6 * 60000)),
  );
  assert.equal(again.operation!.id, op);
  assert.equal(again.operation!.state, 'running');
  assert.equal((await f.service.read(f.d.id)).exit!.state, 'stopping');
  assert.deepEqual((await new HostingRepository(db).reservations()).get(f.n.node.id), resources);
});
