import { z } from 'zod';
const name = z.string().trim().min(1).max(200);
export const storageSettingsSchema = z.object({
  region: z.string().trim().max(120).default(''),
  endpoint: z
    .union([
      z.literal(''),
      z.url().refine((v) => new URL(v).protocol === 'https:', '请使用 HTTPS 服务地址'),
    ])
    .default(''),
  bucket: z.string().trim().max(255).default(''),
  accessKey: z.string().trim().max(1000).optional(),
  secretKey: z.string().trim().max(2000).optional(),
  forcePathStyle: z.boolean().default(false),
  defaultPrefix: z
    .string()
    .trim()
    .max(200)
    .regex(/^(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/)
    .default('stack/assets'),
  publicBaseUrl: z
    .union([z.literal(''), z.url().refine((v) => new URL(v).protocol === 'https:')])
    .default(''),
});
export const storageSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.enum(['database', 'env', 'legacy', 'none']),
  values: storageSettingsSchema.omit({ accessKey: true, secretKey: true }),
  secrets: z.object({
    accessKey: z.object({ configured: z.boolean() }),
    secretKey: z.object({ configured: z.boolean() }),
  }),
});
export const assetFolderSchema = z.object({
  id: z.uuid(),
  name: name,
  count: z.number().int().nonnegative(),
});
export const assetVersionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  originalName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  checksumSha256: z.string(),
  status: z.enum(['pending', 'ready', 'deletion_pending', 'deleted', 'failed']),
  createdAt: z.string(),
});
export const assetSummarySchema = z.object({
  id: z.uuid(),
  folderId: z.uuid().nullable(),
  displayName: name,
  altText: z.string().nullable(),
  visibility: z.enum(['public', 'private']),
  mediaKind: z.enum(['image', 'document', 'text']),
  revision: z.number().int().positive(),
  currentVersion: z.number().int().nonnegative(),
  originalName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  checksumSha256: z.string(),
  referenceCount: z.number().int().nonnegative(),
  contentUrl: z.string(),
  publicUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const assetDetailSchema = assetSummarySchema.extend({
  versions: z.array(assetVersionSchema),
});
export const assetListSchema = z.object({
  items: z.array(assetSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number(),
  pageSize: z.number(),
});
export const assetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  folderId: z.union([z.uuid(), z.literal('root')]).optional(),
  mediaKind: z.enum(['image', 'document', 'text']).optional(),
});
export const assetUploadSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (v) =>
        !v.includes('/') &&
        !v.includes('\\') &&
        [...v].every((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127),
    ),
  contentType: z.string().max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  folderId: z.uuid().nullable().optional(),
  visibility: z.enum(['public', 'private']).default('private'),
  displayName: name.optional(),
});
export const assetUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  displayName: name,
  altText: z.string().trim().max(500).nullable(),
  visibility: z.enum(['public', 'private']),
  folderId: z.uuid().nullable(),
});
export const assetRevisionSchema = z.object({ expectedRevision: z.number().int().positive() });
export const storageResponseContracts = [
  {
    method: 'GET',
    path: '/v1/admin/system-settings/storage',
    schema: storageSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/storage',
    schema: storageSettingsOverviewSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/storage/test',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'GET',
    path: '/v1/admin/storage/folders',
    schema: z.object({ items: z.array(assetFolderSchema) }),
  },
  { method: 'POST', path: '/v1/admin/storage/folders', schema: assetFolderSchema },
  { method: 'PATCH', path: '/v1/admin/storage/folders/:param', schema: assetFolderSchema },
  {
    method: 'DELETE',
    path: '/v1/admin/storage/folders/:param',
    schema: z.object({ ok: z.literal(true) }),
  },
  { method: 'GET', path: '/v1/admin/storage/assets', schema: assetListSchema },
  { method: 'GET', path: '/v1/admin/storage/assets/:param', schema: assetDetailSchema },
  {
    method: 'POST',
    path: '/v1/admin/storage/uploads',
    schema: z.object({ assetId: z.uuid(), objectId: z.uuid() }),
  },
  {
    method: 'POST',
    path: '/v1/admin/storage/assets/:param/replacements',
    schema: z.object({ assetId: z.uuid(), objectId: z.uuid() }),
  },
  { method: 'PUT', path: '/v1/admin/storage/uploads/:param/content', schema: assetDetailSchema },
  { method: 'PATCH', path: '/v1/admin/storage/assets/:param', schema: assetDetailSchema },
  {
    method: 'DELETE',
    path: '/v1/admin/storage/assets/:param',
    schema: z.object({ ok: z.literal(true) }),
  },
] as const;
export type StorageSettings = z.output<typeof storageSettingsSchema>;
export type StorageSettingsOverview = z.output<typeof storageSettingsOverviewSchema>;
export type AssetSummary = z.output<typeof assetSummarySchema>;
export type AssetDetail = z.output<typeof assetDetailSchema>;
export type AssetFolder = z.output<typeof assetFolderSchema>;
