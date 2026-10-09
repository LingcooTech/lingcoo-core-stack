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
