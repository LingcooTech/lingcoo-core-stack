import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { and, eq, sql } from 'drizzle-orm';
import { assetUploadSchema, assetQuerySchema, storageSettingsSchema } from '@lingcoo/contracts';
import { buildApp } from '../../src/app';
import { StorageService, type StorageProviderFactory } from '../../src/modules/storage/public';
import { StorageSettingsService } from '../../src/modules/settings/public';
import { apps, users, storageObjects, storageAssets, storageReferences } from '../../src/db/schema';
import { testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
const files = new Map<string, Buffer>();
let failDelete = false,
  delayWrite: (() => Promise<void>) | null = null;
const provider: StorageProviderFactory = () => ({
  test: async () => ({}),
  write: async (key, content) => {
    if (delayWrite) await delayWrite();
    files.set(key, Buffer.from(content));
    return {};
  },
  read: async (key) => ({ Body: Readable.from(files.get(key) ?? Buffer.alloc(0)) }),
  delete: async (key) => {
    if (failDelete) throw new Error('Simulated remote failure');
    files.delete(key);
    return {};
  },
});
const service = new StorageService(db, env, provider);
let userId: string, token: string, app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `storage-${randomUUID()}@example.test`, role: 'admin' })
    .returning();
  userId = user!.id;
  await new StorageSettingsService(db, env).save(
    storageSettingsSchema.parse({
      region: 'cn-east-1',
      endpoint: 'https://s3.cn-east-1.qiniucs.com',
      bucket: 'storage-fixture',
      accessKey: 'fixture-ak',
      secretKey: 'fixture-sk',
    }),
    userId,
  );
  app = await buildApp(env);
  app.services.StorageService = service;
  token = app.jwt.sign({ sub: userId, kind: 'user' });
});
after(async () => {
  await app.close();
  await pool.end();
});
async function uploaded(visibility: 'public' | 'private' = 'public') {
  const grant = await service.authorize(
    assetUploadSchema.parse({
      filename: 'fixture.txt',
      contentType: 'text/plain',
      sizeBytes: 5,
      visibility,
    }),
    userId,
  );
  return service.upload(grant.objectId, Buffer.from('hello'), userId);
}
test('private files are unreadable publicly; admin binary upload and JSON contracts work', async () => {
  const grant = await app.inject({
    method: 'POST',
    url: '/v1/admin/storage/uploads',
    headers: { authorization: `Bearer ${token}` },
    payload: { filename: 'http.txt', contentType: 'text/plain', sizeBytes: 5 },
  });
  assert.equal(grant.statusCode, 200, grant.body);
  const response = await app.inject({
    method: 'PUT',
    url: `/v1/admin/storage/uploads/${grant.json().objectId}/content`,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
    payload: Buffer.from('hello'),
  });
  assert.equal(response.statusCode, 200, response.body);
  const asset = response.json();
  assert.equal(asset.publicUrl, null);
  const publicRead = await app.inject({ method: 'GET', url: `/v1/assets/${asset.id}/content` });
  assert.equal(publicRead.statusCode, 404);
  const adminRead = await app.inject({
    method: 'GET',
    url: asset.contentUrl,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(adminRead.statusCode, 200);
  assert.equal(adminRead.body, 'hello');
  assert.equal(adminRead.headers['cache-control'], 'private, no-store');
  const noAuth = await app.inject({ method: 'GET', url: '/v1/admin/storage/assets' });
  assert.equal(noAuth.statusCode, 401);
  const config = await app.inject({
    method: 'GET',
    url: '/v1/admin/system-settings/storage',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(config.statusCode, 200);
  assert(!config.body.includes('fixture-sk'));
  assert(!config.body.includes('fixture-ak'));
});
test('asset replacement keeps stable URL, rejects stale edits and permits another authorized editor', async () => {
  const asset = await uploaded();
  const [editor] = await db
    .insert(users)
    .values({ email: `storage-editor-${randomUUID()}@example.test`, role: 'editor' })
    .returning();
  const grant = await service.authorize(
    assetUploadSchema.parse({
      filename: 'replacement.txt',
      contentType: 'text/plain',
      sizeBytes: 5,
    }),
    editor!.id,
    { id: asset.id, expectedRevision: asset.revision },
  );
  await assert.rejects(service.upload(grant.objectId, Buffer.from('world'), userId));
  const replacement = await service.upload(grant.objectId, Buffer.from('world'), editor!.id);
  assert.equal(replacement.publicUrl, asset.publicUrl);
  assert.equal(replacement.currentVersion, 2);
  await assert.rejects(
    service.update(
      asset.id,
      {
        displayName: 'stale',
        altText: null,
        visibility: 'public',
        folderId: null,
        expectedRevision: asset.revision,
      },
      userId,
    ),
  );
  const replay = await service.upload(grant.objectId, Buffer.from('world'), editor!.id);
  assert.equal(replay.currentVersion, 2);
  await assert.rejects(service.upload(grant.objectId, Buffer.from('hello'), editor!.id));
});
test('business references are atomic: referenced content cannot be deleted or made private', async () => {
  const asset = await uploaded();
  const [product] = await db
    .insert(apps)
    .values({
      code: `storage_${randomUUID()}`,
      name: 'Reference fixture',
      iconUrl: asset.publicUrl,
    })
    .returning();
  assert.equal((await service.detail(asset.id)).referenceCount, 1);
  await assert.rejects(service.delete(asset.id, asset.revision, userId));
  await assert.rejects(
    service.update(
      asset.id,
      {
        expectedRevision: asset.revision,
        displayName: 'Fixture',
        altText: null,
        folderId: null,
        visibility: 'private',
      },
      userId,
    ),
  );
  await db.update(apps).set({ iconUrl: null }).where(eq(apps.id, product!.id));
  await service.delete(asset.id, asset.revision, userId);
  await assert.rejects(
    db.update(apps).set({ iconUrl: asset.publicUrl }).where(eq(apps.id, product!.id)),
  );
  assert.equal(
    (await db.select().from(storageReferences).where(eq(storageReferences.assetId, asset.id)))
      .length,
    0,
  );
});
test('folder filtering, rename and empty-only deletion preserve file ownership', async () => {
  const folder = await service.saveFolder(null, `Folder ${randomUUID()}`);
  const grant = await service.authorize(
    assetUploadSchema.parse({
      filename: 'folder.txt',
      contentType: 'text/plain',
      sizeBytes: 5,
      folderId: folder.id,
    }),
    userId,
  );
  const asset = await service.upload(grant.objectId, Buffer.from('hello'), userId);
  assert.equal(
    (await service.list(assetQuerySchema.parse({ folderId: folder.id, search: 'folder' }))).total,
    1,
  );
  await assert.rejects(service.deleteFolder(folder.id));
  await service.saveFolder(folder.id, `Renamed ${randomUUID()}`);
  await service.update(
    asset.id,
    {
      expectedRevision: asset.revision,
      displayName: asset.displayName,
      altText: null,
      visibility: 'private',
      folderId: null,
    },
    userId,
  );
  await service.deleteFolder(folder.id);
});
test('remote write does not hold business locks and a deletion during upload is safely reconciled', async () => {
  const asset = await uploaded();
  const grant = await service.authorize(
    assetUploadSchema.parse({ filename: 'race.txt', contentType: 'text/plain', sizeBytes: 5 }),
    userId,
    { id: asset.id, expectedRevision: asset.revision },
  );
  let start!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
      start = r;
    }),
    blocked = new Promise<void>((r) => {
      release = r;
    });
  delayWrite = async () => {
    start();
    await blocked;
  };
  const writing = service.upload(grant.objectId, Buffer.from('world'), userId);
  await started;
  try {
    await service.delete(asset.id, asset.revision, userId);
    await service.cleanup(); // In-flight writes must keep their lease, even after logical deletion.
  } finally {
    release();
    delayWrite = null;
  }
  await assert.rejects(writing);
  await service.cleanup();
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, grant.objectId));
  assert.equal(object!.status, 'deleted');
  assert(!files.has(object!.objectKey));
});
test('cleanup retries failed deletion, expires abandoned uploads and refuses changing live storage location', async () => {
  const asset = await uploaded();
  await service.delete(asset.id, asset.revision, userId);
  failDelete = true;
  await assert.rejects(service.cleanup());
  failDelete = false;
  await service.cleanup();
  const grant = await service.authorize(
    assetUploadSchema.parse({ filename: 'abandoned.txt', contentType: 'text/plain', sizeBytes: 5 }),
    userId,
  );
  await db
    .update(storageObjects)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(storageObjects.id, grant.objectId));
  await service.cleanup();
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, grant.objectId));
  assert.equal(object!.status, 'deleted');
  const config = (await new StorageSettingsService(db, env).runtime()).value;
  await assert.rejects(service.saveSettings({ ...config, bucket: 'another-bucket' }, userId));
  assert.equal(
    (
      await db
        .select()
        .from(storageAssets)
        .where(and(eq(storageAssets.id, grant.assetId), sql`${storageAssets.currentVersion} = 0`))
    ).length,
    1,
  );
});
