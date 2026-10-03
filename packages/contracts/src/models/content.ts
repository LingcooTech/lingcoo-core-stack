import { z } from 'zod';
import { paginationSchema, AdminListParamsSchema } from './pagination.js';

export const ContentItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.union([z.string(), z.null()]),
  content: z.string(),
  coverUrl: z.union([z.string(), z.null()]),
  authorName: z.union([z.string(), z.null()]),
  sourceType: z.union([
    z.literal('manual'),
    z.literal('wordpress'),
    z.literal('notion'),
    z.literal('wechat'),
  ]),
  sourceId: z.union([z.string(), z.null()]),
  sourceUrl: z.union([z.string(), z.null()]),
  status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]),
  publishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  importedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type ContentItem = z.infer<typeof ContentItemSchema>;

export const ContentListResponseSchema = paginationSchema(ContentItemSchema);

export type ContentListResponse = z.infer<typeof ContentListResponseSchema>;

export const AdminContentListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]).optional(),
    sourceType: z
      .union([
        z.literal('manual'),
        z.literal('wordpress'),
        z.literal('notion'),
        z.literal('wechat'),
      ])
      .optional(),
  }),
);

export type AdminContentListParams = z.infer<typeof AdminContentListParamsSchema>;
