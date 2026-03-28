import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const productTypeEnum = pgEnum('product_type', ['chrome_extension', 'web_app', 'service']);
export const appTypeEnum = pgEnum('app_type', ['chrome_extension', 'web_app', 'service']);
export const intervalEnum = pgEnum('billing_interval', ['month', 'year', 'one_time']);
export const sourceTypeEnum = pgEnum('entitlement_source_type', ['subscription', 'order', 'grant', 'trial']);
export const recordStatusEnum = pgEnum('record_status', ['active', 'inactive', 'cancelled', 'expired']);
export const paymentProviderEnum = pgEnum('payment_provider', ['wechat_pay', 'alipay']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'failed', 'cancelled', 'refunded']);
export const checkoutSessionStatusEnum = pgEnum('checkout_session_status', [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired'
]);
export const checkoutActionTypeEnum = pgEnum('checkout_action_type', ['qr_code', 'redirect_url']);
export const paymentAttemptStatusEnum = pgEnum('payment_attempt_status', [
  'prepared',
  'paid',
  'failed',
  'cancelled'
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 128 }).primaryKey(),
  value: jsonb('value').notNull().default(sql`'{}'::jsonb`),
  isEncrypted: boolean('is_encrypted').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const apps = pgTable('apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 255 }),
  type: appTypeEnum('type').notNull().default('chrome_extension'),
  status: recordStatusEnum('status').notNull().default('active'),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
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

export const passwordCredentials = pgTable('password_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
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
  priceAmount: integer('price_amount').notNull().default(0),
  currency: varchar('currency', { length: 16 }).notNull().default('CNY'),
  interval: intervalEnum('interval').notNull(),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
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

export const appProducts = pgTable(
  'app_products',
  {
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.appId, table.productId] })
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
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
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
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const checkoutSessions = pgTable('checkout_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionCode: varchar('session_code', { length: 64 }).notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'restrict' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
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
  actionPayload: jsonb('action_payload').notNull().default(sql`'{}'::jsonb`),
  successUrl: varchar('success_url', { length: 2048 }),
  cancelUrl: varchar('cancel_url', { length: 2048 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
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
    requestPayload: jsonb('request_payload').notNull().default(sql`'{}'::jsonb`),
    responsePayload: jsonb('response_payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    sessionAttemptKey: uniqueIndex('payment_attempts_session_attempt_idx').on(
      table.checkoutSessionId,
      table.attemptNo
    )
  })
);

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
  appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  extensionInstallId: varchar('extension_install_id', { length: 128 }).notNull().unique(),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  chromeProfileHint: varchar('chrome_profile_hint', { length: 255 }),
  appVersion: varchar('app_version', { length: 32 }),
  status: recordStatusEnum('status').notNull().default('active'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
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

export const billingWebhookEvents = pgTable(
  'billing_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 128 }).notNull(),
    type: varchar('type', { length: 64 }).notNull(),
    status: recordStatusEnum('status').notNull().default('active'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerEventKey: uniqueIndex('billing_webhook_events_provider_event_idx').on(
      table.provider,
      table.providerEventId
    )
  })
);
