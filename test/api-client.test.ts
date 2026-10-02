import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError, ProtocolError, NetworkError } from '@lingcoo/api-client';
import { meResponseSchema } from '@lingcoo/contracts';
test('browser client includes cookies and supplies CSRF only for unsafe requests', async () => {
  const calls: RequestInit[] = [];
  const request = createApiClient({
    credentials: 'include',
    getCsrfToken: () => 'session-bound-csrf',
    fetch: async (_url, init) => {
      calls.push(init!);
      return Response.json({ ok: true });
    },
  });
  await request('/fixture');
  await request('/fixture', { method: 'POST', body: '{}' });
  assert.equal(calls[0].credentials, 'include');
  assert.equal(new Headers(calls[0].headers).has('x-csrf-token'), false);
  assert.equal(new Headers(calls[1].headers).get('x-csrf-token'), 'session-bound-csrf');
  assert.equal(new Headers(calls[1].headers).has('authorization'), false);
});
test('API client rejects invalid JSON and unexpected successful responses with a request identifier', async () => {
  for (const response of [
    new Response('proxy HTML', { headers: { 'x-request-id': 'fixture' } }),
    Response.json({ authenticated: true, user: {} }, { headers: { 'x-request-id': 'fixture' } }),
  ]) {
    const request = createApiClient({ fetch: async () => response });
    await assert.rejects(
      request('/v1/me', { schema: meResponseSchema }),
      (error) => error instanceof ProtocolError && error.requestId === 'fixture',
    );
  }
});
test('API client preserves legacy errors and separates network failure from cancellation', async () => {
  const request = createApiClient({
    fetch: async () =>
      Response.json(
        { error: 'Forbidden', message: 'Permission denied' },
        { status: 403, headers: { 'x-request-id': 'fixture' } },
      ),
  });
  await assert.rejects(
    request('/fixture'),
    (error) => error instanceof ApiError && error.status === 403 && error.requestId === 'fixture',
  );
  await assert.rejects(
    createApiClient({
      fetch: async () => {
        throw new Error('fixture-secret');
      },
    })('/fixture'),
    NetworkError,
  );
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(
    createApiClient({
      fetch: async () => {
        throw aborted;
      },
    })('/fixture', { signal: controller.signal }),
    (error) => error === aborted,
  );
});
