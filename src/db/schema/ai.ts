import { pgTable, uuid, varchar, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { apps } from './app';
import { sql } from 'drizzle-orm';

export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 255 }).notNull(),
    operation: varchar('operation', { length: 32 }).notNull().default('chat'),
    accessScope: varchar('access_scope', { length: 32 }).notNull().default('trial'),
    status: varchar('status', { length: 32 }).notNull().default('succeeded'),
    requestChars: integer('request_chars').notNull().default(0),
    responseChars: integer('response_chars').notNull().default(0),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userAppCreatedIdx: index('ai_usage_events_user_app_created_idx').on(
      table.userId,
      table.appId,
      table.createdAt,
    ),
    appCreatedIdx: index('ai_usage_events_app_created_idx').on(table.appId, table.createdAt),
  }),
);
