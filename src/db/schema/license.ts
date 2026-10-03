import { pgTable, uuid, varchar, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { apps } from './app';
import { intervalEnum, recordStatusEnum, sourceTypeEnum } from './enums';
import { sql } from 'drizzle-orm';
import { users } from './auth';

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  billingProvider: varchar('billing_provider', { length: 32 }).notNull(),
  billingPriceId: varchar('billing_price_id', { length: 128 }),
  priceAmount: integer('price_amount').notNull().default(0),
  currency: varchar('currency', { length: 16 }).notNull().default('CNY'),
  interval: intervalEnum('interval').notNull(),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  status: recordStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const features = pgTable('features', {
  id: uuid('id').defaultRandom().primaryKey(),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull().default('boolean'),
  status: recordStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planFeatures = pgTable(
  'plan_features',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    value: jsonb('value')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.planId, table.featureId] }),
  }),
);

export const entitlements = pgTable('entitlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'restrict' }),
  sourceType: sourceTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id'),
  status: recordStatusEnum('status').notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
