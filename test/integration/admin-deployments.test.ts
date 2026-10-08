import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app';
import { deployments, supportTickets, users } from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
test('deployment ledger enforces permissions, exact support context, pagination and credential redaction', async () => {
  const f = await seedPurchase(db);
  const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) };
  const secret = 'DO-NOT-EXPOSE-' + randomUUID();
  const rows = await db
    .insert(deployments)
    .values(
      ['self_hosted', 'managed'].map((mode) => ({
        userId: f.user.id,
        appId: f.app.id,
        label: f.app.code + mode,
        deploymentMode: mode,
        meta: {
          deliveryDomains: { values: { primaryDomain: 'customer.example.com' } },
          deliveryInputs: { secrets: secret },
          runtimeStatusReport: { token: secret, lastReportedAt: '2026-10-08T00:00:00Z' },
        },
      })),
    )
    .returning();
  let r = await app.inject({ method: 'GET', url: '/v1/admin/deployments', headers });
  assert.equal(r.statusCode, 403);
  await db.update(users).set({ role: 'support' }).where(eq(users.id, f.user.id));
  r = await app.inject({
    method: 'GET',
    url: `/v1/admin/deployments?search=${f.app.code}&limit=1`,
    headers,
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().total, 2);
  assert.equal(r.json().items.length, 1);
  assert.ok(!r.body.includes(secret));
  assert.ok(!r.body.includes('deliveryInputs'));
  assert.deepEqual(r.json().items[0].domains, ['customer.example.com']);
  const first = r.json().items[0].id;
  r = await app.inject({
    method: 'GET',
    url: `/v1/admin/deployments?search=${f.app.code}&limit=1&offset=1`,
    headers,
  });
  assert.notEqual(r.json().items[0].id, first);
  r = await app.inject({
    method: 'GET',
    url: `/v1/admin/deployments?search=${f.app.code}&mode=self_hosted`,
    headers,
  });
  assert.equal(r.json().total, 1);
  assert.equal(r.json().items[0].mode, 'self_hosted');
  r = await app.inject({ method: 'GET', url: '/v1/admin/deployments?limit=101', headers });
  assert.equal(r.statusCode, 400);
  await db.insert(supportTickets).values(
    rows.map((d) => ({
      userId: f.user.id,
      appId: f.app.id,
      deploymentId: d.id,
      ticketNo: 'LEDGER-' + randomUUID(),
      subject: 'Deployment help',
    })),
  );
  r = await app.inject({
    method: 'GET',
    url: `/v1/admin/tickets?deploymentId=${rows[0]!.id}`,
    headers,
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().total, 1);
  assert.equal(r.json().items[0].deploymentId, rows[0]!.id);
  r = await app.inject({ method: 'GET', url: '/v1/admin/hosting/overview', headers });
  assert.equal(r.statusCode, 403, 'Read access must not grant operations access');
});
