import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { apps } from './app';
import { installs } from './install';
import { sql } from 'drizzle-orm';

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
  installId: uuid('install_id').references(() => installs.id, { onDelete: 'set null' }),
  eventName: varchar('event_name', { length: 120 }).notNull(),
  eventTime: timestamp('event_time', { withTimezone: true }).notNull().defaultNow(),
  properties: jsonb('properties')
    .notNull()
    .default(sql`'{}'::jsonb`),
});
