import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnv } from '../src/lib/env';
import { encryptJson, decryptJson } from '../src/lib/settings-crypto';
import { safeErrorResponse } from '../src/http/safe-errors';
import { verifyPassword } from '../src/lib/security';

test('unexpected server errors expose neither raw messages nor details', () => {
  const response = safeErrorResponse(
    Object.assign(new Error('password=do-not-leak'), {
      statusCode: 500,
      details: { token: 'do-not-leak' },
    }),
    'request-1',
  );
  assert.equal(response.status, 500);
  assert.equal(response.body.requestId, 'request-1');
  assert(!JSON.stringify(response).includes('do-not-leak'));
});
test('production rejects missing or shared settings keys and development JWT secrets', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://test',
    REDIS_URL: 'redis://test',
    JWT_SECRET: 'strong-signing-key-with-at-least-32-characters',
  };
  assert.throws(() => validateEnv(base), /independent/);
  assert.throws(
    () => validateEnv({ ...base, SETTINGS_ENCRYPTION_KEY: base.JWT_SECRET }),
    /independent/,
  );
  assert.throws(
    () =>
      validateEnv({
        ...base,
        SETTINGS_ENCRYPTION_KEY: 'independent-settings-key-with-32-characters',
        JWT_SECRET: 'change-this-to-a-long-random-string',
      }),
    /strong JWT/,
  );
});
test('versioned encryption retains old keys without changing the new write key', () => {
  const old = 'old-encryption-key-with-at-least-32-characters';
  const current = 'new-encryption-key-with-at-least-32-characters';
  const keys = { currentKeyId: 'new', keys: { old, new: current }, legacySecrets: [old] };
  const legacy = encryptJson({ secret: 'fixture' }, old);
  assert.deepEqual(decryptJson(legacy, keys), { secret: 'fixture' });
  const encrypted = encryptJson({ secret: 'fixture' }, keys);
  assert.equal(encrypted.keyId, 'new');
  assert.equal(encrypted.version, 2);
  assert.deepEqual(decryptJson(encrypted, keys), { secret: 'fixture' });
  assert.throws(() => decryptJson(legacy, { ...keys, legacySecrets: [] }));
  assert.throws(() =>
    decryptJson(encrypted, { currentKeyId: 'old', keys: { old }, legacySecrets: [old] }),
  );
});
test('malformed stored password hashes fail safely', () => {
  assert.equal(verifyPassword('fixture', 'scrypt$malformed$12'), false);
});
