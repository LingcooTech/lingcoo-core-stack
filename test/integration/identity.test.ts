import { createServiceFactories } from '../../src/composition/service-factories';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { AuthService } from '../../src/modules/auth/service';
import { bootstrapAdmin } from '../../src/scripts/bootstrap-admin';
import { buildApp } from '../../src/app';
import { testDatabase } from './helpers';

const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  await db.update(users).set({ role: 'user' }).where(eq(users.role, 'admin'));
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
test('public registration and login never bootstrap an administrator', async () => {
  const email = `${randomUUID()}@example.test`;
  const auth = new AuthService(createServiceFactories(), db, { ...env, NODE_ENV: 'production' });
  const user = await auth.register({ email, password: 'fixture-strong-password' });
  assert.equal(user.role, 'user');
  assert.equal(user.emailVerified, false, 'Missing SMTP must not verify production users');
  assert.equal((await auth.login({ email, password: 'fixture-strong-password' })).role, 'user');
});
test('explicit administrator initialization is idempotent and concurrency-safe', async () => {
  const input = { email: `${randomUUID()}@example.test`, password: 'fixture-strong-password' };
  const results = await Promise.all([bootstrapAdmin(db, input), bootstrapAdmin(db, input)]);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal((await db.select().from(users).where(eq(users.role, 'admin'))).length, 1);
});
test('App Tokens and suspended users cannot authenticate as users', async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, status: 'suspended', role: 'admin' })
    .returning();
  for (const kind of ['user', 'app'] as const) {
    const token = app.jwt.sign({ sub: user.id, kind });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 401);
  }
});
test('read-only observability permission cannot retry tasks', async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, role: 'support' })
    .returning();
  const token = app.jwt.sign({ sub: user.id });
  const response = await app.inject({
    method: 'POST',
    url: `/v1/admin/jobs/${randomUUID()}/retry`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 403);
});
