import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
export const storageFolders = pgTable(
  'storage_folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
  },
  (t) => [uniqueIndex('storage_folders_name_uidx').on(t.name)],
);
export const storageAssets = pgTable(
  'storage_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    folderId: uuid('folder_id').references(() => storageFolders.id, { onDelete: 'set null' }),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    altText: text('alt_text'),
    visibility: varchar('visibility', { length: 20 }).notNull().default('private'),
    mediaKind: varchar('media_kind', { length: 20 }).notNull(),
    revision: integer('revision').notNull().default(1),
    currentVersion: integer('current_version').notNull().default(0),
    createdBy: uuid('created_by').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('storage_assets_visibility_check', sql`${t.visibility} in ('public', 'private')`),
    check('storage_assets_kind_check', sql`${t.mediaKind} in ('image', 'document', 'text')`),
    check('storage_assets_version_check', sql`${t.revision} > 0 and ${t.currentVersion} >= 0`),
    index('storage_assets_folder_idx').on(t.folderId),
    index('storage_assets_created_idx').on(t.createdAt),
  ],
);
export const storageObjects = pgTable(
  'storage_objects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => storageAssets.id),
    version: integer('version').notNull(),
    objectKey: text('object_key').notNull(),
    bucket: varchar('bucket', { length: 255 }).notNull(),
    endpoint: text('endpoint').notNull(),
    region: text('region').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 120 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull().default(''),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    createdBy: uuid('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'storage_objects_status_check',
      sql`${t.status} in ('pending', 'writing', 'ready', 'deletion_pending', 'deleted', 'failed')`,
    ),
    check(
      'storage_objects_size_check',
      sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 26214400 and ${t.version} > 0`,
    ),
    uniqueIndex('storage_objects_asset_version_uidx').on(t.assetId, t.version),
    uniqueIndex('storage_objects_key_uidx').on(t.bucket, t.endpoint, t.objectKey),
    index('storage_objects_cleanup_idx').on(t.status, t.expiresAt),
  ],
);
export const storageReferences = pgTable(
  'storage_references',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => storageAssets.id),
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.ownerType, t.ownerId] })],
);
