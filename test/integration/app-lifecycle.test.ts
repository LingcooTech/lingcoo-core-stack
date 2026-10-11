import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { appConnections, apps } from '../../src/db/schema';
import { testDatabase, seedPurchase } from './helpers';
import { AppService } from '../../src/modules/app/service';
import { buildApp } from '../../src/app';
import { users } from '../../src/db/schema';
import { createServiceFactories } from '../../src/composition/service-factories';
const { db, pool, env } = testDatabase();
after(() => pool.end());
const service = new AppService(createServiceFactories(), db, env).lifecycle();
const definition = (code: string) => ({
  schemaVersion: 1,
  app: { code, name: 'Lifecycle fixture', license: 'MIT', acquisition: 'free' },
  features: [{ code: code + '_access', name: 'Access' }],
  delivery: { kind: 'none', url: 'https://example.com/app' },
});
test('import is atomic, always a draft, prevents parallel overwrites, and does not expose connection credentials', async () => {
  const { user } = await seedPurchase(db),
    code = 'import_' + randomUUID().replaceAll('-', '');
  const preview = await service.preview({ document: JSON.stringify(definition(code)) });
  const outcomes = await Promise.allSettled([
    service.import(preview, user.id),
    service.import(preview, user.id),
  ]);
  assert.equal(outcomes.filter((v) => v.status === 'fulfilled').length, 1);
  const [stored] = await db.select().from(apps).where(eq(apps.code, code));
  assert.equal(stored?.status, 'inactive');
  assert.equal((await service.overview(code)).definition?.app.acquisition, 'free');
  const connection = await service.connect(
    { kind: 'github', name: 'Test', token: 'token-never-return' },
    user.id,
  );
  assert.ok(!JSON.stringify(await service.connections()).includes('token-never-return'));
  const [saved] = await db
    .select()
    .from(appConnections)
    .where(eq(appConnections.id, connection.id));
  assert.ok(!JSON.stringify(saved).includes('token-never-return'));
  await service.disconnect(connection.id, user.id);
});
test('release versions are immutable and scoped, retries are idempotent, publish does not activate app', async () => {
  const { user } = await seedPurchase(db),
    code = 'release_' + randomUUID().replaceAll('-', '');
  const preview = await service.preview({ document: JSON.stringify(definition(code)) });
  await service.import(preview, user.id);
  const input = {
    version: '1.0.0',
    commit: 'a'.repeat(40),
    definition: preview.definition,
    images: {},
    notes: '',
  };
  const [a, b] = await Promise.all([
    service.registerRelease(code, input, user.id),
    service.registerRelease(code, input, user.id),
  ]);
  assert.equal(a.id, b.id);
  await assert.rejects(
    () => service.registerRelease(code, { ...input, commit: 'b'.repeat(40) }, user.id),
    { statusCode: 409 },
  );
  await assert.rejects(
    () =>
      service.registerRelease(
        code,
        {
          ...input,
          definition: {
            ...preview.definition,
            app: { ...preview.definition.app, code: 'another_app' },
          },
        },
        user.id,
      ),
    { statusCode: 422 },
  );
  assert.equal((await service.transition(code, a.id, 'published', user.id)).status, 'published');
  const [app] = await db.select().from(apps).where(eq(apps.code, code));
  assert.equal(app?.status, 'inactive');
  assert.equal((await service.transition(code, a.id, 'withdrawn', user.id)).status, 'withdrawn');
  await assert.rejects(() => service.transition(code, a.id, 'published', user.id), {
    statusCode: 409,
  });
});

test('lifecycle HTTP routes require actual admin permissions and use the registered response contracts', async () => {
  const http = await buildApp(env);
  try {
    const fixture = await seedPurchase(db);
    const token = http.jwt.sign({ sub: fixture.user.id, kind: 'user' });
    const headers = { authorization: `Bearer ${token}` };
    assert.equal(
      (await http.inject({ method: 'GET', url: '/v1/admin/app-connections', headers })).statusCode,
      403,
    );
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, fixture.user.id));
    const code = 'http_' + randomUUID().replaceAll('-', '');
    const preview = await http.inject({
      method: 'POST',
      url: '/v1/admin/apps/import/preview',
      headers,
      payload: { document: JSON.stringify(definition(code)) },
    });
    assert.equal(preview.statusCode, 200, preview.body);
    const imported = await http.inject({
      method: 'POST',
      url: '/v1/admin/apps/import',
      headers,
      payload: preview.json(),
    });
    assert.equal(imported.statusCode, 200, imported.body);
    const lifecycle = await http.inject({
      method: 'GET',
      url: `/v1/admin/apps/${code}/lifecycle`,
      headers,
    });
    assert.equal(lifecycle.statusCode, 200, lifecycle.body);
    assert.equal(lifecycle.json().definition.app.code, code);
    assert.equal(lifecycle.json().releases.length, 0);
  } finally {
    await http.close();
  }
});

test('a new repository cannot take ownership of another application feature', async () => {
  const { user } = await seedPurchase(db),
    first = 'owner_' + randomUUID().replaceAll('-', ''),
    second = 'collision_' + randomUUID().replaceAll('-', '');
  const original = definition(first);
  await service.import(await service.preview({ document: JSON.stringify(original) }), user.id);
  const conflicting = definition(second);
  conflicting.features = original.features;
  await assert.rejects(
    () =>
      service
        .preview({ document: JSON.stringify(conflicting) })
        .then((v) => service.import(v, user.id)),
    { statusCode: 409 },
  );
  const [unexpected] = await db.select().from(apps).where(eq(apps.code, second));
  assert.equal(unexpected, undefined, 'conflicting import rolls back the whole draft');
  assert.equal(
    (await service.overview(first)).definition?.features[0]?.code,
    original.features[0]?.code,
  );
});
