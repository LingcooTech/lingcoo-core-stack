import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { appConnections, appPublishingTokens, apps, deployments, plans } from '../../src/db/schema';
import { testDatabase, seedPurchase } from './helpers';
import { AppService } from '../../src/modules/app/service';
import { AppLifecycleService } from '../../src/modules/app/lifecycle-service';
import { AppImagesService } from '../../src/modules/app/images-service';
import { DevelopmentInventory } from '../../src/modules/app/development-inventory';
import { readFileSync } from 'node:fs';
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
test('Compose plan HTTP preview is scoped to the immutable release and never reserves an instance', async () => {
  const { user } = await seedPurchase(db),
    code = 'plan_' + randomUUID().replaceAll('-', '');
  const raw = JSON.parse(readFileSync('examples/stack-compose-app.json', 'utf8'));
  raw.app.code = code;
  raw.features[0].code = code + '_access';
  const preview = await service.preview({ document: JSON.stringify(raw) });
  await service.import(preview, user.id);
  const release = await service.registerRelease(
    code,
    {
      version: '1.0.0',
      commit: 'a'.repeat(40),
      definition: preview.definition,
      images: { web: raw.images[0].repository + '@sha256:' + 'b'.repeat(64) },
      notes: '',
    },
    user.id,
  );
  raw.delivery.resources.memoryMb = 512;
  raw.delivery.resources.serviceLimits.web.memoryMb = 512;
  await service
    .publishing()
    .applySource(code, await service.preview({ document: JSON.stringify(raw) }), user.id);
  const http = await buildApp(env);
  try {
    const headers = { authorization: `Bearer ${http.jwt.sign({ sub: user.id, kind: 'user' })}` },
      payload = { instanceId: randomUUID(), mode: 'managed' },
      url = `/v1/admin/apps/${code}/releases/${release.id}/plan`;
    assert.equal((await http.inject({ method: 'POST', url, headers, payload })).statusCode, 403);
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
    const response = await http.inject({ method: 'POST', url, headers, payload });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().executionEnabled, false);
    assert.equal(response.json().plan.releaseId, release.id);
    assert.equal(response.json().plan.services[0].image, release.images.web);
    assert.equal(response.json().plan.resources.memoryMb, 256);
    assert.equal(response.json().plan.instanceId, payload.instanceId);
    assert.equal(
      (await db.select().from(deployments).where(eq(deployments.id, payload.instanceId))).length,
      0,
    );
    const missing = await http.inject({
      method: 'POST',
      url: `/v1/admin/apps/${code}/releases/${randomUUID()}/plan`,
      headers,
      payload,
    });
    assert.equal(missing.statusCode, 404);
    assert.equal((await service.overview(code)).releases[0]?.status, 'draft');
    await assert.rejects(() => service.transition(code, release.id, 'published', user.id), {
      statusCode: 422,
    });
  } finally {
    await http.close();
  }
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

test('CI credentials register drafts only for their own application and stop working after revocation or expiry', async () => {
  const { user } = await seedPurchase(db),
    code = 'ci_' + randomUUID().replaceAll('-', ''),
    other = 'ci_other_' + randomUUID().replaceAll('-', '');
  const preview = await service.preview({ document: JSON.stringify(definition(code)) });
  await service.import(preview, user.id);
  await service.import(
    await service.preview({ document: JSON.stringify(definition(other)) }),
    user.id,
  );
  const publishing = service.publishing();
  const credential = await publishing.issueToken(code, 'Actions fixture', user.id);
  const input = {
    version: '1.0.0',
    commit: 'a'.repeat(40),
    definition: preview.definition,
    images: {},
    notes: '',
  };
  const [a, b] = await Promise.all([
    publishing.submit(code, credential.token, input),
    publishing.submit(code, credential.token, input),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.status, 'draft');
  assert.ok(!JSON.stringify(await publishing.tokens(code)).includes(credential.token));
  await assert.rejects(() => publishing.submit(other, credential.token, input), {
    statusCode: 401,
  });
  await publishing.revokeToken(code, credential.record.id, user.id);
  await assert.rejects(() => publishing.submit(code, credential.token, input), { statusCode: 401 });
  const expired = await publishing.issueToken(code, 'Expired fixture', user.id);
  await db
    .update(appPublishingTokens)
    .set({ expiresAt: new Date(0) })
    .where(eq(appPublishingTokens.id, expired.record.id));
  await assert.rejects(() => publishing.submit(code, expired.token, input), { statusCode: 401 });
});

test('source synchronization preserves immutable releases and app sales metadata', async () => {
  const { user } = await seedPurchase(db),
    code = 'sync_' + randomUUID().replaceAll('-', '');
  const preview = await service.preview({ document: JSON.stringify(definition(code)) });
  await service.import(preview, user.id);
  const release = await service.registerRelease(
    code,
    {
      version: '1.0.0',
      commit: 'a'.repeat(40),
      definition: preview.definition,
      images: {},
      notes: '',
    },
    user.id,
  );
  const changed = definition(code);
  changed.app.name = 'New source name';
  const next = await service.preview({ document: JSON.stringify(changed) });
  await service.publishing().applySource(code, next, user.id);
  const overview = await service.overview(code);
  assert.equal(overview.definition?.app.name, 'New source name');
  assert.equal(overview.releases[0]?.definition.app.name, release.definition.app.name);
  const [app] = await db.select().from(apps).where(eq(apps.code, code));
  assert.equal(app?.name, 'Lifecycle fixture');
  assert.equal(app?.status, 'inactive');
});

test('CI HTTP endpoint accepts its scoped credential without an admin session', async () => {
  const http = await buildApp(env);
  try {
    const { user } = await seedPurchase(db),
      code = 'ci_http_' + randomUUID().replaceAll('-', '');
    const preview = await service.preview({ document: JSON.stringify(definition(code)) });
    await service.import(preview, user.id);
    const credential = await service.publishing().issueToken(code, 'HTTP fixture', user.id);
    const payload = {
      version: '1.0.0',
      commit: 'a'.repeat(40),
      definition: preview.definition,
      images: {},
      notes: '',
    };
    const response = await http.inject({
      method: 'POST',
      url: `/v1/publishing/apps/${code}/releases`,
      headers: { authorization: `Bearer ${credential.token}` },
      payload,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().status, 'draft');
    const admin = await http.inject({
      method: 'GET',
      url: `/v1/admin/apps/${code}/publishing-tokens`,
      headers: { authorization: `Bearer ${credential.token}` },
    });
    assert.equal(admin.statusCode, 401);
  } finally {
    await http.close();
  }
});

test('build dispatch pins checkout commit, is idempotent, and preserves ambiguous failures for manual inspection', async () => {
  const { user } = await seedPurchase(db),
    code = 'build_' + randomUUID().replaceAll('-', '');
  const preview = await service.preview({
    document: JSON.stringify({ ...definition(code), build: { workflow: 'publish.yml' } }),
  });
  await service.import(preview, user.id);
  const connection = await service.connect(
    { kind: 'github', name: 'Actions', token: 'test-actions-token' },
    user.id,
  );
  await service.publishing().applySource(
    code,
    {
      ...preview,
      source: {
        repository: 'https://github.com/example/app',
        ref: 'main',
        path: 'stack/app.yaml',
        commit: 'a'.repeat(40),
        connectionId: connection.id,
      },
    },
    user.id,
  );
  let calls = 0,
    fail = false;
  const dependencies = createServiceFactories();
  const mocked = new AppLifecycleService(
    db,
    env,
    dependencies,
    (tx) => new AppService(dependencies, tx, env),
    (async (_url, init) => {
      calls++;
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-actions-token');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.ref, 'main');
      assert.equal(body.inputs.stack_commit, 'a'.repeat(40));
      if (fail) throw Error('transport failed with sensitive detail');
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  ).publishing();
  const request = { requestId: randomUUID(), version: '1.0.0' };
  const [a, b] = await Promise.all([
    mocked.dispatch(code, request, user.id),
    mocked.dispatch(code, request, user.id),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(calls, 1);
  assert.equal((await mocked.dispatch(code, request, user.id)).status, 'dispatched');
  await assert.rejects(() => mocked.dispatch(code, { ...request, version: '2.0.0' }, user.id), {
    statusCode: 409,
  });
  fail = true;
  const unknown = { requestId: randomUUID(), version: '3.0.0' };
  await assert.rejects(() => mocked.dispatch(code, unknown, user.id), { statusCode: 502 });
  assert.equal((await mocked.dispatch(code, unknown, user.id)).status, 'unknown');
  assert.equal(calls, 2, 'uncertain dispatch must not be repeated automatically');
});

test('registry browsing is bound to the declared application component and matching credential host', async () => {
  const { user } = await seedPurchase(db),
    code = 'registry_' + randomUUID().replaceAll('-', '');
  const raw = JSON.parse(readFileSync('examples/stack-compose-app.json', 'utf8'));
  raw.app.code = code;
  raw.features = [];
  const preview = await service.preview({ document: JSON.stringify(raw) });
  await service.import(preview, user.id);
  const good = await service.connect(
    {
      kind: 'registry',
      name: 'Pull',
      host: 'registry.example.com',
      username: 'robot',
      password: 'private-password',
    },
    user.id,
  );
  const wrong = await service.connect(
    {
      kind: 'registry',
      name: 'Other',
      host: 'other.example.com',
      username: 'other',
      password: 'never-send',
    },
    user.id,
  );
  let calls = 0;
  const images = new AppImagesService(db, env, async (url, headers) => {
    calls++;
    assert.equal(url.host, 'registry.example.com');
    assert.equal(url.pathname, '/v2/lingcoo/example-web/tags/list');
    if (!headers.Authorization)
      return {
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Basic realm="registry"' }),
        body: Buffer.alloc(0),
      };
    assert.equal(
      headers.Authorization,
      'Basic ' + Buffer.from('robot:private-password').toString('base64'),
    );
    return {
      status: 200,
      headers: new Headers(),
      body: Buffer.from('{"name":"lingcoo/example-web","tags":["v1"]}'),
    };
  });
  await assert.rejects(() => images.tags(code, 'web', { connectionId: wrong.id }), {
    statusCode: 422,
  });
  await assert.rejects(() => images.tags(code, 'undeclared', { connectionId: good.id }), {
    statusCode: 404,
  });
  assert.equal(calls, 0);
  assert.deepEqual((await images.tags(code, 'web', { connectionId: good.id })).tags, ['v1']);
  assert.equal(calls, 2);
});

test('development project builds and registers releases before a product, then preserves source and sales boundaries', async () => {
  const { user } = await seedPurchase(db),
    code = 'dev_' + randomUUID().replaceAll('-', '');
  const preview = await service.preview({ document: JSON.stringify(definition(code)) });
  await service.createProject(preview, user.id);
  assert.equal(
    (await db.select().from(apps).where(eq(apps.code, code))).length,
    0,
    'project creation must not create a product',
  );
  const credential = await service.publishing().issueToken(code, 'Pre-product CI', user.id);
  const release = await service.publishing().submit(code, credential.token, {
    version: '1.0.0',
    commit: 'a'.repeat(40),
    definition: preview.definition,
    images: {},
    notes: '',
  });
  await service.transition(code, release.id, 'published', user.id);
  assert.equal((await service.overview(code)).releases[0]?.id, release.id);
  await service.importProjectProduct(code, user.id);
  const products = new AppService(createServiceFactories(), db, env);
  await products.selectDeliveryVersion(code, release.id, user.id);
  const [stored] = await db.select().from(apps).where(eq(apps.code, code));
  assert.equal(stored!.status, 'inactive');
  assert.equal((stored!.meta as Record<string, unknown>).deliveryReleaseId, release.id);
  await products.upsertApp(
    code,
    { name: 'Sales-owned name', type: 'web_app', status: 'inactive', meta: { marketing: 'kept' } },
    user.id,
  );
  let [updated] = await db.select().from(apps).where(eq(apps.code, code));
  assert.equal(
    (updated!.meta as Record<string, unknown>).deliveryReleaseId,
    release.id,
    'omitted delivery keys must be preserved',
  );
  const changed = await service.preview({
    document: JSON.stringify({
      ...definition(code),
      app: { ...definition(code).app, name: 'Source candidate name' },
    }),
  });
  await service.publishing().applySource(code, changed, user.id);
  [updated] = await db.select().from(apps).where(eq(apps.code, code));
  assert.equal(updated!.name, 'Sales-owned name');
  assert.equal((updated!.meta as Record<string, unknown>).marketing, 'kept');
  await assert.rejects(
    () =>
      products.upsertApp(
        code,
        {
          name: 'Forbidden',
          type: 'web_app',
          status: 'inactive',
          meta: { deliveryMode: 'one_click' },
        },
        user.id,
      ),
    { statusCode: 422 },
  );
  const other = 'dev_' + randomUUID().replaceAll('-', '');
  await service.createProject(
    await service.preview({ document: JSON.stringify(definition(other)) }),
    user.id,
  );
  await assert.rejects(() => products.selectDeliveryVersion(other, release.id, user.id), {
    statusCode: 404,
  });
  await assert.rejects(
    () =>
      service.publishing().submit(other, credential.token, {
        version: '1.0.0',
        commit: 'a'.repeat(40),
        definition: changed.definition,
        images: {},
        notes: '',
      }),
    { statusCode: 401 },
  );
  // A legacy active row with a paid mode but no paid offers cannot bypass
  // publication checks by selecting an already published delivery version.
  await db
    .update(apps)
    .set({ status: 'active', meta: { acquisition: 'paid' } })
    .where(eq(apps.code, code));
  await db.update(plans).set({ status: 'inactive' }).where(eq(plans.appId, stored!.id));
  await assert.rejects(() => products.selectDeliveryVersion(code, release.id, user.id), {
    statusCode: 422,
  });
  await db.update(apps).set({ status: 'inactive' }).where(eq(apps.code, code));
  await service.transition(code, release.id, 'withdrawn', user.id);
  await assert.rejects(() => products.selectDeliveryVersion(code, release.id, user.id), {
    statusCode: 422,
  });
});

test('development APIs require permission, and referenced connections cannot be removed', async () => {
  const { user } = await seedPurchase(db),
    http = await buildApp(env);
  try {
    const headers = { authorization: `Bearer ${http.jwt.sign({ sub: user.id, kind: 'user' })}` };
    assert.equal(
      (await http.inject({ method: 'GET', url: '/v1/admin/development/projects', headers }))
        .statusCode,
      403,
    );
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
    const code = 'dev_' + randomUUID().replaceAll('-', ''),
      connection = await service.connect(
        { kind: 'github', name: 'Referenced', token: 'never-output' },
        user.id,
      );
    const preview = await service.preview({ document: JSON.stringify(definition(code)) });
    const response = await http.inject({
      method: 'POST',
      url: '/v1/admin/development/projects',
      headers,
      payload: {
        ...preview,
        source: {
          repository: 'https://github.com/example/app',
          ref: 'main',
          path: 'stack/app.yaml',
          commit: 'a'.repeat(40),
          connectionId: connection.id,
        },
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().projectCode, code);
    const overview = await http.inject({
      method: 'GET',
      url: '/v1/admin/development/projects/' + code,
      headers,
    });
    assert.equal(overview.statusCode, 200, overview.body);
    assert.equal(overview.json().definition.app.code, code);
    await assert.rejects(() => service.disconnect(connection.id, user.id), { statusCode: 409 });
    assert.ok((await service.connections()).items.some((c) => c.id === connection.id));
    const acr = await service.connect(
      {
        kind: 'acr',
        name: 'ACR read',
        edition: 'enterprise',
        instanceId: 'cri-testinstance',
        region: 'cn-beijing',
        host: 'registry.cn-beijing.aliyuncs.com',
        accessKeyId: 'private-id',
        accessKeySecret: 'private-secret',
      },
      user.id,
    );
    const publicView = JSON.stringify(await service.connections());
    assert.ok(!publicView.includes('private-secret') && !publicView.includes('private-id'));
    await service.disconnect(acr.id, user.id);
  } finally {
    await http.close();
  }
});

test('personal registry inventory derives known repositories from upstream declarations and pages tags', async () => {
  const { user } = await seedPurchase(db),
    code = 'inventory_' + randomUUID().replaceAll('-', '');
  const raw = JSON.parse(readFileSync('examples/stack-compose-app.json', 'utf8'));
  raw.app.code = code;
  raw.features = [];
  await service.createProject(await service.preview({ document: JSON.stringify(raw) }), user.id);
  const connection = await service.connect(
    {
      kind: 'registry',
      name: 'Personal pull',
      host: 'registry.example.com',
      username: 'robot',
      password: 'private',
    },
    user.id,
  );
  const inventory = new DevelopmentInventory(db, env, async (url) => ({
    status: 200,
    headers: new Headers({
      link: '</v2/lingcoo/example-web/tags/list?n=100&last=v100>; rel="next"',
    }),
    body: Buffer.from(
      JSON.stringify({
        name: 'lingcoo/example-web',
        tags: [url.searchParams.has('last') ? 'v101' : 'v100'],
      }),
    ),
  }));
  assert.ok(
    (await inventory.list(connection.id, { kind: 'namespaces', page: 1 })).items.some(
      (r) => r.name === 'lingcoo',
    ),
  );
  assert.ok(
    (
      await inventory.list(connection.id, { kind: 'repositories', namespace: 'lingcoo', page: 1 })
    ).items.some((r) => 'repository' in r && r.repository === 'lingcoo/example-web'),
  );
  const first = await inventory.list(connection.id, {
    kind: 'tags',
    repository: 'lingcoo/example-web',
    page: 1,
  });
  assert.equal(first.nextPage, 2);
  assert.equal('nextCursor' in first && first.nextCursor, 'v100');
  assert.equal((await db.select().from(apps).where(eq(apps.code, code))).length, 0);
});
