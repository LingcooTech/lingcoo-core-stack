import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { composeRuntimeFixture } from './fixtures/compose-runtime';

test('cold snapshot rejects untrusted archives and existing targets before Docker; failed backup restarts source', () => {
  const { job } = composeRuntimeFixture('docker.io/library/busybox@sha256:' + 'a'.repeat(64));
  const result = spawnSync('python3', ['test/compose-snapshot-unit.py'], {
    input: JSON.stringify(job),
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 4 tests/);
});
