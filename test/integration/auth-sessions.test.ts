import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { createServiceFactories } from '../../src/composition/service-factories';
import { authSessions } from '../../src/db/schema';
import { AuthRepository } from '../../src/modules/auth/repository';
import { AuthService } from '../../src/modules/auth/service';
import { testDatabase } from './helpers';

const { db, pool, env } = testDatabase();
const password = 'Session-fixture-password';
const replacement = 'Replacement-fixture-password';
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
async function account() {
  return new AuthService(createServiceFactories(), db, env).register({
    email: `${randomUUID()}@example.test`,
    password,
  });
}
async function browserLogin(email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/login',
    payload: { email, password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const cookie = response.cookies.map((value) => `${value.name}=${value.value}`).join('; ');
  return {
    response,
    cookie,
    csrf: response.json().csrfToken as string,
    id: response.json().session.id as string,
  };
}
const me = (cookie: string) => app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
test('browser sessions store only digests and enforce session-bound CSRF and origin', async () => {
  const user = await account();
  const session = await browserLogin(user.email);
  assert.equal(session.response.json().token, undefined);
  const raw = session.response.cookies.find((value) => value.name === 'fd_core_session')!;
  assert.equal(raw.httpOnly, true);
  assert.equal(raw.sameSite, 'Lax');
  const [stored] = await db.select().from(authSessions).where(eq(authSessions.id, session.id));
  assert.notEqual(stored.tokenDigest, raw.value);
  assert.notEqual(stored.csrfDigest, session.csrf);
  assert.equal((await me(session.cookie)).statusCode, 200);
  for (const headers of [
    { cookie: session.cookie },
    { cookie: session.cookie, 'x-csrf-token': 'wrong-token' },
    { cookie: session.cookie, 'x-csrf-token': session.csrf, origin: 'https://untrusted.example' },
  ]) {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers,
      payload: { displayName: 'Changed' },
    });
    assert.equal(response.statusCode, 403);
  }
  const changed = await app.inject({
    method: 'PATCH',
    url: '/v1/me',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    payload: { displayName: 'Changed' },
  });
  assert.equal(changed.statusCode, 200);
});
test('browser login rejects cross-site origins and CSRF from another session', async () => {
  const user = await account();
  const rejected = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/login',
    headers: { origin: 'https://untrusted.example' },
    payload: { email: user.email, password },
  });
  assert.equal(rejected.statusCode, 403);
  const first = await browserLogin(user.email),
    second = await browserLogin(user.email);
  const swapped = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/logout',
    headers: { cookie: first.cookie, 'x-csrf-token': second.csrf },
  });
  assert.equal(swapped.statusCode, 403);
  assert.equal((await me(first.cookie)).statusCode, 200);
});
test('session listing and revocation are account-scoped and logout revokes on the server', async () => {
  const first = await account(),
    second = await account();
  const a = await browserLogin(first.email),
    b = await browserLogin(first.email),
    other = await browserLogin(second.email);
  const list = await app.inject({
    method: 'GET',
    url: '/v1/auth/sessions',
    headers: { cookie: a.cookie },
  });
  assert.equal(list.json().items.length, 2);
  assert.equal(list.json().items.find((value: { id: string }) => value.id === a.id).current, true);
  const foreign = await app.inject({
    method: 'POST',
    url: `/v1/auth/sessions/${other.id}/revoke`,
    headers: { cookie: a.cookie, 'x-csrf-token': a.csrf },
  });
  assert.equal(foreign.statusCode, 404);
  const revoked = await app.inject({
    method: 'POST',
    url: `/v1/auth/sessions/${b.id}/revoke`,
    headers: { cookie: a.cookie, 'x-csrf-token': a.csrf },
  });
  assert.equal(revoked.statusCode, 200);
  assert.equal((await me(b.cookie)).statusCode, 401);
  const logout = await app.inject({
    method: 'POST',
    url: '/v1/auth/session/logout',
    headers: { cookie: a.cookie, 'x-csrf-token': a.csrf },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal((await me(a.cookie)).statusCode, 401);
});
test('password changes invalidate browser sessions and both legacy and versioned Bearer tokens', async () => {
  const user = await account(),
    session = await browserLogin(user.email);
  const legacy = app.jwt.sign({ sub: user.id, kind: 'user' });
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: user.email, password },
  });
  const token = login.json().token as string;
  const changed = await app.inject({
    method: 'POST',
    url: '/v1/me/change-password',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
    payload: { currentPassword: password, newPassword: replacement, confirmPassword: replacement },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await me(session.cookie)).statusCode, 401);
  for (const value of [legacy, token])
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/me',
          headers: { authorization: `Bearer ${value}` },
        })
      ).statusCode,
      401,
    );
  const fresh = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: user.email, password: replacement },
  });
  assert.equal(fresh.statusCode, 200);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${fresh.json().token}` },
      })
    ).statusCode,
    200,
  );
});
test('a reset code is consumed once under concurrent password reset requests', async () => {
  const user = await account(),
    session = await browserLogin(user.email);
  const repository = new AuthRepository(db);
  await repository.createPasswordResetCode(user.id, '123456', new Date(Date.now() + 60000));
  const service = new AuthService(createServiceFactories(), db, env);
  const results = await Promise.allSettled([
    service.resetPassword({ email: user.email, code: '123456', newPassword: replacement }),
    service.resetPassword({ email: user.email, code: '123456', newPassword: password + '-other' }),
  ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal((await me(session.cookie)).statusCode, 401);
  assert.equal(await repository.findActivePasswordResetCode(user.id, '123456'), null);
});
test('a failed password reset event rolls back password, code consumption and credential revocation', async () => {
  const user = await account(),
    session = await browserLogin(user.email);
  const repository = new AuthRepository(db);
  await repository.createPasswordResetCode(user.id, '234567', new Date(Date.now() + 60000));
  const original = await repository.findPasswordCredentialByUserId(user.id);
  const base = createServiceFactories();
  const factories = createServiceFactories({
    createEventService: (tx) => ({
      ...base.createEventService(tx),
      capture: async () => {
        throw new Error('injected event failure');
      },
    }),
  });
  await assert.rejects(
    new AuthService(factories, db, env).resetPassword({
      email: user.email,
      code: '234567',
      newPassword: replacement,
    }),
  );
  assert.equal(
    (await repository.findPasswordCredentialByUserId(user.id))?.passwordHash,
    original?.passwordHash,
  );
  assert.ok(await repository.findActivePasswordResetCode(user.id, '234567'));
  assert.equal((await me(session.cookie)).statusCode, 200);
});
test('email verification codes are atomically consumed', async () => {
  const user = await account(),
    repository = new AuthRepository(db);
  await repository.createVerificationCode(user.id, '345678', new Date(Date.now() + 60000));
  const service = new AuthService(createServiceFactories(), db, env);
  const results = await Promise.allSettled([
    service.verifyEmail(user.id, '345678'),
    service.verifyEmail(user.id, '345678'),
  ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
});
test('expired sessions and suspended accounts remain revoked after reactivation', async () => {
  const user = await account(),
    first = await browserLogin(user.email),
    second = await browserLogin(user.email);
  await db
    .update(authSessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(authSessions.id, first.id));
  assert.equal((await me(first.cookie)).statusCode, 401);
  const token = app.jwt.sign({ sub: user.id });
  const repository = new AuthRepository(db);
  await repository.updateUser(user.id, { status: 'suspended' });
  await repository.updateUser(user.id, { status: 'active' });
  assert.equal((await me(second.cookie)).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: `Bearer ${token}` },
      })
    ).statusCode,
    401,
  );
  assert.equal((await browserLogin(user.email)).response.statusCode, 200);
});
