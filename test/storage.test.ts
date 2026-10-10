import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { storageSettingsSchema, assetUploadSchema } from '@lingcoo/contracts';
import { inspectAssetContent } from '../src/modules/storage/content-inspection';
import { S3StorageProvider } from '../src/modules/storage/s3-provider';
test('upload inspection rejects disguised active content, invalid UTF-8 and mismatched sizes', async () => {
  const base = { filename: 'fixture.png', declaredContentType: 'image/png', maxBytes: 1024 };
  const body = Buffer.from('<svg onload="alert(1)"></svg>');
  await assert.rejects(inspectAssetContent({ ...base, body, declaredSizeBytes: body.length }));
  await assert.rejects(
    inspectAssetContent({
      ...base,
      body: Buffer.from([0xff, 0xfe]),
      filename: 'a.txt',
      declaredContentType: 'text/plain',
      declaredSizeBytes: 2,
    }),
  );
  await assert.rejects(
    inspectAssetContent({ ...base, body: Buffer.from('a'), declaredSizeBytes: 2 }),
  );
  const valid = await inspectAssetContent({
    body: Buffer.from('hello'),
    filename: 'a.txt',
    declaredContentType: 'text/plain',
    declaredSizeBytes: 5,
    maxBytes: 1024,
  });
  assert.equal(valid.checksumSha256, createHash('sha256').update('hello').digest('hex'));
  assert.equal(valid.mediaKind, 'text');
});
test('S3 configuration rejects plaintext endpoints and upload filenames cannot contain paths', () => {
  assert.equal(storageSettingsSchema.safeParse({ endpoint: 'http://example.com' }).success, false);
  assert.equal(
    assetUploadSchema.safeParse({
      filename: '../file.txt',
      contentType: 'text/plain',
      sizeBytes: 2,
    }).success,
    false,
  );
});
test('S3 SDK signs and transfers the actual file bytes with an explicit integrity checksum', async () => {
  const bytes = Buffer.from('storage wire test');
  const requests: {
    method?: string;
    url?: string;
    body: Buffer;
    checksum?: string;
    authorization?: string;
  }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks),
      checksum: String(req.headers['content-md5'] || ''),
      authorization: String(req.headers.authorization || ''),
    });
    if (req.method === 'GET') {
      res.setHeader('content-type', 'text/plain');
      res.end(bytes);
    } else res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  const provider = new S3StorageProvider({
    provider: 's3',
    region: 'cn-east-1',
    endpoint: `http://127.0.0.1:${address.port}`,
    bucket: 'fixture-bucket',
    forcePathStyle: true,
    accessKey: 'test-ak',
    secretKey: 'test-sk',
    defaultPrefix: 'assets',
    publicBaseUrl: '',
  });
  try {
    await provider.test();
    await provider.write('assets/a.txt', bytes, 'text/plain');
    const result = await provider.read('assets/a.txt');
    const received: Buffer[] = [];
    for await (const chunk of result.Body!) received.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(received), bytes);
    await provider.delete('assets/a.txt');
    const put = requests.find((r) => r.method === 'PUT')!;
    assert.deepEqual(put.body, bytes);
    assert.equal(put.checksum, createHash('md5').update(bytes).digest('base64'));
    assert.match(put.authorization!, /AWS4-HMAC-SHA256/);
    assert.match(put.url!, /fixture-bucket\/assets\/a.txt/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});

test('local storage persists bytes, rejects traversal and symlinks, and deletes idempotently', async () => {
  const { mkdtemp, rm, symlink, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { LocalStorageProvider } = await import('../src/modules/storage/local-provider');
  const root = await mkdtemp(join(tmpdir(), 'stack-storage-local-'));
  const outside = await mkdtemp(join(tmpdir(), 'stack-storage-outside-'));
  try {
    const first = new LocalStorageProvider(root);
    await first.test();
    await first.write('assets/a/v1/object', Buffer.from('persistent'));
    const second = new LocalStorageProvider(root);
    const chunks: Buffer[] = [];
    for await (const chunk of (await second.read('assets/a/v1/object')).Body)
      chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), 'persistent');
    await assert.rejects(first.write('../escape', Buffer.from('bad')));
    await symlink(outside, join(root, 'linked'));
    await assert.rejects(first.write('linked/subdirectory/object', Buffer.from('bad')));
    assert.deepEqual(await readdir(outside), []);
    await symlink(join(outside, 'missing'), join(root, 'linked-file'));
    await assert.rejects(first.read('linked-file'));
    await second.delete('assets/a/v1/object');
    await second.delete('assets/a/v1/object');
    await assert.rejects(first.read('assets/a/v1/object'));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
