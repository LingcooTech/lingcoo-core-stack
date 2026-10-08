import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { auditLogs, hostingOffers, users } from '../../src/db/schema';
import { HostingOfferCatalog } from '../../src/modules/billing/hosting-offers';
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

test('hosting catalog permissions, zero-price drafts, unique identities and audited optimistic edits', async () => {
  const f = await seedPurchase(db);
  const [admin, operator] = await db
    .insert(users)
    .values([
      { email: randomUUID() + '@example.test', role: 'admin' },
      { email: randomUUID() + '@example.test', role: 'operator' },
    ])
    .returning();
  assert.ok(admin && operator);
  const headers = (id: string) => ({
    authorization: 'Bearer ' + app.jwt.sign({ sub: id, kind: 'user' }),
  });
  const path = '/v1/admin/billing/hosting-offers';
  const input = {
    id: randomUUID(),
    appId: f.app.id,
    code: 'monthly',
    title: 'Monthly hosting',
    description: 'Dedicated application hosting and daily backup',
    interval: 'month' as const,
    priceAmount: 0,
    currency: 'CNY' as const,
    graceDays: 7,
    retentionDays: 30,
    status: 'draft' as const,
    reason: 'Configure draft before price approval',
  };
  for (const id of [operator.id, f.user.id]) {
    assert.equal(
      (await app.inject({ method: 'POST', url: path, headers: headers(id), payload: input }))
        .statusCode,
      403,
    );
    assert.equal((await app.inject({ url: path, headers: headers(id) })).statusCode, 403);
  }
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: path,
        headers: headers(admin.id),
        payload: { ...input, status: 'active' },
      })
    ).statusCode,
    400,
  );
  const created = await app.inject({
    method: 'POST',
    url: path,
    headers: headers(admin.id),
    payload: input,
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().version, 1);
  const retry = await app.inject({
    method: 'POST',
    url: path,
    headers: headers(admin.id),
    payload: input,
  });
  assert.equal(retry.statusCode, 201);
  assert.equal(retry.json().id, input.id);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: path,
        headers: headers(admin.id),
        payload: { ...input, id: randomUUID() },
      })
    ).statusCode,
    409,
  );
  const list = await app.inject({
    url: `${path}?appId=${f.app.id}&limit=1`,
    headers: headers(admin.id),
  });
  assert.equal(list.json().total, 1);
  assert.equal(list.json().items[0].id, input.id);
  const update = {
    title: input.title,
    description: input.description,
    interval: input.interval,
    priceAmount: 1990,
    currency: input.currency,
    graceDays: 7,
    retentionDays: 30,
    status: 'active',
    expectedVersion: 1,
    reason: 'Approve fixture pricing for test only',
  };
  const edits = await Promise.all(
    [1990, 2990].map((priceAmount) =>
      app.inject({
        method: 'PUT',
        url: `${path}/${input.id}`,
        headers: headers(admin.id),
        payload: { ...update, priceAmount },
      }),
    ),
  );
  assert.deepEqual(edits.map((r) => r.statusCode).sort(), [200, 409]);
  const [stored] = await db.select().from(hostingOffers).where(eq(hostingOffers.id, input.id));
  assert.equal(stored?.version, 2);
  const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, input.id));
  assert.equal(logs.length, 2);
  assert.equal(
    (logs.find((l) => l.action.endsWith('_updated'))?.meta as { before: { priceAmount: number } })
      .before.priceAmount,
    0,
  );
  const catalog = new HostingOfferCatalog(db);
  assert.equal(
    (
      await catalog.update(input.id, admin.id, {
        ...update,
        status: 'archived',
        expectedVersion: 2,
      })
    ).status,
    'archived',
  );
  await assert.rejects(
    db
      .insert(hostingOffers)
      .values({ ...input, id: randomUUID(), code: 'invalid', status: 'active', priceAmount: 0 }),
  );
});
