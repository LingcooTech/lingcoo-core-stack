import { pgTable, varchar, jsonb, boolean, uuid, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 128 }).primaryKey(),
  value: jsonb('value')
    .notNull()
    .default(sql`'{}'::jsonb`),
  isEncrypted: boolean('is_encrypted').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settingsRevisions = pgTable('settings_revisions', {
  key: varchar('key', { length: 128 }).primaryKey(),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
