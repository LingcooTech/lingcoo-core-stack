import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationResponse } from './server.mjs';
test('entry and health are available, unknown routes fail', () => {
  assert.equal(applicationResponse('/health').body.status, 'ok');
  assert.equal(applicationResponse('/').status, 200);
  assert.equal(applicationResponse('/missing').status, 404);
});
