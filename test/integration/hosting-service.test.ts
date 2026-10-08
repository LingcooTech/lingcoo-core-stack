import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import {
  deployments,
  hostingServices,
  hostingServiceChanges,
  users,
  orders,
  auditLogs,
} from '../../src/db/schema';
import { HostingServiceTerms } from '../../src/modules/deployment/hosting-service';
import { seedPurchase, testDatabase } from './helpers';
import type { HostingServiceCommand } from '@lingcoo/contracts';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
const registration = (): HostingServiceCommand => ({
  kind: 'register',
  requestKey: randomUUID(),
  expectedVersion: 0,
  source: 'trial',
  interval: 'month',
  periods: 1,
  graceDays: 7,
  retentionDays: 30,
  reason: 'Internal test service grant',
});

test('hosting terms wait for delivery, preserve anchors, serialize extensions and do not charge or stop instances', async () => {
  const f = await seedPurchase(db);
  const [d] = await db
    .insert(deployments)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      label: 'Terms fixture',
      deploymentMode: 'managed',
      hostingState: 'pending_tls',
    })
    .returning();
  assert.ok(d);
  let now = new Date('2026-01-15T10:00:00Z');
  const terms = new HostingServiceTerms(db, () => now);
  assert.equal((await terms.read(d.id)).service, null);
  const command = registration();
  let result = await terms.command(d.id, f.user.id, command);
  assert.equal(result.service?.state, 'pending_delivery');
  assert.equal(result.service?.expiresAt, null);
  await terms.activateDelivered(d.id); // TLS not verified; cannot start the clock.
  assert.equal((await terms.read(d.id)).service?.anchorAt, null);
  now = new Date('2026-01-31T10:00:00Z');
  await db.transaction(async (tx) => {
    await tx.update(deployments).set({ hostingState: 'ready' }).where(eq(deployments.id, d.id));
    await new HostingServiceTerms(tx, () => now).activateDelivered(d.id);
  });
  result = await terms.adminRead(d.id);
  assert.equal(result.service?.version, 2);
  assert.equal(result.service?.expiresAt, '2026-02-28T10:00:00.000Z');
  await Promise.all([terms.activateDelivered(d.id), terms.activateDelivered(d.id)]); // Repeated reports do not reset terms.
  assert.equal((await terms.adminRead(d.id)).changes.length, 2);
  assert.equal((await terms.command(d.id, f.user.id, command)).service?.version, 2);
  await assert.rejects(terms.command(d.id, f.user.id, { ...command, periods: 2 }), /请求标识/);
  const extend: HostingServiceCommand = {
    kind: 'extend',
    requestKey: randomUUID(),
    expectedVersion: 2,
    periods: 1,
    reason: 'Extend original anchored period',
  };
  const results = await Promise.allSettled([
    terms.command(d.id, f.user.id, extend),
    terms.command(d.id, f.user.id, { ...extend, requestKey: randomUUID() }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  result = await terms.adminRead(d.id);
  assert.equal(result.service?.version, 3);
  assert.equal(result.service?.expiresAt, '2026-03-31T10:00:00.000Z');
  assert.equal(result.changes[0]?.before?.expiresAt, '2026-02-28T10:00:00.000Z');
  now = new Date('2026-03-31T10:00:00Z');
  assert.equal((await terms.read(d.id)).service?.state, 'grace');
  now = new Date('2026-04-07T10:00:00Z');
  assert.equal((await terms.read(d.id)).service?.state, 'expired');
  const [stillRunning] = await db.select().from(deployments).where(eq(deployments.id, d.id));
  assert.equal(stillRunning?.status, 'active');
  assert.equal(stillRunning?.hostingState, 'ready');
  const [unpaid] = await db.select().from(orders).where(eq(orders.id, f.order.id));
  assert.equal(unpaid?.status, 'pending');
  const restart: HostingServiceCommand = {
    kind: 'extend',
    requestKey: randomUUID(),
    expectedVersion: 3,
    periods: 1,
    reason: 'Regrant expired service period',
  };
  result = await terms.command(d.id, f.user.id, restart);
  assert.equal(result.service?.anchorAt, '2026-04-07T10:00:00.000Z');
  assert.equal(result.service?.expiresAt, '2026-05-07T10:00:00.000Z');
  assert.equal((await terms.command(d.id, f.user.id, restart)).service?.version, 4);
  assert.equal((await terms.adminRead(d.id)).changes.length, 4);
  const audit = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.resourceId, result.service!.id));
  assert.equal(audit.length, 4);
  await db.update(deployments).set({ status: 'inactive' }).where(eq(deployments.id, d.id));
  await assert.rejects(
    terms.command(d.id, f.user.id, { ...restart, requestKey: randomUUID(), expectedVersion: 4 }),
    /已停用/,
  );
});

test('only administrators can grant terms; customers see only owned safe projections and support is read-only', async () => {
  const f = await seedPurchase(db);
  const [admin] = await db
    .insert(users)
    .values({ email: randomUUID() + '@example.test', role: 'admin' })
    .returning();
  const [support] = await db
    .insert(users)
    .values({ email: randomUUID() + '@example.test', role: 'support' })
    .returning();
  assert.ok(admin && support);
  const headers = (id: string) => ({
    authorization: 'Bearer ' + app.jwt.sign({ sub: id, kind: 'user' }),
  });
  const [d, self] = await db
    .insert(deployments)
    .values([
      {
        userId: f.user.id,
        appId: f.app.id,
        label: 'Delivered pilot',
        deploymentMode: 'managed',
        hostingState: 'ready',
      },
      { userId: f.user.id, appId: f.app.id, label: 'Self hosted', deploymentMode: 'self_hosted' },
    ])
    .returning();
  assert.ok(d && self);
  const url = `/v1/admin/deployments/${d.id}/hosting-service`;
  const body = { ...registration(), source: 'manual' };
  let r = await app.inject({ method: 'POST', url, headers: headers(support.id), payload: body });
  assert.equal(r.statusCode, 403);
  r = await app.inject({ method: 'POST', url, headers: headers(f.user.id), payload: body });
  assert.equal(r.statusCode, 403);
  r = await app.inject({
    method: 'POST',
    url,
    headers: headers(admin.id),
    payload: { ...body, source: 'paid' },
  });
  assert.equal(r.statusCode, 400);
  r = await app.inject({ method: 'POST', url, headers: headers(admin.id), payload: body });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().service.state, 'active');
  assert.equal(r.json().service.source, 'manual');
  assert.equal(r.json().changes.length, 1);
  r = await app.inject({ method: 'POST', url, headers: headers(admin.id), payload: body });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().changes.length, 1);
  r = await app.inject({ method: 'GET', url, headers: headers(support.id) });
  assert.equal(r.statusCode, 200);
  r = await app.inject({
    method: 'GET',
    url: `/v1/deployments/${d.id}/hosting-service`,
    headers: headers(f.user.id),
  });
  assert.equal(r.statusCode, 200);
  assert.ok(!r.body.includes(body.reason));
  assert.ok(!r.body.includes('changes'));
  r = await app.inject({
    method: 'GET',
    url: `/v1/deployments/${d.id}/hosting-service`,
    headers: headers(support.id),
  });
  assert.equal(r.statusCode, 404);
  r = await app.inject({
    method: 'POST',
    url: `/v1/admin/deployments/${self.id}/hosting-service`,
    headers: headers(admin.id),
    payload: registration(),
  });
  assert.equal(r.statusCode, 404);
  const changes = await db
    .select()
    .from(hostingServiceChanges)
    .where(and(eq(hostingServiceChanges.deploymentId, d.id), eq(hostingServiceChanges.version, 1)));
  assert.equal(changes.length, 1);
  await assert.rejects(
    db.insert(hostingServices).values({
      deploymentId: self.id,
      source: 'manual',
      interval: 'month',
      periods: 1,
      anchorAt: new Date(),
      expiresAt: null,
      graceDays: 0,
      retentionDays: 30,
    }),
  );
});
