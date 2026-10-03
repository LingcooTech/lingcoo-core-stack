import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  type AnyPgColumn,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { docSpaceTypeEnum, docSpaceStatusEnum, docPageStatusEnum } from './enums';
import { apps } from './app';
import { sql } from 'drizzle-orm';
import { users } from './auth';

export const docSpaces = pgTable(
  'doc_spaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    iconUrl: varchar('icon_url', { length: 500 }),
    type: docSpaceTypeEnum('type').notNull().default('product'),
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: docSpaceStatusEnum('status').notNull().default('active'),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appIdx: index('doc_spaces_app_id_idx').on(table.appId),
    statusSortIdx: index('doc_spaces_status_sort_idx').on(table.status, table.sortOrder),
  }),
);

export const docPages = pgTable(
  'doc_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => docSpaces.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => docPages.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 160 }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    summary: text('summary'),
    content: text('content').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    status: docPageStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spacePathUniqueIdx: uniqueIndex('doc_pages_space_path_unique_idx').on(
      table.spaceId,
      table.path,
    ),
    spaceParentSortIdx: index('doc_pages_space_parent_sort_idx').on(
      table.spaceId,
      table.parentId,
      table.sortOrder,
    ),
    statusPublishedIdx: index('doc_pages_status_published_idx').on(table.status, table.publishedAt),
  }),
);

export const docFeedback = pgTable(
  'doc_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceSlug: varchar('space_slug', { length: 160 }).notNull(),
    pagePath: varchar('page_path', { length: 500 }).notNull(),
    helpful: boolean('helpful').notNull(),
    comment: text('comment'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spacePathIdx: index('doc_feedback_space_path_idx').on(table.spaceSlug, table.pagePath),
    createdAtIdx: index('doc_feedback_created_at_idx').on(table.createdAt),
  }),
);
