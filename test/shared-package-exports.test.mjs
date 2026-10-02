import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
test('CommonJS and ESM consume real shared package exports', async () => {
  const cjs = require('@lingcoo/contracts');
  const esm = await import('@lingcoo/contracts');
  assert(cjs.loginSchema);
  assert(esm.loginSchema);
  assert(require('@lingcoo/contracts/models').ContentItemSchema);
  assert((await import('@lingcoo/contracts/models')).ContentItemSchema);
  assert.equal(typeof require('@lingcoo/api-client').createApiClient, 'function');
  assert.equal(typeof (await import('@lingcoo/api-client')).createApiClient, 'function');
});
