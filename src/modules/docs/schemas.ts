import { z } from 'zod';

const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional();

export const adminDocSpaceListQuerySchema = z.object({
  search: optionalTrimmedString(255),
});

export const docSpaceIdParamsSchema = z.object({
  spaceId: z.string().uuid(),
});

export const docPageIdParamsSchema = z.object({
  pageId: z.string().uuid(),
});

export const publicDocSpaceSlugParamsSchema = z.object({
  spaceSlug: z.string().trim().min(1).max(160),
});

export const publicDocPageQuerySchema = z.object({
  path: optionalTrimmedString(500),
});

export const upsertDocSpaceSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  iconUrl: z.string().trim().url().optional().or(z.literal('')),
  type: z.enum(['product', 'app', 'internal']).default('product'),
  appId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(['active', 'hidden', 'archived']).default('active'),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const upsertDocPageSchema = z.object({
  spaceId: z.string().uuid(),
  parentId: z.string().uuid().optional().or(z.literal('')),
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  content: z.string().trim().max(200000).default(''),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  publishedAt: z.string().datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
