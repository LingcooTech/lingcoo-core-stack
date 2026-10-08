import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { deployments, hostingNodes, hostingOperations, users } from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { HostingRepository } from '../../src/modules/deployment/hosting';
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
const capacity = { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 };
async function node() {
  return new HostingRepository(db).createNode(
    {
      name: 'operations fixture',
      serverIp:
        '2001:db8::' + randomBytes(2).toString('hex') + ':' + randomBytes(2).toString('hex'),
      capacity,
    },
    new Date(),
  );
}
async function fixture() {
  const f = await seedPurchase(db);
  const n = await node();
  await new HostingRepository(db).report(
    n.node.id,
    n.reportToken,
    { dockerReady: true, canDeploy: true, available: capacity },
    new Date(),
  );
  const [d] = await db
    .insert(deployments)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      label: 'Ops test',
      hostedDomain: 'ops-' + randomUUID().slice(0, 8) + '.app.lingcoo.com',
      deploymentMode: 'managed',
      hostingNodeId: n.node.id,
      hostingState: 'ready',
      hostingResources: { cpuMillis: 1000, memoryMb: 1024, diskMb: 10240 },
    })
    .returning();
  return { ...f, n, d: d! };
}
test('ops endpoints require admin; request idempotency and active instance exclusion survive concurrent requests', async () => {
  const f = await fixture();
  const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) };
  let response = await app.inject({ method: 'GET', url: '/v1/admin/hosting/overview', headers });
  assert.equal(response.statusCode, 403);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.user.id));
  const payload = { kind: 'restart' as const, requestKey: randomUUID() };
  const results = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        method: 'POST',
        url: `/v1/admin/hosting/instances/${f.d.id}/operations`,
        headers,
        payload,
      }),
    ),
  );
  assert.equal(results[0]!.statusCode, 202, results[0]!.body);
  assert.equal(results[1]!.statusCode, 202, results[1]!.body);
  assert.equal(results[0]!.json().id, results[1]!.json().id);
  response = await app.inject({
    method: 'POST',
    url: `/v1/admin/hosting/instances/${f.d.id}/operations`,
    headers,
    payload: { kind: 'backup', requestKey: randomUUID() },
  });
  assert.equal(response.statusCode, 409);
  response = await app.inject({ method: 'GET', url: '/v1/admin/hosting/overview', headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.ok(response.json().instances.some((i: { id: string }) => i.id === f.d.id));
  assert.ok(!response.body.includes(f.n.reportToken));
});
test('paused allocation leaves existing ingress visible; operation leases bind to their node and completion is idempotent', async () => {
  const f = await fixture();
  const other = await node();
  const key = randomUUID();
  const op = await db.transaction((tx) =>
    new HostingOperations(tx).request(f.d.id, f.user.id, { kind: 'backup', requestKey: key }),
  );
  const claim = await db.transaction((tx) =>
    new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken),
  );
  assert.equal(claim.operation?.id, op.id);
  assert.equal(
    (
      await db.transaction((tx) =>
        new HostingOperations(tx).claim(other.node.id, other.reportToken),
      )
    ).operation,
    null,
  );
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).complete(other.node.id, other.reportToken, op.id, true),
    ),
  );
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, op.id, true),
  );
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, op.id, false),
  );
  const [row] = await db.select().from(hostingOperations).where(eq(hostingOperations.id, op.id));
  assert.equal(row!.state, 'succeeded');
  const ingress = await app.inject({
    method: 'GET',
    url: `/v1/hosting/nodes/${f.n.node.id}/ingress`,
    headers: { authorization: 'Bearer ' + f.n.reportToken },
  });
  assert.equal(ingress.statusCode, 200, ingress.body);
  assert.ok(ingress.json().items.some((x: { deploymentId: string }) => x.deploymentId === f.d.id));
});
test('expired operation is failed without automatic re-execution, budgets cannot undercut reservations', async () => {
  const f = await fixture();
  const repo = new HostingRepository(db);
  const op = await db.transaction((tx) =>
    new HostingOperations(tx).request(f.d.id, f.user.id, {
      kind: 'restart',
      requestKey: randomUUID(),
    }),
  );
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
  await db
    .update(hostingOperations)
    .set({ startedAt: new Date(Date.now() - 61 * 60000) })
    .where(eq(hostingOperations.id, op.id));
  assert.equal(
    (await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken)))
      .operation,
    null,
  );
  const [row] = await db.select().from(hostingOperations).where(eq(hostingOperations.id, op.id));
  assert.equal(row!.result, 'lease_expired');
  await assert.rejects(
    db.transaction((tx) =>
      new HostingRepository(tx).updateNode(f.n.node.id, {
        capacity: { ...capacity, memoryMb: 512 },
      }),
    ),
  );
  await repo.report(
    f.n.node.id,
    f.n.reportToken,
    { dockerReady: true, canDeploy: false, available: capacity },
    new Date(),
  );
  await assert.rejects(repo.updateNode(f.n.node.id, { enabled: true }));
  const views = await repo.nodeViews(new Date());
  const view = views.items.find((x) => x.id === f.n.node.id)!;
  assert.equal(view.healthy, true);
  assert.equal(view.enabled, false);
  await db
    .update(hostingNodes)
    .set({ lastReportedAt: new Date(Date.now() - 10 * 60000) })
    .where(eq(hostingNodes.id, f.n.node.id));
  const stale = (await repo.nodeViews(new Date())).items.find((x) => x.id === f.n.node.id)!;
  assert.equal(stale.healthy, false);
  assert.ok(stale.alerts.some((a) => a.code === 'node_offline'));
});
