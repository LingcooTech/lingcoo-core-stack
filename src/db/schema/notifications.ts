import { pgTable, uuid, varchar, text, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { notificationLevelEnum, notificationStatusEnum } from './enums';
import { events } from './event';
import { sql } from 'drizzle-orm';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 32 }).notNull().default('system'),
    level: notificationLevelEnum('level').notNull().default('info'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull().default(''),
    ctaLabel: varchar('cta_label', { length: 80 }),
    ctaUrl: varchar('cta_url', { length: 500 }),
    status: notificationStatusEnum('status').notNull().default('unread'),
    sourceEventId: uuid('source_event_id').references(() => events.id, { onDelete: 'set null' }),
    sourceEventName: varchar('source_event_name', { length: 120 }),
    dedupeKey: varchar('dedupe_key', { length: 255 }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusCreatedIdx: index('notifications_user_status_created_idx').on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    userCategoryCreatedIdx: index('notifications_user_category_created_idx').on(
      table.userId,
      table.category,
      table.createdAt,
    ),
    sourceEventIdx: index('notifications_source_event_idx').on(table.sourceEventId),
    dedupeKeyIdx: unique('notifications_dedupe_key_unique').on(table.dedupeKey),
  }),
);
