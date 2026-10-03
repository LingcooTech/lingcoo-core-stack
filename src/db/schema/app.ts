import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { recordStatusEnum } from './enums';
import { plans } from './license';

export const apps = pgTable('apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  tagline: varchar('tagline', { length: 200 }),
  description: text('description'),
  content: text('content'),
  iconUrl: varchar('icon_url', { length: 500 }),
  coverUrl: varchar('cover_url', { length: 500 }),
  screenshots: jsonb('screenshots')
    .notNull()
    .default(sql`'[]'::jsonb`),
  highlights: jsonb('highlights')
    .notNull()
    .default(sql`'[]'::jsonb`),
  faq: jsonb('faq')
    .notNull()
    .default(sql`'[]'::jsonb`),
  links: jsonb('links')
    .notNull()
    .default(sql`'[]'::jsonb`),
  category: varchar('category', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  type: varchar('type', { length: 64 }).notNull().default('web_app'),
  status: recordStatusEnum('status').notNull().default('active'),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appSecrets = pgTable('app_secrets', {
  id: uuid('id').defaultRandom().primaryKey(),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  secretHash: varchar('secret_hash', { length: 255 }).notNull(),
  hint: varchar('hint', { length: 16 }).notNull(),
  status: recordStatusEnum('status').notNull().default('active'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appOffers = pgTable(
  'app_offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    badge: varchar('badge', { length: 64 }),
    priceAmount: integer('price_amount').notNull().default(0),
    currency: varchar('currency', { length: 16 }).notNull().default('CNY'),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    status: recordStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appCodeKey: unique('app_offers_app_id_code_key').on(table.appId, table.code),
  }),
);
