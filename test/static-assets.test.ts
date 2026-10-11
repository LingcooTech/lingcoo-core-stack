import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { isStaticAssetRequest, staticAssetPrefix } from '../src/http/static-assets';

test('static chunks do not consume API quota, and asset-looking API requests remain limited', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stack-static-rate-'));
  const app = Fastify();
  try {
    await writeFile(join(root, 'index-a1b2c3.js'), 'export const ready = true;');
    await app.register(rateLimit, {
      max: 2,
      timeWindow: '1 minute',
      allowList: isStaticAssetRequest,
    });
    await app.register(fastifyStatic, {
      root,
      prefix: staticAssetPrefix,
      immutable: true,
      maxAge: '1y',
    });
    app.get('/v1/probe', async () => ({ ok: true }));
    app.post('/assets/*', async () => ({ ok: true }));
    for (let i = 0; i < 10; i++) {
      const asset = await app.inject('/assets/index-a1b2c3.js');
      assert.equal(asset.statusCode, 200);
      assert.match(asset.headers['cache-control'] as string, /max-age=31536000/);
      assert.match(asset.headers['cache-control'] as string, /immutable/);
    }
    assert.equal((await app.inject('/v1/probe')).statusCode, 200);
    assert.equal((await app.inject('/v1/probe')).statusCode, 200);
    assert.equal((await app.inject('/v1/probe?next=/assets/index-a1b2c3.js')).statusCode, 429);
    assert.equal((await app.inject({ method: 'POST', url: '/assets/write' })).statusCode, 429);
    assert.equal((await app.inject('/assets/index-a1b2c3.js')).statusCode, 200);
    assert.equal(
      (await app.inject({ method: 'HEAD', url: '/assets/index-a1b2c3.js' })).statusCode,
      200,
    );
    assert.equal((await app.inject('/v1/probe')).statusCode, 429);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
