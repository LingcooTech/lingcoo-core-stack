import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { apps } from './app';
import { plans } from './license';
import { orders } from './billing';
import {
  paymentProviderEnum,
  checkoutSessionStatusEnum,
  checkoutActionTypeEnum,
  paymentAttemptStatusEnum,
} from './enums';
import { sql } from 'drizzle-orm';

export const checkoutSessions = pgTable('checkout_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionCode: varchar('session_code', { length: 64 }).notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' })
    .unique(),
  provider: paymentProviderEnum('provider').notNull(),
  status: checkoutSessionStatusEnum('status').notNull().default('pending'),
  actionType: checkoutActionTypeEnum('action_type').notNull(),
  actionPayload: jsonb('action_payload')
    .notNull()
    .default(sql`'{}'::jsonb`),
  successUrl: varchar('success_url', { length: 2048 }),
  cancelUrl: varchar('cancel_url', { length: 2048 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    checkoutSessionId: uuid('checkout_session_id')
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull().default(1),
    provider: paymentProviderEnum('provider').notNull(),
    actionType: checkoutActionTypeEnum('action_type').notNull(),
    status: paymentAttemptStatusEnum('status').notNull().default('prepared'),
    providerReference: varchar('provider_reference', { length: 128 }),
    requestPayload: jsonb('request_payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    responsePayload: jsonb('response_payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionAttemptKey: uniqueIndex('payment_attempts_session_attempt_idx').on(
      table.checkoutSessionId,
      table.attemptNo,
    ),
  }),
);
