import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import {
  users,
  systemSettings,
  auditLogs,
  events,
  jobRuns,
  notifications,
} from '../../src/db/schema';
import { AuditLogService } from '../../src/modules/audit/public';
import { rotateSettingKeys } from '../../src/composition/settings-key-rotation';
import { encryptJson, decryptJson, getEncryptionKeys } from '../../src/lib/settings-crypto';
import { createServiceFactories } from '../../src/composition/service-factories';
import { testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>, token: string;
before(async () => {
  app = await buildApp(env);
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, role: 'admin' })
    .returning();
  if (!user) throw new Error('Missing test fixture: user');
  token = app.jwt.sign({ sub: user.id, kind: 'user' });
});
after(async () => {
  await app.close();
  await pool.end();
});
test('concurrent configuration updates reject stale versions and audit only the winner', async () => {
  const url = '/v1/admin/system-settings/site';
  const headers = { authorization: `Bearer ${token}` };
  const read = await app.inject({ method: 'GET', url, headers });
  assert.equal(read.statusCode, 200);
  const version = String(read.headers.etag);
  assert(version);
  const attempts = await Promise.all(
    ['a', 'b'].map((label) =>
      app.inject({
        method: 'PUT',
        url,
        headers: { ...headers, 'if-match': version },
        payload: { siteName: `fixture-${label}` },
      }),
    ),
  );
  assert.deepEqual(attempts.map((r) => r.statusCode).sort(), [200, 409]);
  const again = await app.inject({ method: 'GET', url, headers });
  assert.notEqual(again.headers.etag, version);
  const audits = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, 'site'));
  assert(audits.some((a) => a.action === 'settings.changed'));
});
test('a successful setting command and its audit roll back together', async (t) => {
  const url = '/v1/admin/system-settings/site';
  const headers = { authorization: `Bearer ${token}` };
  const read = await app.inject({ method: 'GET', url, headers });
  t.mock.method(AuditLogService.prototype, 'record', async () => {
    throw new Error('fixture-private-secret');
  });
  const response = await app.inject({
    method: 'PUT',
    url,
    headers: { ...headers, 'if-match': String(read.headers.etag) },
    payload: { siteName: 'uncommitted' },
  });
  assert.equal(response.statusCode, 500);
  assert(!response.body.includes('fixture-private-secret'));
  const again = await app.inject({ method: 'GET', url, headers });
  assert.equal(again.headers.etag, read.headers.etag);
  assert.deepEqual(again.json(), read.json());
});
test('key rotation is repeatable and encrypted settings remain readable without legacy keys', async () => {
  const key = `fixture.rotation.${randomUUID()}`;
  await db.insert(systemSettings).values({
    key,
    isEncrypted: true,
    value: encryptJson({ password: 'fixture-private-secret' }, env.JWT_SECRET),
  });
  const rotatedEnv = {
    ...env,
    SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'rotation',
    SETTINGS_ENCRYPTION_KEYS: JSON.stringify({
      primary: env.SETTINGS_ENCRYPTION_KEY || env.JWT_SECRET,
      rotation: 'fixture-independent-settings-rotation-key',
    }),
  };
  const dry = await rotateSettingKeys(db, rotatedEnv, true);
  assert(dry.rotated >= 1);
  await rotateSettingKeys(db, rotatedEnv, false);
  assert.equal((await rotateSettingKeys(db, rotatedEnv, false)).rotated, 0);
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  if (!row) throw new Error('Missing test fixture: row');
  assert.deepEqual(
    decryptJson(
      row.value,
      getEncryptionKeys({ ...rotatedEnv, ALLOW_LEGACY_SETTINGS_DECRYPTION: false }),
    ),
    { password: 'fixture-private-secret' },
  );
  // Restore the isolated database's usual key so subsequent tests can still read older fixtures.
  await rotateSettingKeys(
    db,
    { ...rotatedEnv, SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'primary' },
    false,
  );
  await db.delete(systemSettings).where(eq(systemSettings.key, key));
});
test('events persist projection tasks and notification replay is idempotent', async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test` })
    .returning();
  if (!user) throw new Error('Missing test fixture: user');
  const factories = createServiceFactories();
  const event = await factories
    .createEventService(db)
    .capture({ userId: user.id, eventName: 'auth.email_verified', properties: {} });
  assert((await db.select().from(events).where(eq(events.id, event.id))).length === 1);
  const queue = await db.select().from(jobRuns).where(eq(jobRuns.kind, 'notifications.project'));
  assert(queue.some((job) => (job.payload as { eventIds: string[] }).eventIds.includes(event.id)));
  const projection = (await factories.createEventService(db).loadProjectionEvents([event.id])).map(
    (item) => ({ ...item, properties: item.properties as Record<string, unknown> }),
  );
  await factories.createNotificationsService(db).projectFromEvents(projection);
  await factories.createNotificationsService(db).projectFromEvents(projection);
  assert.equal(
    (await db.select().from(notifications).where(eq(notifications.sourceEventId, event.id))).length,
    1,
  );
});

test('administrative user changes roll back when success auditing fails', async (t) => {
  const [target] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, displayName: 'before' })
    .returning();
  if (!target) throw new Error('Missing test fixture: target');
  t.mock.method(AuditLogService.prototype, 'record', async () => {
    throw new Error('fixture-private-secret');
  });
  const response = await app.inject({
    method: 'PUT',
    url: `/v1/admin/users/${target.id}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { displayName: 'after' },
  });
  assert.equal(response.statusCode, 500);
  assert(!response.body.includes('fixture-private-secret'));
  const [stored] = await db.select().from(users).where(eq(users.id, target.id));
  if (!stored) throw new Error('Missing test fixture: stored');
  assert.equal(stored.displayName, 'before');
});

test('Wechat setting writes use the same optimistic version as the payment overview', async () => {
  const key = 'billing.provider.wechat_pay';
  const [previous] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  const headers = { authorization: `Bearer ${token}` };
  const read = await app.inject({ method: 'GET', url: '/v1/admin/payment-settings', headers });
  assert.equal(read.statusCode, 200, read.body);
  const version = String(read.headers.etag);
  try {
    const saved = await app.inject({
      method: 'PUT',
      url: '/v1/admin/payment-settings/wechat',
      headers: { ...headers, 'if-match': version },
      payload: {
        appId: 'fixture-app',
        mchId: 'fixture-merchant',
        appSecret: 'fixture-private-app-secret',
        apiKey: 'fixture-private-api-key',
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().configured, true);
    assert.equal(saved.body.includes('fixture-private'), false);
    const stale = await app.inject({
      method: 'PUT',
      url: '/v1/admin/payment-settings/wechat',
      headers: { ...headers, 'if-match': version },
      payload: { appId: 'stale-overwrite' },
    });
    assert.equal(stale.statusCode, 409, stale.body);
    assert.notEqual(saved.headers.etag, read.headers.etag);
  } finally {
    if (previous) await db.update(systemSettings).set(previous).where(eq(systemSettings.key, key));
    else await db.delete(systemSettings).where(eq(systemSettings.key, key));
  }
});
