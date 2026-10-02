import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareProductionEnv } from '../scripts/deploy/prepare-production-env.mjs';

test('missing settings key is initialized once without changing JWT or unrelated settings', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stack-env-'));
  const file = path.join(dir, '.env');
  const original =
    'JWT_SECRET=existing-fixture\nSETTINGS_ENCRYPTION_KEY=\nCORS_ORIGIN=https://fixture.test\n';
  writeFileSync(file, original);
  try {
    let key;
    assert.equal(
      prepareProductionEnv(file, {}, (env) => {
        key = env.SETTINGS_ENCRYPTION_KEY;
        assert.match(key, /^[0-9a-f]{64}$/);
      }),
      true,
    );
    const result = readFileSync(file, 'utf8');
    assert(result.includes('JWT_SECRET=existing-fixture\n'));
    assert(result.includes('CORS_ORIGIN=https://fixture.test\n'));
    assert(result.includes('ALLOW_LEGACY_SETTINGS_DECRYPTION=true\n'));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(
      prepareProductionEnv(file, { SETTINGS_ENCRYPTION_KEY: key }, () => {}),
      false,
    );
    assert.equal(readFileSync(file, 'utf8'), result);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('invalid production configuration cannot mutate the environment file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stack-env-'));
  const file = path.join(dir, '.env');
  writeFileSync(file, 'fixture-original\n');
  try {
    assert.throws(() =>
      prepareProductionEnv(file, {}, () => {
        throw new Error('invalid');
      }),
    );
    assert.equal(readFileSync(file, 'utf8'), 'fixture-original\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('existing keyring is preserved without generating an unrelated key', () => {
  assert.equal(
    prepareProductionEnv('/must-not-be-read', { SETTINGS_ENCRYPTION_KEYS: 'fixture' }, () => {}),
    false,
  );
});
