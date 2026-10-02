import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { eq, count } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import * as schema from '../../src/db/schema';
import { requireResult } from '../../src/db/required-result';
import { testDatabase, seedPurchase } from './helpers';
import { AiRepository } from '../../src/modules/ai/repository';

const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: { id: string; token: string },
  user: { id: string; token: string },
  other: { id: string; token: string };
let upstreamCalls = 0;
let providerMode: 'failure' | 'success' | 'malformed' = 'failure';
const upstream = createServer((req, res) => {
  upstreamCalls++;
  res.setHeader('content-type', 'application/json');
  if (req.url?.includes('/wp-json/')) {
    res.end(JSON.stringify({ id: 42, title: 'invalid external shape' }));
    return;
  }
  if (providerMode === 'success') {
    setTimeout(
      () =>
        res.end(
          JSON.stringify({
            id: 'fixture-response',
            model: 'fixture-model',
            choices: [{ message: { content: 'Fixture answer' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        ),
      100,
    );
    return;
  }
  if (providerMode === 'malformed') {
    res.end(JSON.stringify({ choices: 'invalid' }));
    return;
  }
  res.statusCode = 503;
  res.end(JSON.stringify({ error: { message: 'Provider temporarily unavailable' } }));
});
async function subject(role: 'user' | 'admin') {
  const [row] = await db
    .insert(schema.users)
    .values({ email: `${randomUUID()}@example.test`, role, emailVerified: true })
    .returning();
  assert.ok(row);
  return { id: row.id, token: app.jwt.sign({ sub: row.id, role, kind: 'user' }) };
}
const call = (
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  actor?: { token: string },
  payload?: object,
) =>
  app.inject({
    method,
    url,
    headers: actor ? { authorization: `Bearer ${actor.token}` } : {},
    ...(payload ? { payload } : {}),
  });
function success(response: { statusCode: number; body: string }, status = 200) {
  assert.equal(response.statusCode, status, response.body);
}
before(async () => {
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  app = await buildApp({
    ...env,
    OPENROUTER_API_KEY: 'fixture-api-key',
    OPENROUTER_BASE_URL: `http://127.0.0.1:${address.port}`,
    OPENROUTER_DEFAULT_MODEL: 'fixture-model',
    QINIU_ACCESS_KEY: 'fixture-access',
    QINIU_SECRET_KEY: 'fixture-secret',
    QINIU_BUCKET_NAME: 'fixture-bucket',
    QINIU_PUBLIC_BASE_URL: 'https://media.example.test',
    QINIU_DEFAULT_PREFIX: 'media',
  });
  admin = await subject('admin');
  user = await subject('user');
  other = await subject('user');
});
after(async () => {
  await app.close();
  await pool.end();
  await new Promise<void>((resolve, reject) =>
    upstream.close((err) => (err ? reject(err) : resolve())),
  );
});

test('content publication controls public discovery and rejects unauthorized writes and malformed imports', async () => {
  const slug = `content-${randomUUID()}`;
  const draft = await call('POST', '/v1/admin/content', admin, {
    slug,
    title: 'Boundary fixture',
    content: 'Draft text',
  });
  success(draft, 201);
  assert.equal((await call('GET', `/v1/content/${slug}`)).statusCode, 404);
  const list = await call('GET', `/v1/content?search=${slug}&status=draft`);
  success(list);
  assert.equal(list.json().items.length, 0);
  assert.equal(
    (await call('POST', '/v1/admin/content', user, { title: 'Forbidden' })).statusCode,
    403,
  );
  const id = draft.json().id as string;
  success(
    await call('PUT', `/v1/admin/content/${id}`, admin, {
      slug,
      title: 'Boundary fixture',
      content: 'Published text',
      status: 'published',
    }),
  );
  success(await call('GET', `/v1/content/${slug}`));
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const beforeCount = requireResult(
    (await db.select({ value: count() }).from(schema.contentItems))[0],
    'content count',
  ).value;
  const bad = await call('POST', '/v1/admin/content/import/wordpress', admin, {
    postUrl: `http://127.0.0.1:${address.port}/?p=42`,
  });
  assert.ok(bad.statusCode >= 400, bad.body);
  assert.equal(
    requireResult(
      (await db.select({ value: count() }).from(schema.contentItems))[0],
      'content count',
    ).value,
    beforeCount,
  );
});

test('internal spaces, hidden spaces and draft documentation stay out of public pages, search and feedback', async () => {
  for (const spec of [
    { type: 'product', status: 'active' },
    { type: 'internal', status: 'active' },
    { type: 'product', status: 'hidden' },
  ]) {
    const slug = `docs-${randomUUID()}`;
    const space = await call('POST', '/v1/admin/docs/spaces', admin, {
      slug,
      title: 'Boundary docs',
      ...spec,
    });
    success(space, 201);
    const spaceId = space.json().id as string;
    const adminSpaces = await call('GET', '/v1/admin/docs/spaces', admin);
    success(adminSpaces);
    assert.ok(
      (adminSpaces.json().items as { id: string }[]).some((item) => item.id === spaceId),
      'Administrators must retain access to internal and hidden spaces',
    );
    const page = await call('POST', '/v1/admin/docs/pages', admin, {
      spaceId,
      slug: 'published',
      title: 'Public page',
      content: 'Docs',
      status: 'published',
    });
    success(page, 201);
    success(
      await call('POST', '/v1/admin/docs/pages', admin, {
        spaceId,
        slug: 'draft',
        title: 'Draft page',
        content: 'Secret draft',
      }),
      201,
    );
    const isPublic = spec.type === 'product' && spec.status === 'active';
    const publicSpaces = await call('GET', '/v1/docs/spaces');
    success(publicSpaces);
    assert.equal(
      (publicSpaces.json().items as { id: string }[]).some((item) => item.id === spaceId),
      isPublic,
    );
    assert.equal(
      (await call('GET', `/v1/docs/spaces/${slug}/page?path=published`)).statusCode,
      isPublic ? 200 : 404,
    );
    assert.equal((await call('GET', `/v1/docs/spaces/${slug}/page?path=draft`)).statusCode, 404);
    const index = await call('GET', '/v1/docs/search-index');
    success(index);
    const items = index.json().items as { spaceSlug: string; pagePath: string }[];
    assert.equal(
      items.some((item) => item.spaceSlug === slug && item.pagePath === 'published'),
      isPublic,
    );
    assert.equal(
      items.some((item) => item.spaceSlug === slug && item.pagePath === 'draft'),
      false,
    );
    const feedback = await call('POST', '/v1/docs/feedback', undefined, {
      spaceSlug: slug,
      pagePath: 'published',
      helpful: true,
    });
    assert.equal(feedback.statusCode, isPublic ? 200 : 404, feedback.body);
  }
  assert.equal(
    (await call('POST', '/v1/admin/docs/spaces', user, { slug: 'forbidden', title: 'Forbidden' }))
      .statusCode,
    403,
  );
});

test('tickets enforce owner and related-order isolation and hide staff internal notes', async () => {
  const purchase = await seedPurchase(db);
  const foreign = await call('POST', '/v1/tickets', user, {
    subject: 'Foreign order',
    body: 'Details',
    orderNo: purchase.order.orderNo,
  });
  assert.equal(foreign.statusCode, 403);
  const created = await call('POST', '/v1/tickets', user, {
    subject: 'Owned support ticket',
    body: 'Details',
  });
  success(created, 201);
  const ticketNo = created.json().ticket.ticketNo as string;
  for (const [method, suffix, payload] of [
    ['GET', '', undefined],
    ['POST', '/messages', { body: 'Intrusion' }],
    ['POST', '/close', undefined],
  ] as const) {
    assert.equal(
      (await call(method, `/v1/tickets/${ticketNo}${suffix}`, other, payload)).statusCode,
      403,
    );
  }
  const internal = await call('POST', `/v1/admin/tickets/${ticketNo}/messages`, admin, {
    body: 'Private staff note',
    isInternal: true,
  });
  success(internal);
  const visible = await call('GET', `/v1/tickets/${ticketNo}`, user);
  success(visible);
  assert.equal(
    (visible.json().messages as { isInternal: boolean }[]).some((message) => message.isInternal),
    false,
  );
  success(await call('POST', `/v1/tickets/${ticketNo}/close`, user));
});

test('notification mutations and bulk-read counts remain scoped to the authenticated user', async () => {
  const inserted = await db
    .insert(schema.notifications)
    .values(
      [user, other].map((actor) => ({
        userId: actor.id,
        category: 'system',
        level: 'info' as const,
        title: 'Boundary notification',
        body: 'Only own recipient',
      })),
    )
    .returning();
  const own = requireResult(inserted[0], 'own notification'),
    foreign = requireResult(inserted[1], 'foreign notification');
  for (const action of ['read', 'archive'])
    assert.equal(
      (await call('POST', `/v1/notifications/${foreign.id}/${action}`, user)).statusCode,
      404,
    );
  const list = await call('GET', '/v1/notifications/me', user);
  success(list);
  assert.equal(
    (list.json().items as { userId: string }[]).every((item) => item.userId === user.id),
    true,
  );
  success(await call('POST', '/v1/notifications/read-all', user));
  assert.equal(
    requireResult(
      (
        await db.select().from(schema.notifications).where(eq(schema.notifications.id, foreign.id))
      )[0],
      'foreign notification',
    ).status,
    'unread',
  );
  success(await call('POST', `/v1/notifications/${own.id}/archive`, user));
  assert.equal(
    (
      await call('POST', '/v1/admin/notifications/announcements', user, {
        title: 'Forbidden',
        body: 'No',
      })
    ).statusCode,
    403,
  );
});

test('AI validates identity, request budgets, quotas and records upstream failure without claiming a live provider test', async () => {
  const purchase = await seedPurchase(db);
  const path = `/v1/apps/${purchase.app.code}/ai/providers/openrouter/chat/completions`;
  const pending = await subject('user');
  await db
    .update(schema.users)
    .set({ emailVerified: false })
    .where(eq(schema.users.id, pending.id));
  assert.equal(
    (await call('POST', path, pending, { messages: [{ role: 'user', content: 'Hello' }] }))
      .statusCode,
    403,
  );
  const overview = await call('GET', `/v1/apps/${purchase.app.code}/ai/access`, user);
  success(overview);
  assert.equal(overview.json().access.scope, 'trial');
  const countBefore = upstreamCalls;
  assert.equal(
    (
      await call('POST', path, user, {
        maxTokens: 10000,
        messages: [{ role: 'user', content: 'Hello' }],
      })
    ).statusCode,
    422,
  );
  assert.equal(upstreamCalls, countBefore);
  const failed = await call('POST', path, user, { messages: [{ role: 'user', content: 'Hello' }] });
  assert.equal(failed.statusCode, 502, failed.body);
  assert.equal(failed.body.includes('fixture-api-key'), false);
  const usage = await new AiRepository(db).summarizeUsageWindow(
    user.id,
    purchase.app.id,
    new Date(Date.now() - 60000),
  );
  assert.equal(usage.requestCount, 0);
  await new AiRepository(db).createUsageEvent({
    userId: user.id,
    appId: purchase.app.id,
    provider: 'openrouter',
    model: 'fixture',
    operation: 'chat',
    accessScope: 'trial',
    status: 'succeeded',
    requestChars: 120000,
    responseChars: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });
  const exhausted = await call('POST', path, user, {
    messages: [{ role: 'user', content: 'Hello' }],
  });
  assert.equal(exhausted.statusCode, 429, exhausted.body);
});

test('storage upload credentials require administrator access and bind a short-lived signature to one object', async () => {
  const path = '/v1/admin/media/qiniu/upload-token';
  assert.equal((await call('POST', path, user, { filename: 'photo.png' })).statusCode, 403);
  const response = await call('POST', path, admin, {
    filename: '../../photo.png',
    prefix: 'article',
  });
  success(response);
  const body = response.json() as { uploadToken: string; key: string; expiresIn: number };
  assert.ok(body.key.startsWith('media/article/'));
  assert.equal(body.key.includes('..'), false);
  const [access, signature, encoded] = body.uploadToken.split(':');
  assert.ok(encoded);
  assert.equal(access, 'fixture-access');
  const expected = createHmac('sha1', 'fixture-secret')
    .update(encoded)
    .digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
  assert.equal(signature, expected);
  const policy = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as {
    scope: string;
    deadline: number;
  };
  assert.equal(policy.scope, `fixture-bucket:${body.key}`);
  assert.equal(body.expiresIn, 3600);
  assert.ok(policy.deadline * 1000 > Date.now());
  assert.ok(policy.deadline * 1000 < Date.now() + 3601000);
});

test('AI reserves the final quota slot once across concurrent requests and releases failed protocol reservations', async () => {
  const purchase = await seedPurchase(db);
  const actor = await subject('user');
  await db.insert(schema.aiUsageEvents).values(
    Array.from({ length: 29 }, () => ({
      userId: actor.id,
      appId: purchase.app.id,
      provider: 'openrouter',
      model: 'fixture',
      operation: 'chat',
      accessScope: 'trial',
      status: 'succeeded',
      requestChars: 1,
      responseChars: 1,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    })),
  );
  const path = `/v1/apps/${purchase.app.code}/ai/providers/openrouter/chat/completions`;
  const callsBefore = upstreamCalls;
  providerMode = 'success';
  try {
    const results = await Promise.all([
      call('POST', path, actor, { messages: [{ role: 'user', content: 'Hello' }] }),
      call('POST', path, actor, { messages: [{ role: 'user', content: 'Hello' }] }),
    ]);
    assert.deepEqual(
      results.map((result) => result.statusCode).sort(),
      [200, 429],
      results.map((result) => result.body).join('\n'),
    );
    assert.equal(upstreamCalls - callsBefore, 1);
    const rows = await db
      .select()
      .from(schema.aiUsageEvents)
      .where(eq(schema.aiUsageEvents.userId, actor.id));
    assert.equal(rows.filter((row) => row.status === 'pending').length, 0);
    assert.equal(rows.filter((row) => row.status === 'succeeded').length, 30);
    const fresh = await subject('user');
    providerMode = 'malformed';
    const invalid = await call('POST', path, fresh, {
      messages: [{ role: 'user', content: 'Hello' }],
    });
    assert.equal(invalid.statusCode, 502, invalid.body);
    const usage = await new AiRepository(db).summarizeUsageWindow(
      fresh.id,
      purchase.app.id,
      new Date(Date.now() - 60000),
    );
    assert.equal(usage.requestCount, 0);
  } finally {
    providerMode = 'failure';
  }
});
