import { z } from 'zod';
const rendered = z.object({ rendered: z.string().optional() });
export const wordpressPostSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: rendered.optional(),
  content: rendered.optional(),
  excerpt: rendered.optional(),
  link: z.string().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
  date: z.string().optional(),
  date_gmt: z.string().optional(),
  jetpack_featured_media_url: z.string().optional(),
  _embedded: z
    .object({
      'wp:featuredmedia': z.array(z.object({ source_url: z.string().optional() })).optional(),
      author: z.array(z.object({ name: z.string().optional() })).optional(),
    })
    .optional(),
});
export const notionRichTextSchema = z.object({
  plain_text: z.string().optional(),
  href: z.string().nullable().optional(),
  annotations: z
    .object({
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.boolean().optional(),
      strikethrough: z.boolean().optional(),
      code: z.boolean().optional(),
    })
    .optional(),
});
const file = z.object({ url: z.string().optional() });
const notionNodeSchema = z.object({
  rich_text: z.array(notionRichTextSchema).optional(),
  caption: z.array(notionRichTextSchema).optional(),
  icon: z.object({ emoji: z.string().optional() }).nullable().optional(),
  type: z.string().optional(),
  external: file.optional(),
  file: file.optional(),
  url: z.string().optional(),
  title: z.string().optional(),
});
export const notionBlockSchema = z
  .object({ id: z.string(), type: z.string(), has_children: z.boolean().optional() })
  .passthrough()
  .transform((raw) => ({
    id: raw.id,
    type: raw.type,
    has_children: raw.has_children,
    payload: notionNodeSchema.parse(raw[raw.type] ?? {}),
  }));
export type NotionBlock = z.infer<typeof notionBlockSchema> & { children?: NotionBlock[] };
export const notionBlockListSchema = z.object({
  results: z.array(notionBlockSchema),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});
export const notionPageSchema = z.object({
  properties: z.record(
    z.string(),
    z.object({ type: z.string(), title: z.array(notionRichTextSchema).optional() }).passthrough(),
  ),
  cover: z.object({ external: file.optional(), file: file.optional() }).nullable().optional(),
  created_by: z.object({ name: z.string().optional() }).optional(),
  last_edited_time: z.string().optional(),
  url: z.string().optional(),
});
