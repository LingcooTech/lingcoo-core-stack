import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { responseSchemaFor } from '@lingcoo/contracts';
import { buildApp } from '../../src/app';
import { auditLogs, billingWebhookEvents, events, jobRuns, users } from '../../src/db/schema';
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

test('populated observability endpoints satisfy response contracts, including active alerts', async () => {
  const fixture = await seedPurchase(db);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, fixture.user.id));
  const headers = {
    authorization: 'Bearer ' + app.jwt.sign({ sub: fixture.user.id, kind: 'user' }),
  };
  const marker = 'observability-' + randomUUID();
  await db
    .insert(events)
    .values({ eventName: marker, appId: fixture.app.id, userId: fixture.user.id });
  await db
    .insert(billingWebhookEvents)
    .values({ provider: 'wechat_pay', providerEventId: marker, type: marker });
  await db.insert(jobRuns).values({ kind: marker, status: 'dead', attempts: 5 });
  await db
    .insert(auditLogs)
    .values({ action: marker, resourceType: 'fixture', actorUserId: fixture.user.id });
  for (const path of [
    'events',
    'billing-webhooks',
    'jobs',
    'audit-logs',
    'observability/summary',
  ]) {
    const url = '/v1/admin/' + path;
    const response = await app.inject({
      method: 'GET',
      url: path.includes('summary') ? url : `${url}?search=${marker}`,
      headers,
    });
    assert.equal(response.statusCode, 200, `${path}: ${response.body}`);
    const payload = response.json();
    assert.equal(responseSchemaFor('GET', url)!.safeParse(payload).success, true, path);
    if (path.includes('summary'))
      assert.ok(payload.alerts.some((alert: { id: string }) => alert.id === 'dead-jobs'));
    else assert.ok(payload.items.length > 0, `${path} must exercise non-empty rows`);
  }
});
