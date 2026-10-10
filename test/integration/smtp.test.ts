import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { systemSettings, users } from '../../src/db/schema';
import { Mailer } from '../../src/lib/mailer';
import { SmtpSettingsService } from '../../src/modules/settings/public';
import { DeliveryJobHandlers } from '../../src/composition/delivery-job-handlers';
import { testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  userId: string,
  previous: typeof systemSettings.$inferSelect | undefined;
before(async () => {
  app = await buildApp(env);
  const [user] = await db
    .insert(users)
    .values({ email: `smtp-${randomUUID()}@example.test`, role: 'admin' })
    .returning();
  userId = user!.id;
  token = app.jwt.sign({ sub: userId, kind: 'user' });
  [previous] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'system.smtp.default'));
});
after(async () => {
  await db.delete(systemSettings).where(eq(systemSettings.key, 'system.smtp.default'));
  if (previous) await db.insert(systemSettings).values(previous);
  await app.close();
  await pool.end();
});
test('SMTP fields persist, secret is retained without echo and capture is explicitly simulated', async () => {
  const headers = { authorization: `Bearer ${token}` },
    url = '/v1/admin/system-settings/smtp';
  let response = await app.inject({
    method: 'PUT',
    url,
    headers,
    payload: {
      transport: 'capture',
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      user: 'sender',
      password: 'smtp-fixture-secret',
      from: 'sender@example.test',
      fromName: 'Brand Name',
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().values.fromName, 'Brand Name');
  assert(!response.body.includes('smtp-fixture-secret'));
  response = await app.inject({
    method: 'PUT',
    url,
    headers,
    payload: { fromName: 'New Brand', password: '' },
  });
  assert.equal(response.statusCode, 200, response.body);
  const runtime = await new SmtpSettingsService(db, env).getRuntimeSettings();
  assert.equal(runtime!.password, 'smtp-fixture-secret');
  assert.equal(runtime!.transport, 'capture');
  response = await app.inject({
    method: 'POST',
    url: url + '/test',
    headers,
    payload: { to: 'recipient@example.test', subject: 'fixture', text: 'private fixture' },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().simulated, true);
  assert.equal(response.json().sent, false);
  const result = await new DeliveryJobHandlers(db, env).process({
    kind: 'email.deliver',
    payload: { to: 'recipient@example.test', subject: 'fixture', text: 'private fixture' },
  });
  assert.equal(result.channel, 'capture');
  assert.equal(result.simulated, true);
});
test('SMTP connection endpoint verifies only and does not persist a draft or send mail', async (t) => {
  const service = new SmtpSettingsService(db, env),
    before = await service.getOverview();
  let verifies = 0;
  t.mock.method(Mailer.prototype, 'verify', async () => {
    verifies++;
  });
  t.mock.method(Mailer.prototype, 'send', async () => {
    throw Error('Connection test must not send mail');
  });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/system-settings/smtp/connection-test',
    headers: { authorization: `Bearer ${token}` },
    payload: { host: 'draft.example.test', port: 465, secure: true },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(verifies, 1);
  assert.deepEqual(await service.getOverview(), before);
});

test('sensitive settings rotation is authorized, repeatable and returns no plaintext', async () => {
  const url = '/v1/admin/system-settings/rotate-secrets';
  const anonymous = await app.inject({ method: 'POST', url });
  assert.equal(anonymous.statusCode, 401);
  for (let i = 0; i < 2; i++) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().rotated, 0);
    assert(!response.body.includes('smtp-fixture-secret'));
  }
});
