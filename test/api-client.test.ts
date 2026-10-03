import { requireResult } from '../src/db/required-result';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError, ProtocolError, NetworkError } from '@lingcoo/api-client';
import { z } from 'zod';
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
  await request('/fixture', { schema: z.object({ ok: z.boolean() }) });
  await request('/fixture', { method: 'POST', body: '{}', schema: z.object({ ok: z.boolean() }) });
  assert.equal(requireResult(calls[0], 'fixture array element').credentials, 'include');
  assert.equal(
    new Headers(requireResult(calls[0], 'fixture array element').headers).has('x-csrf-token'),
    false,
  );
  assert.equal(
    new Headers(requireResult(calls[1], 'fixture array element').headers).get('x-csrf-token'),
    'session-bound-csrf',
  );
  assert.equal(
    new Headers(requireResult(calls[1], 'fixture array element').headers).has('authorization'),
    false,
  );
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

test('explicit schemas infer and return validated output, including transformations', async () => {
  const request = createApiClient({
    fetch: async () => Response.json({ count: '2', untrustedExtra: 'ignored' }),
  });
  const result = await request('/fixture', {
    schema: z.object({ count: z.coerce.number().int().positive() }),
  });
  assert.equal(result.count, 2);
  assert.deepEqual(result, { count: 2 });
});

test('endpoint requests infer response output and reject path mismatches before fetching', async () => {
  let calls = 0;
  const request = createApiClient({
    fetch: async (_url, init) => {
      calls++;
      assert.equal(init?.method, 'GET');
      return Response.json({ hasAdmin: true, ignored: 'extra' });
    },
  });
  const result = await request.endpoint(
    'GET /v1/admin/bootstrap-status',
    '/v1/admin/bootstrap-status?probe=1',
  );
  const hasAdmin: boolean = result.hasAdmin;
  assert.equal(hasAdmin, true);
  assert.deepEqual(result, { hasAdmin: true });
  await assert.rejects(
    request.endpoint('GET /v1/admin/bootstrap-status', '/v1/admin/users'),
    /does not match endpoint/,
  );
  await assert.rejects(
    request.endpoint('GET /v1/admin/orders/:param', '/v1/admin/orders/'),
    /does not match endpoint/,
  );
  assert.equal(calls, 1);
});

test('endpoint requests enforce the registered parser and method for writes', async () => {
  const request = createApiClient({
    fetch: async (_url, init) => {
      assert.equal(init?.method, 'POST');
      return Response.json({ changed: 'not-a-boolean' });
    },
  });
  await assert.rejects(
    request.endpoint('POST /v1/me/change-password', '/v1/me/change-password', { body: '{}' }),
    ProtocolError,
  );
});

// Compile-time regression: these failures must stay failures as the SDK evolves.
async function endpointTypeChecks() {
  const request = createApiClient();
  const result = await request.endpoint(
    'GET /v1/admin/bootstrap-status',
    '/v1/admin/bootstrap-status',
  );
  // @ts-expect-error Return values come from the registered parser, not caller type assertions.
  const invalid: string = result.hasAdmin;
  void invalid;
  // @ts-expect-error Unknown endpoint identities are rejected.
  await request.endpoint('GET /v1/unregistered', '/v1/unregistered');
  await request.endpoint('GET /v1/admin/bootstrap-status', '/v1/admin/bootstrap-status', {
    // @ts-expect-error Method is part of endpoint identity and cannot be overridden.
    method: 'POST',
  });
  // @ts-expect-error Low-level requests cannot assert an arbitrary response type.
  await request<{ anything: string }>('/fixture');
}
void endpointTypeChecks;
