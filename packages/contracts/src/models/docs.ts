import { z } from 'zod';

export interface DocPageTreeNode {
  id: string;
  parentId: string | null;
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
  children: DocPageTreeNode[];
}

export const DocSpaceSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.null()]),
  iconUrl: z.union([z.string(), z.null()]),
  type: z.union([z.literal('product'), z.literal('app'), z.literal('internal')]),
  appId: z.union([z.string(), z.null()]),
  sortOrder: z.number(),
  status: z.union([z.literal('active'), z.literal('hidden'), z.literal('archived')]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type DocSpace = z.infer<typeof DocSpaceSchema>;

export const DocPageSchema = z.object({
  id: z.uuid(),
  spaceId: z.string(),
  parentId: z.union([z.string(), z.null()]),
  slug: z.string(),
  path: z.string(),
  title: z.string(),
  summary: z.union([z.string(), z.null()]),
  content: z.string(),
  sortOrder: z.number(),
  status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]),
  publishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type DocPage = z.infer<typeof DocPageSchema>;

export const DocPageTreeNodeSchema: z.ZodType<DocPageTreeNode> = z.object({
  id: z.string(),
  parentId: z.union([z.string(), z.null()]),
  slug: z.string(),
  path: z.string(),
  title: z.string(),
  summary: z.union([z.string(), z.null()]),
  status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]),
  sortOrder: z.number(),
  children: z.array(z.lazy(() => DocPageTreeNodeSchema)),
});

export const AdminDocSpaceListResponseSchema = z.object({
  items: z.array(z.intersection(DocSpaceSchema, z.object({ pageCount: z.number() }))),
});

export type AdminDocSpaceListResponse = z.infer<typeof AdminDocSpaceListResponseSchema>;

export const AdminDocSpaceDetailSchema = z.object({
  space: DocSpaceSchema,
  pages: z.array(DocPageSchema),
  tree: z.array(DocPageTreeNodeSchema),
});

export type AdminDocSpaceDetail = z.infer<typeof AdminDocSpaceDetailSchema>;

export const PublicDocSpaceListResponseSchema = z.object({
  items: z.array(z.intersection(DocSpaceSchema, z.object({ pageCount: z.number() }))),
});

export type PublicDocSpaceListResponse = z.infer<typeof PublicDocSpaceListResponseSchema>;

export const PublicDocSpaceDetailSchema = z.object({
  space: DocSpaceSchema,
  tree: z.array(DocPageTreeNodeSchema),
  defaultPath: z.union([z.string(), z.null()]),
});

export type PublicDocSpaceDetail = z.infer<typeof PublicDocSpaceDetailSchema>;

export const PublicDocPageDetailSchema = z.object({
  space: DocSpaceSchema,
  tree: z.array(DocPageTreeNodeSchema),
  page: DocPageSchema,
  previousPage: z.union([DocPageTreeNodeSchema, z.null()]),
  nextPage: z.union([DocPageTreeNodeSchema, z.null()]),
});

export type PublicDocPageDetail = z.infer<typeof PublicDocPageDetailSchema>;

export const DocsSearchIndexItemSchema = z.object({
  spaceSlug: z.string(),
  spaceTitle: z.string(),
  pagePath: z.string(),
  pageTitle: z.string(),
  summary: z.union([z.string(), z.null()]),
});

export type DocsSearchIndexItem = z.infer<typeof DocsSearchIndexItemSchema>;

export const DocsSearchIndexResponseSchema = z.object({
  items: z.array(DocsSearchIndexItemSchema),
});

export type DocsSearchIndexResponse = z.infer<typeof DocsSearchIndexResponseSchema>;

export const DocFeedbackInputSchema = z.object({
  spaceSlug: z.string(),
  pagePath: z.string(),
  helpful: z.boolean(),
  comment: z.string().optional(),
});

export type DocFeedbackInput = z.infer<typeof DocFeedbackInputSchema>;

export const DocFeedbackResultSchema = z.object({ ok: z.boolean(), id: z.string() });

export type DocFeedbackResult = z.infer<typeof DocFeedbackResultSchema>;
