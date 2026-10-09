import { HostingHandoverService } from '../../src/modules/deployment/hosting-handover';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hostingHandovers, supportTickets } from '../../src/db/schema';
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
      supportedOperations: ['retire', 'export', 'reclaim'],
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

test('withdraw is owner-only, cannot race stop, and old replay cannot restart a withdrawn request', async () => {
  const f = await fixture();
  const input = {
    kind: 'request' as const,
    requestKey: randomUUID(),
    reason: 'Original customer closure',
  };
  await f.service.command(f.d.id, f.user.id, input);
  const withdraw = { kind: 'withdraw' as const, requestKey: randomUUID(), expectedVersion: 1 };
  await assert.rejects(f.service.command(f.d.id, f.admin.user.id, withdraw, true));
  const result = await f.service.command(f.d.id, f.user.id, withdraw);
  assert.equal(result.exit!.state, 'withdrawn');
  await f.service.command(f.d.id, f.user.id, input);
  assert.equal((await f.service.read(f.d.id)).exit!.state, 'withdrawn');
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.id, f.d.id)))[0]!.hostingState,
    'ready',
  );
  const reopened = await f.service.command(f.d.id, f.user.id, {
    kind: 'request',
    requestKey: randomUUID(),
    reason: 'A separate new closure request',
  });
  assert.equal(reopened.exit!.version, 3);
  assert.equal(reopened.exit!.reason, 'A separate new closure request');
  assert.deepEqual(
    reopened.events.filter((e) => e.kind === 'request').map((e) => e.reason),
    ['Original customer closure', 'A separate new closure request'],
  );
  const racing = await Promise.allSettled([
    f.service.command(f.d.id, f.user.id, {
      ...withdraw,
      requestKey: randomUUID(),
      expectedVersion: 3,
    }),
    f.service.command(
      f.d.id,
      f.admin.user.id,
      { kind: 'start', requestKey: randomUUID(), expectedVersion: 3, retentionDays: 30 },
      true,
    ),
  ]);
  assert.equal(racing.filter((r) => r.status === 'fulfilled').length, 1);
});

test('handover protects independent key, resumes chunks, enforces one-use grants and expired/revoked downloads', async () => {
  const f = await fixture(),
    root = await mkdtemp(join(tmpdir(), 'stack-handover-test-'));
  const service = new HostingHandoverService(db, { ...env, HOSTING_HANDOVER_DIR: root });
  try {
    const state = await start(f),
      op = state.exit!.operationId!;
    await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
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
    const retained = (await f.service.read(f.d.id)).exit!;
    const input = {
      kind: 'prepare' as const,
      requestKey: randomUUID(),
      expectedVersion: retained.version,
    };
    await assert.rejects(service.command(f.d.id, f.user.id, input));
    await service.command(f.d.id, f.admin.user.id, input, true);
    await service.command(f.d.id, f.admin.user.id, input, true);
    const task = (
      await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken))
    ).operation!;
    assert.equal(task.kind, 'export');
    const artifact = (await service.read(f.d.id, f.user.id)).items[0]!;
    const data = Buffer.from('disposable encrypted file fixture'),
      sha256 = createHash('sha256').update(data).digest('hex'),
      identity = 'AGE-SECRET-KEY-1' + 'A'.repeat(58);
    await assert.rejects(
      service.command(f.d.id, f.user.id, { kind: 'grant', handoverId: artifact.id }),
    );
    await assert.rejects(
      service.upload(f.n.node.id, 'bad-token', task.id, {
        kind: 'begin',
        size: data.length,
        sha256,
        identity,
      }),
    );
    await service.upload(f.n.node.id, f.n.reportToken, task.id, {
      kind: 'begin',
      size: data.length,
      sha256,
      identity,
    });
    await service.upload(f.n.node.id, f.n.reportToken, task.id, {
      kind: 'chunk',
      offset: 0,
      data: data.subarray(0, 7).toString('base64'),
    });
    assert.equal(
      (await service.nodeRead(f.n.node.id, f.n.reportToken, task.id)).handover!.received,
      7,
    );
    await assert.rejects(
      service.upload(f.n.node.id, f.n.reportToken, task.id, {
        kind: 'chunk',
        offset: 0,
        data: data.toString('base64'),
      }),
    );
    await assert.rejects(service.upload(f.n.node.id, f.n.reportToken, task.id, { kind: 'finish' }));
    await service.upload(f.n.node.id, f.n.reportToken, task.id, {
      kind: 'chunk',
      offset: 7,
      data: data.subarray(7).toString('base64'),
    });
    await service.upload(f.n.node.id, f.n.reportToken, task.id, { kind: 'finish' });
    await db.transaction((tx) =>
      new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, task.id, true),
    );
    assert.ok((await f.service.read(f.d.id)).exit!.handoverReference?.includes(artifact.id));
    const ack = {
      kind: 'acknowledge' as const,
      requestKey: randomUUID(),
      expectedVersion: (await f.service.read(f.d.id)).exit!.version,
    };
    await assert.rejects(f.service.command(f.d.id, f.user.id, ack));
    assert.ok(!JSON.stringify(await service.read(f.d.id, f.user.id)).includes('AGE-SECRET'));
    assert.ok(
      !JSON.stringify(
        (await db.select().from(hostingHandovers).where(eq(hostingHandovers.id, artifact.id)))[0],
      ).includes(identity),
    );
    await assert.rejects(
      service.command(f.d.id, f.admin.user.id, { kind: 'key', handoverId: artifact.id }, true),
    );
    assert.equal(
      (await service.command(f.d.id, f.user.id, { kind: 'key', handoverId: artifact.id })).identity,
      identity,
    );
    const grant = await service.command(f.d.id, f.user.id, {
        kind: 'grant',
        handoverId: artifact.id,
      }),
      grantId = grant.downloadPath!.split('/').at(-1)!;
    await assert.rejects(service.download(f.d.id, artifact.id, grantId, f.admin.user.id));
    const download = await service.download(f.d.id, artifact.id, grantId, f.user.id),
      chunks: Buffer[] = [];
    for await (const chunk of download.stream) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), data);
    await assert.rejects(service.download(f.d.id, artifact.id, grantId, f.user.id));
    const second = await service.command(f.d.id, f.user.id, {
      kind: 'grant',
      handoverId: artifact.id,
    });
    await assert.rejects(
      new HostingHandoverService(
        db,
        { ...env, HOSTING_HANDOVER_DIR: root },
        () => new Date(Date.now() + 11 * 60000),
      ).download(f.d.id, artifact.id, second.downloadPath!.split('/').at(-1)!, f.user.id),
    );
    const downloadApp = await buildApp({ ...env, HOSTING_HANDOVER_DIR: root });
    try {
      const headers = {
        authorization: 'Bearer ' + downloadApp.jwt.sign({ sub: f.user.id, kind: 'user' }),
      };
      const response = await downloadApp.inject({
        method: 'GET',
        url: second.downloadPath!,
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.rawPayload, data);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(
        (await downloadApp.inject({ method: 'GET', url: second.downloadPath!, headers }))
          .statusCode,
        410,
      );
    } finally {
      await downloadApp.close();
    }
    await f.service.command(f.d.id, f.user.id, ack);
    await service.command(
      f.d.id,
      f.admin.user.id,
      { kind: 'revoke', handoverId: artifact.id },
      true,
    );
    await assert.rejects(
      service.command(f.d.id, f.user.id, { kind: 'key', handoverId: artifact.id }),
    );
    await service.cleanup();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reclamation waits for handover, retention and ticket resolution; wrong proof and failure never release disk', async () => {
  const f = await fixture();
  const state = await start(f),
    op = state.exit!.operationId!;
  await db.transaction((tx) => new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken));
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
  const retained = (await f.service.read(f.d.id)).exit!;
  const h = await f.service.command(
    f.d.id,
    f.admin.user.id,
    {
      kind: 'handover',
      requestKey: randomUUID(),
      expectedVersion: retained.version,
      reference: 'Secure customer test handover',
    },
    true,
  );
  const completed = await f.service.command(f.d.id, f.user.id, {
    kind: 'acknowledge',
    requestKey: randomUUID(),
    expectedVersion: h.exit!.version,
  });
  const input = {
    kind: 'reclaim' as const,
    requestKey: randomUUID(),
    expectedVersion: completed.exit!.version,
    confirmDeploymentId: f.d.id,
  };
  await assert.rejects(
    new HostingHandoverService(db, env).command(f.d.id, f.admin.user.id, input, true),
  );
  const future = new Date(Date.now() + 31 * 86400000);
  await new HostingRepository(db).report(
    f.n.node.id,
    f.n.reportToken,
    {
      dockerReady: true,
      canDeploy: true,
      supportedOperations: ['retire', 'export', 'reclaim'],
      available: { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 },
    },
    future,
  );
  const service = new HostingHandoverService(db, env, () => future);
  const [ticket] = await db
    .insert(supportTickets)
    .values({
      ticketNo: randomUUID(),
      userId: f.user.id,
      deploymentId: f.d.id,
      subject: 'Unresolved customer dispute',
    })
    .returning();
  await assert.rejects(service.command(f.d.id, f.admin.user.id, input, true));
  await db
    .update(supportTickets)
    .set({ status: 'resolved' })
    .where(eq(supportTickets.id, ticket!.id));
  await service.command(f.d.id, f.admin.user.id, input, true);
  const task = (
    await db.transaction((tx) =>
      new HostingOperations(tx).claim(f.n.node.id, f.n.reportToken, future),
    )
  ).operation!;
  assert.equal(task.kind, 'reclaim');
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(f.n.node.id, f.n.reportToken, task.id, false, future),
  );
  assert.equal((await new HostingRepository(db).reservations()).get(f.n.node.id)!.diskMb, 10240);
  const evidence = {
    deploymentId: f.d.id,
    operationId: task.id,
    backupId: retained.evidence!.backupId,
    completedAt: future.toISOString(),
    removedContainers: ['a'.repeat(64)],
    removedVolumes: ['owned_data'],
  };
  await assert.rejects(
    db.transaction((tx) =>
      new HostingOperations(tx).complete(
        f.n.node.id,
        f.n.reportToken,
        task.id,
        true,
        future,
        undefined,
        { ...evidence, deploymentId: randomUUID() },
      ),
    ),
  );
  await db.transaction((tx) =>
    new HostingOperations(tx).complete(
      f.n.node.id,
      f.n.reportToken,
      task.id,
      true,
      future,
      undefined,
      evidence,
    ),
  );
  assert.equal((await service.read(f.d.id)).reclamation!.state, 'completed');
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.id, f.d.id)))[0]!.status,
    'inactive',
  );
  assert.equal((await new HostingRepository(db).reservations()).get(f.n.node.id), undefined);
});
