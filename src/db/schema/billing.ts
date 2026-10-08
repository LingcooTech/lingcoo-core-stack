import type { OrderItem } from '@lingcoo/contracts';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  check,
  text,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { deployments } from './deployment';
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
  items: jsonb('items')
    .$type<OrderItem[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
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

export const hostingPurchases = pgTable(
  'hosting_purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'restrict' }),
    item: jsonb('item').$type<OrderItem>().notNull(),
    status: varchar('status', { length: 24 })
      .$type<'available' | 'bound' | 'refund_pending' | 'revoked'>()
      .notNull()
      .default('available'),
    deploymentId: uuid('deployment_id')
      .unique()
      .references(() => deployments.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    state: check(
      'hosting_purchases_state_check',
      sql`${t.status} in ('available', 'bound', 'refund_pending', 'revoked') and ((${t.status} = 'bound' and ${t.deploymentId} is not null) or (${t.status} <> 'bound' and ${t.deploymentId} is null))`,
    ),
  }),
);

// Payment fulfillment evidence; immutable target remains in orders.items.
export const hostingFulfillments = pgTable(
  'hosting_fulfillments',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 16 }).$type<'applied' | 'review' | 'revoked'>().notNull(),
    reason: text('reason').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    status: check(
      'hosting_fulfillments_status_check',
      sql`${t.status} in ('applied', 'review', 'revoked')`,
    ),
  }),
);

export const orderItemRefunds = pgTable(
  'order_item_refunds',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    kind: varchar('kind', { length: 16 }).$type<'software' | 'hosting'>().notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 16 })
      .$type<'pending' | 'succeeded' | 'failed'>()
      .notNull()
      .default('pending'),
    providerRefundId: varchar('provider_refund_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderLookup: index('order_item_refunds_order_idx').on(t.orderId, t.createdAt),
    valid: check(
      'order_item_refunds_valid',
      sql`${t.kind} in ('software','hosting') and ${t.status} in ('pending','succeeded','failed') and ${t.amount}>0`,
    ),
  }),
);
