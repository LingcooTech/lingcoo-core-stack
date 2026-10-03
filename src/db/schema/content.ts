import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { contentSourceEnum, contentStatusEnum } from './enums';
import { sql } from 'drizzle-orm';

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    excerpt: text('excerpt'),
    content: text('content').notNull().default(''),
    coverUrl: varchar('cover_url', { length: 500 }),
    authorName: varchar('author_name', { length: 120 }),
    sourceType: contentSourceEnum('source_type').notNull().default('manual'),
    sourceId: varchar('source_id', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 2048 }),
    status: contentStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceTypeSourceIdIdx: index('content_items_source_type_source_id_idx').on(
      table.sourceType,
      table.sourceId,
    ),
    statusPublishedAtIdx: index('content_items_status_published_at_idx').on(
      table.status,
      table.publishedAt,
    ),
    sourceUrlIdx: index('content_items_source_url_idx').on(table.sourceUrl),
  }),
);
