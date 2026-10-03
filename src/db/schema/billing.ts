import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
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
