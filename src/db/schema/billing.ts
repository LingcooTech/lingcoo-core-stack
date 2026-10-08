import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  check,
  text,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { plans } from './license';
import { recordStatusEnum, paymentProviderEnum, orderStatusEnum } from './enums';
import { apps } from './app';
import { sql } from 'drizzle-orm';

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerCustomerId: varchar('provider_customer_id', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'restrict' }),
  orderNo: varchar('order_no', { length: 64 }).notNull().unique(),
  provider: paymentProviderEnum('provider').notNull(),
  providerOrderId: varchar('provider_order_id', { length: 128 }),
  subject: varchar('subject', { length: 255 }).notNull(),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 16 }).notNull().default('CNY'),
  status: orderStatusEnum('status').notNull().default('pending'),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billingWebhookEvents = pgTable(
  'billing_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 128 }).notNull(),
    type: varchar('type', { length: 64 }).notNull(),
    status: recordStatusEnum('status').notNull().default('active'),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerEventKey: uniqueIndex('billing_webhook_events_provider_event_idx').on(
      table.provider,
      table.providerEventId,
    ),
  }),
);

// Commercial catalog only; runtime scheduling budgets stay in deployment.
export const hostingOffers = pgTable(
  'hosting_offers',
  {
    id: uuid('id').primaryKey(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 64 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    description: text('description').notNull(),
    interval: varchar('interval', { length: 16 }).notNull(),
    priceAmount: integer('price_amount').notNull(),
    currency: varchar('currency', { length: 16 }).notNull().default('CNY'),
    graceDays: integer('grace_days').notNull(),
    retentionDays: integer('retention_days').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    appCode: uniqueIndex('hosting_offers_app_code_idx').on(t.appId, t.code),
    terms: check(
      'hosting_offers_terms_check',
      sql`${t.interval} IN ('month', 'year') AND ${t.currency} = 'CNY' AND ${t.priceAmount} BETWEEN 0 AND 100000000 AND ${t.graceDays} BETWEEN 0 AND 90 AND ${t.retentionDays} BETWEEN 1 AND 3650 AND ${t.version} > 0`,
    ),
    status: check(
      'hosting_offers_status_check',
      sql`${t.status} IN ('draft', 'active', 'archived') AND (${t.status} <> 'active' OR ${t.priceAmount} > 0)`,
    ),
  }),
);
