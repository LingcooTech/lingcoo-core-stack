import { z } from 'zod';

const optionalTrimmedString = (max: number) => z.string().trim().max(max).optional();

export const contentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: optionalTrimmedString(255),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  sourceType: z.enum(['manual', 'wordpress', 'notion', 'wechat']).optional()
});

export const contentIdParamsSchema = z.object({
  contentId: z.string().uuid(),
});

export const publicContentSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(160),
});

export const upsertContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(160).optional(),
  excerpt: z.string().trim().max(500).optional(),
  content: z.string().trim().max(200000).default(''),
  coverUrl: z.string().trim().url().optional().or(z.literal('')),
  authorName: z.string().trim().max(120).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sourceType: z.enum(['manual', 'wordpress', 'notion', 'wechat']).default('manual'),
  sourceId: optionalTrimmedString(255),
  sourceUrl: z.string().trim().url().optional().or(z.literal('')),
  publishedAt: z.string().datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const importWordPressContentSchema = z.object({
  siteUrl: z.string().trim().url(),
  postUrl: z.string().trim().url().optional(),
  postId: z.union([z.string().trim(), z.number().int()]).optional(),
  slug: optionalTrimmedString(160),
  username: optionalTrimmedString(255),
  appPassword: optionalTrimmedString(255),
  status: z.enum(['draft', 'published']).default('draft')
}).refine(
  (value) => Boolean(value.postUrl || value.postId || value.slug),
  '请至少提供 WordPress 文章 URL、文章 ID 或 slug 之一'
);

export const importNotionContentSchema = z.object({
  apiToken: z.string().trim().min(1).max(255),
  pageUrl: z.string().trim().url().optional(),
  pageId: optionalTrimmedString(64),
  status: z.enum(['draft', 'published']).default('draft')
}).refine(
  (value) => Boolean(value.pageUrl || value.pageId),
  '请至少提供 Notion 页面 URL 或页面 ID'
);

export const importWechatContentSchema = z.object({
  url: z.string().trim().url().refine((value) => value.includes('mp.weixin.qq.com'), '请输入有效的微信公众号文章链接'),
  status: z.enum(['draft', 'published']).default('draft')
});
