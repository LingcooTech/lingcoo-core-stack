import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { and, eq, isNull, sql, desc, or, lt, inArray } from 'drizzle-orm';
import type {
  assetQuerySchema,
  assetUploadSchema,
  assetUpdateSchema,
  StorageSettings,
  AssetDetail,
  AssetSummary,
} from '@lingcoo/contracts';
import type { z } from 'zod';
import { storageAssets, storageFolders, storageObjects, storageReferences } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { acquireTransactionLock } from '../../db/locks';
import { StorageSettingsService } from '../settings/public';
import { AuditLogService } from '../audit/public';
import { inspectAssetContent, assertDeclaredAssetType } from './content-inspection';
import { S3StorageProvider } from './s3-provider';
type ObjectRow = typeof storageObjects.$inferSelect;
export type StorageProviderFactory = (config: StorageSettings) => {
  test: () => Promise<unknown>;
  write: (key: string, body: Buffer, contentType: string) => Promise<unknown>;
  read: (key: string) => Promise<{ Body?: Readable }>;
  delete: (key: string) => Promise<unknown>;
};
export class StorageService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly provider: StorageProviderFactory = (c) => new S3StorageProvider(c),
  ) {}
  private async lock(tx: DbExecutor) {
    await acquireTransactionLock(tx, 'storage:references');
  }
  private settings(db = this.db) {
    return new StorageSettingsService(db, this.env);
  }
  async config(db = this.db) {
    const { value, source } = await this.settings(db).runtime();
    if (
      source === 'legacy' ||
      !value.region ||
      !value.bucket ||
      !value.accessKey ||
      !value.secretKey
    )
      throw httpError(409, '请先完成 S3 存储设置与连接测试');
    return value;
  }
  async saveSettings(input: StorageSettings, userId: string) {
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const next = await this.settings(tx).draft(input);
      const [object] = await tx
        .select()
        .from(storageObjects)
        .where(
          and(
            neDeleted(),
            or(
              sql`${storageObjects.bucket} <> ${next.bucket}`,
              sql`${storageObjects.endpoint} <> ${next.endpoint}`,
              sql`${storageObjects.region} <> ${next.region}`,
            ),
          ),
        )
        .limit(1);
      if (object)
        throw httpError(
          409,
          '已有文件仍使用当前存储空间，请先迁移文件；可直接更新密钥、上传目录和 CDN 域名',
        );
      return this.settings(tx).save(input, userId);
    });
  }
  async testSettings(input: StorageSettings) {
    const config = await this.settings().draft(input);
    if (!config.region || !config.bucket || !config.accessKey || !config.secretKey)
      throw httpError(422, '请填写区域、S3 空间名称以及成对的访问密钥');
    await this.provider(config).test();
    return { ok: true as const };
  }
  async folders() {
    const rows = await this.db
      .select({
        id: storageFolders.id,
        name: storageFolders.name,
        count: sql<number>`count(${storageAssets.id})::int`,
      })
      .from(storageFolders)
      .leftJoin(
        storageAssets,
        and(
          eq(storageAssets.folderId, storageFolders.id),
          isNull(storageAssets.deletedAt),
          sql`${storageAssets.currentVersion} > 0`,
        ),
      )
      .groupBy(storageFolders.id)
      .orderBy(storageFolders.name);
    return { items: rows };
  }
  async saveFolder(id: string | null, name: string) {
    const [row] = id
      ? await this.db
          .update(storageFolders)
          .set({ name })
          .where(eq(storageFolders.id, id))
          .returning()
      : await this.db.insert(storageFolders).values({ name }).returning();
    if (!row) throw httpError(404, '文件夹不存在');
    return { ...row, count: (await this.folders()).items.find((f) => f.id === row.id)?.count ?? 0 };
  }
  async deleteFolder(id: string) {
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [row] = await tx
        .select()
        .from(storageFolders)
        .where(eq(storageFolders.id, id))
        .for('update');
      if (!row) throw httpError(404, '文件夹不存在');
      const [asset] = await tx
        .select({ id: storageAssets.id })
        .from(storageAssets)
        .where(and(eq(storageAssets.folderId, id), isNull(storageAssets.deletedAt)))
        .limit(1);
      if (asset) throw httpError(409, '请先移走文件夹中的素材，再删除文件夹');
      await tx.delete(storageFolders).where(eq(storageFolders.id, id));
      return { ok: true as const };
    });
  }
  private async view(
    rows: (typeof storageAssets.$inferSelect)[],
    db = this.db,
  ): Promise<AssetSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((a) => a.id);
    const objects = await db
      .select()
      .from(storageObjects)
      .where(inArray(storageObjects.assetId, ids));
    const refs = await db
      .select({ id: storageReferences.assetId, count: sql<number>`count(*)::int` })
      .from(storageReferences)
      .where(inArray(storageReferences.assetId, ids))
      .groupBy(storageReferences.assetId);
    return rows.map((a) => {
      const o = objects.find((o) => o.assetId === a.id && o.version === a.currentVersion);
      const url = `${this.env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/v1/assets/${a.id}/content`;
      return {
        id: a.id,
        folderId: a.folderId,
        displayName: a.displayName,
        altText: a.altText,
        visibility: a.visibility as 'public' | 'private',
        mediaKind: a.mediaKind as 'image' | 'document' | 'text',
        revision: a.revision,
        currentVersion: a.currentVersion,
        originalName: o?.originalName ?? '',
        contentType: o?.contentType ?? '',
        sizeBytes: o?.sizeBytes ?? 0,
        checksumSha256: o?.checksumSha256 ?? '',
        referenceCount: refs.find((r) => r.id === a.id)?.count ?? 0,
        contentUrl: `/v1/admin/storage/assets/${a.id}/content`,
        publicUrl: a.visibility === 'public' ? url : null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      };
    });
  }
  async list(input: z.output<typeof assetQuerySchema>) {
    const where = and(
      isNull(storageAssets.deletedAt),
      sql`${storageAssets.currentVersion} > 0`,
      input.folderId === 'root'
        ? isNull(storageAssets.folderId)
        : input.folderId
          ? eq(storageAssets.folderId, input.folderId)
          : undefined,
      input.mediaKind ? eq(storageAssets.mediaKind, input.mediaKind) : undefined,
      input.search
        ? sql`(${storageAssets.displayName} ilike ${'%' + escapeLike(input.search) + '%'} or exists(select 1 from storage_objects o where o.asset_id = ${storageAssets.id} and o.version = ${storageAssets.currentVersion} and o.original_name ilike ${'%' + escapeLike(input.search) + '%'}))`
        : undefined,
    );
    const rows = await this.db
      .select()
      .from(storageAssets)
      .where(where)
      .orderBy(desc(storageAssets.createdAt), desc(storageAssets.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(storageAssets)
      .where(where);
    return {
      items: await this.view(rows),
      total: count?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async detail(id: string, db = this.db): Promise<AssetDetail> {
    const [row] = await db
      .select()
      .from(storageAssets)
      .where(and(eq(storageAssets.id, id), isNull(storageAssets.deletedAt)));
    if (!row) throw httpError(404, '素材不存在');
    const [summary] = await this.view([row], db);
    if (!summary) throw httpError(404, '素材不存在');
    const objects = await db
      .select()
      .from(storageObjects)
      .where(eq(storageObjects.assetId, id))
      .orderBy(desc(storageObjects.version));
    return {
      ...summary,
      versions: objects.map((o) => ({
        id: o.id,
        version: o.version,
        originalName: o.originalName,
        contentType: o.contentType,
        sizeBytes: o.sizeBytes,
        checksumSha256: o.checksumSha256,
        status: (o.status === 'writing'
          ? 'pending'
          : o.status) as AssetDetail['versions'][number]['status'],
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }
  async authorize(
    input: z.output<typeof assetUploadSchema>,
    userId: string,
    replacement?: { id: string; expectedRevision: number },
  ) {
    const mediaKind = assertDeclaredAssetType(input.contentType);
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const config = await this.config(tx);
      let asset;
      if (replacement) {
        [asset] = await tx
          .select()
          .from(storageAssets)
          .where(and(eq(storageAssets.id, replacement.id), isNull(storageAssets.deletedAt)))
          .for('update');
        if (!asset) throw httpError(404, '素材不存在');
        if (asset.revision !== replacement.expectedRevision)
          throw httpError(409, '素材已发生变化，请刷新后重试');
        if (asset.mediaKind !== mediaKind) throw httpError(422, '替换文件必须与原素材类型一致');
      } else {
        if (
          input.folderId &&
          !(await tx.select().from(storageFolders).where(eq(storageFolders.id, input.folderId)))[0]
        )
          throw httpError(404, '文件夹不存在');
        [asset] = await tx
          .insert(storageAssets)
          .values({
            displayName: input.displayName || input.filename,
            mediaKind,
            visibility: input.visibility,
            folderId: input.folderId,
            createdBy: userId,
          })
          .returning();
      }
      if (!asset) throw new Error('Asset insert failed');
      const [pending] = await tx
        .select()
        .from(storageObjects)
        .where(
          and(
            eq(storageObjects.assetId, asset.id),
            inArray(storageObjects.status, ['pending', 'writing']),
            sql`${storageObjects.expiresAt} > now()`,
          ),
        );
      if (pending) throw httpError(409, '该素材已有待完成的上传，请稍后重试');
      const [latest] = await tx
        .select()
        .from(storageObjects)
        .where(eq(storageObjects.assetId, asset.id))
        .orderBy(desc(storageObjects.version))
        .limit(1);
      const objectId = randomUUID(),
        version = (latest?.version ?? 0) + 1;
      await tx.insert(storageObjects).values({
        id: objectId,
        assetId: asset.id,
        version,
        objectKey: `${config.defaultPrefix || 'assets'}/${asset.id}/v${version}/${objectId}`,
        bucket: config.bucket,
        endpoint: config.endpoint,
        region: config.region,
        createdBy: userId,
        originalName: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      });
      return { assetId: asset.id, objectId };
    });
  }
  async upload(id: string, body: Buffer, userId: string) {
    const [initial] = await this.db.select().from(storageObjects).where(eq(storageObjects.id, id));
    if (!initial) throw httpError(404, '上传授权不存在');
    if (initial.createdBy !== userId) throw httpError(403, '上传授权不属于当前账号');
    const facts = await inspectAssetContent({
      body,
      filename: initial.originalName,
      declaredContentType: initial.contentType,
      declaredSizeBytes: initial.sizeBytes,
      maxBytes: 25 * 1024 * 1024,
    });
    const completed = await this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [object] = await tx
        .select()
        .from(storageObjects)
        .where(eq(storageObjects.id, id))
        .for('update');
      const [asset] = await tx
        .select()
        .from(storageAssets)
        .where(eq(storageAssets.id, initial.assetId))
        .for('update');
      if (!object || !asset || asset.deletedAt) throw httpError(404, '素材不存在');
      if (object.status === 'ready') {
        if (object.checksumSha256 !== facts.checksumSha256)
          throw httpError(409, '该上传已完成，不能提交不同内容');
        return this.detail(asset.id, tx);
      }
      if (object.status !== 'pending' || object.expiresAt < new Date())
        throw httpError(409, '上传授权已过期、处理中或失效，请重新上传');
      await tx
        .update(storageObjects)
        .set({ status: 'writing', expiresAt: new Date(Date.now() + 120_000) })
        .where(eq(storageObjects.id, id));
      return null;
    });
    if (completed) return completed;
    // Do not hold business/reference locks during network I/O. An expired writing lease is cleaned by maintenance.
    const config = await this.configForObject(initial);
    try {
      await this.provider(config).write(initial.objectKey, body, facts.contentType);
    } catch (error) {
      await this.db
        .update(storageObjects)
        .set({ status: 'deletion_pending', expiresAt: new Date() })
        .where(and(eq(storageObjects.id, id), eq(storageObjects.status, 'writing')));
      throw error;
    }
    const result = await this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [object] = await tx
        .select()
        .from(storageObjects)
        .where(eq(storageObjects.id, id))
        .for('update');
      const [asset] = await tx
        .select()
        .from(storageAssets)
        .where(eq(storageAssets.id, initial.assetId))
        .for('update');
      if (
        !object ||
        !asset ||
        asset.deletedAt ||
        object.status !== 'writing' ||
        object.expiresAt < new Date()
      ) {
        if (object && object.status !== 'deleted')
          await tx
            .update(storageObjects)
            .set({ status: 'deletion_pending', expiresAt: new Date() })
            .where(eq(storageObjects.id, id));
        return null;
      }
      if (asset.currentVersion)
        await tx
          .update(storageObjects)
          .set({ status: 'deletion_pending', expiresAt: new Date(Date.now() + 3600_000) })
          .where(
            and(
              eq(storageObjects.assetId, asset.id),
              eq(storageObjects.version, asset.currentVersion),
            ),
          );
      await tx
        .update(storageObjects)
        .set({ ...facts, status: 'ready' })
        .where(eq(storageObjects.id, id));
      await tx
        .update(storageAssets)
        .set({
          currentVersion: object.version,
          revision: asset.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(storageAssets.id, asset.id));
      await this.audit(tx, userId, 'storage.uploaded', asset.id);
      return this.detail(asset.id, tx);
    });
    if (!result) throw httpError(409, '素材在上传期间发生变化，未使用的文件会自动清理');
    return result;
  }
  private async configForObject(object: ObjectRow, db = this.db) {
    const config = await this.config(db);
    if (
      config.bucket !== object.bucket ||
      config.endpoint !== object.endpoint ||
      config.region !== object.region
    )
      throw httpError(409, '存储配置与文件所在空间不一致');
    return config;
  }
  private async references(id: string, tx: DbExecutor) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(storageReferences)
      .where(eq(storageReferences.assetId, id));
    return row?.count ?? 0;
  }
  async update(id: string, input: z.output<typeof assetUpdateSchema>, userId: string) {
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [row] = await tx
        .select()
        .from(storageAssets)
        .where(and(eq(storageAssets.id, id), isNull(storageAssets.deletedAt)))
        .for('update');
      if (!row) throw httpError(404, '素材不存在');
      if (row.revision !== input.expectedRevision)
        throw httpError(409, '素材已发生变化，请刷新后重试');
      if (input.visibility === 'private' && (await this.references(id, tx)))
        throw httpError(409, '素材正在被业务引用，不能改为私有');
      if (
        input.folderId &&
        !(await tx.select().from(storageFolders).where(eq(storageFolders.id, input.folderId)))[0]
      )
        throw httpError(404, '文件夹不存在');
      const { expectedRevision, ...values } = input;
      await tx
        .update(storageAssets)
        .set({ ...values, revision: expectedRevision + 1, updatedAt: new Date() })
        .where(eq(storageAssets.id, id));
      await this.audit(tx, userId, 'storage.updated', id);
      return this.detail(id, tx);
    });
  }
  async delete(id: string, revision: number, userId: string) {
    return this.db.transaction(async (tx) => {
      await this.lock(tx);
      const [row] = await tx
        .select()
        .from(storageAssets)
        .where(and(eq(storageAssets.id, id), isNull(storageAssets.deletedAt)))
        .for('update');
      if (!row) throw httpError(404, '素材不存在');
      if (row.revision !== revision) throw httpError(409, '素材已发生变化，请刷新后重试');
      if (await this.references(id, tx)) throw httpError(409, '素材正在被业务引用，请先解除引用');
      await tx
        .update(storageAssets)
        .set({ deletedAt: new Date(), revision: revision + 1 })
        .where(eq(storageAssets.id, id));
      await tx
        .update(storageObjects)
        .set({
          status: 'deletion_pending',
          expiresAt: sql`case when ${storageObjects.status} = 'writing' then ${storageObjects.expiresAt} else now() end`,
        })
        .where(and(eq(storageObjects.assetId, id), neDeleted()));
      await this.audit(tx, userId, 'storage.deleted', id);
      return { ok: true as const };
    });
  }
  async content(id: string, isPublic: boolean) {
    const [asset] = await this.db
      .select()
      .from(storageAssets)
      .where(and(eq(storageAssets.id, id), isNull(storageAssets.deletedAt)));
    if (!asset || (isPublic && asset.visibility !== 'public')) throw httpError(404, '素材不存在');
    const [object] = await this.db
      .select()
      .from(storageObjects)
      .where(
        and(
          eq(storageObjects.assetId, id),
          eq(storageObjects.version, asset.currentVersion),
          eq(storageObjects.status, 'ready'),
        ),
      );
    if (!object) throw httpError(404, '素材内容不存在');
    const config = await this.configForObject(object);
    return { object, config, read: () => this.provider(config).read(object.objectKey) };
  }
  async cleanup() {
    const candidates = await this.db
      .select()
      .from(storageObjects)
      .where(
        and(
          inArray(storageObjects.status, ['pending', 'writing', 'deletion_pending']),
          lt(storageObjects.expiresAt, new Date()),
        ),
      )
      .orderBy(storageObjects.expiresAt)
      .limit(20);
    let deleted = 0;
    for (const object of candidates) {
      // Expired uploads cannot be resumed; object keys are immutable and DeleteObject is idempotent.
      // Remote deletion must not hold the lock used by business writes.
      await this.provider(await this.configForObject(object)).delete(object.objectKey);
      await this.db.transaction(async (tx) => {
        await this.lock(tx);
        await tx
          .update(storageObjects)
          .set({ status: 'deleted' })
          .where(
            and(
              eq(storageObjects.id, object.id),
              inArray(storageObjects.status, ['pending', 'writing', 'deletion_pending']),
              lt(storageObjects.expiresAt, new Date()),
            ),
          );
        const [asset] = await tx
          .select()
          .from(storageAssets)
          .where(eq(storageAssets.id, object.assetId));
        if (asset && asset.currentVersion === 0)
          await tx
            .update(storageAssets)
            .set({ deletedAt: new Date(), revision: asset.revision + 1 })
            .where(eq(storageAssets.id, asset.id));
      });
      deleted++;
    }
    return { deleted };
  }
  private async audit(tx: DbExecutor, userId: string, action: string, id: string) {
    await new AuditLogService(tx).record({
      actorType: 'user',
      actorUserId: userId,
      action,
      resourceType: 'storage_asset',
      resourceId: id,
      summary: 'Storage asset changed',
      meta: {},
    });
  }
}
function neDeleted() {
  return sql`${storageObjects.status} <> 'deleted'`;
}

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
