import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);
export const productTypeEnum = pgEnum('product_type', ['chrome_extension', 'web_app', 'service']);
export const intervalEnum = pgEnum('billing_interval', ['month', 'year', 'one_time']);
export const sourceTypeEnum = pgEnum('entitlement_source_type', ['subscription', 'order', 'grant', 'trial']);
export const recordStatusEnum = pgEnum('record_status', ['active', 'inactive', 'cancelled', 'expired']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 64 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  type: productTypeEnum('type').notNull().default('chrome_extension'),
  status: recordStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  billingProvider: varchar('billing_provider', { length: 32 }).notNull(),
  billingPriceId: varchar('billing_price_id', { length: 128 }),
  interval: intervalEnum('interval').notNull(),
  status: recordStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const features = pgTable('features', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull().default('boolean'),
  status: recordStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
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
    value: jsonb('value').notNull().default(sql`'{}'::jsonb`)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.planId, table.featureId] })
  })
);

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerCustomerId: varchar('provider_customer_id', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'restrict' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerSubscriptionId: varchar('provider_subscription_id', { length: 128 }).notNull(),
  status: recordStatusEnum('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerOrderId: varchar('provider_order_id', { length: 128 }).notNull(),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 16 }).notNull().default('CNY'),
  status: recordStatusEnum('status').notNull().default('active'),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const entitlements = pgTable('entitlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  featureId: uuid('feature_id')
    .notNull()
    .references(() => features.id, { onDelete: 'cascade' }),
  sourceType: sourceTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id'),
  status: recordStatusEnum('status').notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const installs = pgTable('installs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  extensionInstallId: varchar('extension_install_id', { length: 128 }).notNull().unique(),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  chromeProfileHint: varchar('chrome_profile_hint', { length: 255 }),
  appVersion: varchar('app_version', { length: 32 }),
  status: recordStatusEnum('status').notNull().default('active'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  installId: uuid('install_id').references(() => installs.id, { onDelete: 'set null' }),
  eventName: varchar('event_name', { length: 120 }).notNull(),
  eventTime: timestamp('event_time', { withTimezone: true }).notNull().defaultNow(),
  properties: jsonb('properties').notNull().default(sql`'{}'::jsonb`)
});

export const billingWebhookEvents = pgTable('billing_webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerEventId: varchar('provider_event_id', { length: 128 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  status: recordStatusEnum('status').notNull().default('active'),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
