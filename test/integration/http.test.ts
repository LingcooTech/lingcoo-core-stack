import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from '../../src/app';
import { deploymentTokens, deployments } from '../../src/db/schema';
import { hashPassword } from '../../src/lib/security';
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
test('App Token cannot access a different appCode', async () => {
  const token = app.jwt.sign({
    sub: '11111111-1111-4111-8111-111111111111',
    kind: 'app',
    appId: '11111111-1111-4111-8111-111111111111',
    appCode: 'source',
    secretId: '11111111-1111-4111-8111-111111111111',
  });
  const result = await app.inject({
    method: 'GET',
    url: '/v1/apps/other/entitlements/me',
    headers: { 'x-fd-app-token': token },
  });
  assert.equal(result.statusCode, 403);
});
test('expired and revoked deployment tokens cannot exchange bootstrap', async () => {
  const fixture = await seedPurchase(db);
  const [deployment] = await db
    .insert(deployments)
    .values({ userId: fixture.user.id, appId: fixture.app.id, label: 'Fixture' })
    .returning();
  for (const state of ['expired', 'inactive'] as const) {
    const token = `fixture_deployment_token_${state}`;
    await db.insert(deploymentTokens).values({
      deploymentId: deployment.id,
      tokenHash: hashPassword(token),
      tokenHint: token.slice(-8),
      status: state === 'expired' ? 'active' : 'inactive',
      expiresAt: new Date(Date.now() + (state === 'expired' ? -60000 : 60000)),
    });
    const result = await app.inject({
      method: 'POST',
      url: '/v1/deployments/bootstrap/exchange',
      payload: { token },
    });
    assert.equal(result.statusCode, 401);
  }
});
test('Admin permissions are enforced by the HTTP API', async () => {
  const fixture = await seedPurchase(db);
  const token = app.jwt.sign({ sub: fixture.user.id, role: 'admin' });
  const result = await app.inject({
    method: 'GET',
    url: '/v1/admin/users',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(
    result.statusCode,
    403,
    'A user cannot elevate access by a stale or forged role claim',
  );
});
