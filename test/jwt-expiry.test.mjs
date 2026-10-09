import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

test('cached JWT without iat is rejected after its exp deadline', async (t) => {
  const app = Fastify();
  await app.register(jwt, {
    secret: 'isolated-expiry-regression-only',
    verify: { cache: true, cacheTTL: 60_000 },
  });
  await app.ready();
  try {
    const now = 1_700_000_000_000;
    t.mock.timers.enable({ apis: ['Date'], now });
    const token = app.jwt.sign({ sub: 'fixture', exp: now / 1000 + 1 }, { noTimestamp: true });
    assert.equal(app.jwt.decode(token).iat, undefined);
    assert.equal(app.jwt.verify(token).sub, 'fixture');
    t.mock.timers.tick(1_001);
    assert.throws(() => app.jwt.verify(token), { code: 'FAST_JWT_EXPIRED' });
  } finally {
    t.mock.timers.reset();
    await app.close();
  }
});
