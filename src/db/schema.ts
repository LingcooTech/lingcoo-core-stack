import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);
export const userRoleEnum = pgEnum('user_role', [
  'user',
  'support',
  'finance',
  'editor',
  'operator',
  'admin',
]);
export const intervalEnum = pgEnum('billing_interval', ['month', 'year', 'one_time']);
export const sourceTypeEnum = pgEnum('entitlement_source_type', [
  'subscription',
  'order',
  'grant',
  'trial',
]);
export const recordStatusEnum = pgEnum('record_status', [
  'active',
  'inactive',
  'cancelled',
  'expired',
]);
export const paymentProviderEnum = pgEnum('payment_provider', ['wechat_pay', 'alipay']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunding',
  'refunded',
]);
export const checkoutSessionStatusEnum = pgEnum('checkout_session_status', [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired',
]);
export const checkoutActionTypeEnum = pgEnum('checkout_action_type', ['qr_code', 'redirect_url']);
export const paymentAttemptStatusEnum = pgEnum('payment_attempt_status', [
  'prepared',
  'paid',
  'failed',
  'cancelled',
]);
export const contentSourceEnum = pgEnum('content_source', [
  'manual',
  'wordpress',
  'notion',
  'wechat',
]);
export const contentStatusEnum = pgEnum('content_status', ['draft', 'published', 'archived']);
export const docSpaceTypeEnum = pgEnum('doc_space_type', ['product', 'app', 'internal']);
export const docSpaceStatusEnum = pgEnum('doc_space_status', ['active', 'hidden', 'archived']);
export const docPageStatusEnum = pgEnum('doc_page_status', ['draft', 'published', 'archived']);
export const notificationLevelEnum = pgEnum('notification_level', [
  'info',
  'success',
  'warning',
  'error',
]);
export const notificationStatusEnum = pgEnum('notification_status', ['unread', 'read', 'archived']);
export const supportTicketStatusEnum = pgEnum('support_ticket_status', [
  'waiting_staff',
  'waiting_user',
  'resolved',
  'closed',
]);
export const supportTicketPriorityEnum = pgEnum('support_ticket_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);
export const supportTicketCategoryEnum = pgEnum('support_ticket_category', [
  'account',
  'billing',
  'access',
  'install',
  'deployment',
  'bug',
  'feature',
  'other',
]);
export const supportTicketMessageAuthorTypeEnum = pgEnum('support_ticket_message_author_type', [
  'user',
  'admin',
  'system',
]);
export const jobRunStatusEnum = pgEnum('job_run_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'dead',
]);
export const auditActorTypeEnum = pgEnum('audit_actor_type', ['user', 'system', 'job']);
export const auditOutcomeEnum = pgEnum('audit_outcome', ['succeeded', 'failed']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('active'),
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    excerpt: text('excerpt'),
    content: text('content').notNull().default(''),
    coverUrl: varchar('cover_url', { length: 500 }),
    authorName: varchar('author_name', { length: 120 }),
    sourceType: contentSourceEnum('source_type').notNull().default('manual'),
    sourceId: varchar('source_id', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 2048 }),
    status: contentStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceTypeSourceIdIdx: index('content_items_source_type_source_id_idx').on(
      table.sourceType,
      table.sourceId,
    ),
    statusPublishedAtIdx: index('content_items_status_published_at_idx').on(
      table.status,
      table.publishedAt,
    ),
    sourceUrlIdx: index('content_items_source_url_idx').on(table.sourceUrl),
  }),
);

export const docSpaces = pgTable(
  'doc_spaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    iconUrl: varchar('icon_url', { length: 500 }),
    type: docSpaceTypeEnum('type').notNull().default('product'),
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: docSpaceStatusEnum('status').notNull().default('active'),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appIdx: index('doc_spaces_app_id_idx').on(table.appId),
    statusSortIdx: index('doc_spaces_status_sort_idx').on(table.status, table.sortOrder),
  }),
);

export const docPages = pgTable(
  'doc_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => docSpaces.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): any => docPages.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 160 }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    summary: text('summary'),
    content: text('content').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    status: docPageStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spacePathUniqueIdx: uniqueIndex('doc_pages_space_path_unique_idx').on(
      table.spaceId,
      table.path,
    ),
    spaceParentSortIdx: index('doc_pages_space_parent_sort_idx').on(
      table.spaceId,
      table.parentId,
      table.sortOrder,
    ),
    statusPublishedIdx: index('doc_pages_status_published_idx').on(table.status, table.publishedAt),
  }),
);

export const docFeedback = pgTable(
  'doc_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    spaceSlug: varchar('space_slug', { length: 160 }).notNull(),
    pagePath: varchar('page_path', { length: 500 }).notNull(),
    helpful: boolean('helpful').notNull(),
    comment: text('comment'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spacePathIdx: index('doc_feedback_space_path_idx').on(table.spaceSlug, table.pagePath),
    createdAtIdx: index('doc_feedback_created_at_idx').on(table.createdAt),
  }),
);

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 64 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordCredentials = pgTable('password_credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailVerificationCodes = pgTable('email_verification_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetCodes = pgTable('password_reset_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

export const appDeliverySettings = pgTable('app_delivery_settings', {
  appId: uuid('app_id')
    .primaryKey()
    .references(() => apps.id, { onDelete: 'cascade' }),
  value: jsonb('value')
    .notNull()
    .default(sql`'{}'::jsonb`),
  isEncrypted: boolean('is_encrypted').notNull().default(false),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 255 }).notNull(),
    operation: varchar('operation', { length: 32 }).notNull().default('chat'),
    accessScope: varchar('access_scope', { length: 32 }).notNull().default('trial'),
    status: varchar('status', { length: 32 }).notNull().default('succeeded'),
    requestChars: integer('request_chars').notNull().default(0),
    responseChars: integer('response_chars').notNull().default(0),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userAppCreatedIdx: index('ai_usage_events_user_app_created_idx').on(
      table.userId,
      table.appId,
      table.createdAt,
    ),
    appCreatedIdx: index('ai_usage_events_app_created_idx').on(table.appId, table.createdAt),
  }),
);

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
    appCodeKey: uniqueIndex('app_offers_app_id_code_idx').on(table.appId, table.code),
  }),
);

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

export const installs = pgTable('installs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'cascade' }),
  extensionInstallId: varchar('extension_install_id', { length: 128 }).notNull().unique(),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  chromeProfileHint: varchar('chrome_profile_hint', { length: 255 }),
  appVersion: varchar('app_version', { length: 32 }),
  status: recordStatusEnum('status').notNull().default('active'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deployments = pgTable('deployments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  appId: uuid('app_id')
    .notNull()
    .references(() => apps.id, { onDelete: 'restrict' }),
  entitlementId: uuid('entitlement_id').references(() => entitlements.id, { onDelete: 'restrict' }),
  label: varchar('label', { length: 120 }).notNull(),
  environment: varchar('environment', { length: 32 }).notNull().default('production'),
  serverHost: varchar('server_host', { length: 255 }),
  installPath: varchar('install_path', { length: 255 })
    .notNull()
    .default('/opt/fd-headless-wp-system'),
  status: recordStatusEnum('status').notNull().default('active'),
  lastTokenIssuedAt: timestamp('last_token_issued_at', { withTimezone: true }),
  lastDeployedAt: timestamp('last_deployed_at', { withTimezone: true }),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deploymentTokens = pgTable(
  'deployment_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'cascade' }),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    tokenHint: varchar('token_hint', { length: 16 }).notNull(),
    status: recordStatusEnum('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashKey: uniqueIndex('deployment_tokens_token_hash_idx').on(table.tokenHash),
  }),
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketNo: varchar('ticket_no', { length: 64 }).notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    installId: uuid('install_id').references(() => installs.id, { onDelete: 'set null' }),
    deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
    category: supportTicketCategoryEnum('category').notNull().default('other'),
    priority: supportTicketPriorityEnum('priority').notNull().default('normal'),
    status: supportTicketStatusEnum('status').notNull().default('waiting_staff'),
    subject: varchar('subject', { length: 200 }).notNull(),
    assignedAdminUserId: uuid('assigned_admin_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastReplyAuthorType: supportTicketMessageAuthorTypeEnum('last_reply_author_type')
      .notNull()
      .default('user'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    firstRespondedAt: timestamp('first_responded_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusLastActivityIdx: index('support_tickets_user_status_last_activity_idx').on(
      table.userId,
      table.status,
      table.lastActivityAt,
    ),
    statusPriorityLastActivityIdx: index('support_tickets_status_priority_last_activity_idx').on(
      table.status,
      table.priority,
      table.lastActivityAt,
    ),
    appIdx: index('support_tickets_app_id_idx').on(table.appId),
    assignedAdminIdx: index('support_tickets_assigned_admin_user_id_idx').on(
      table.assignedAdminUserId,
    ),
  }),
);

export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorType: supportTicketMessageAuthorTypeEnum('author_type').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    body: text('body').notNull().default(''),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ticketCreatedIdx: index('support_ticket_messages_ticket_created_idx').on(
      table.ticketId,
      table.createdAt,
    ),
    authorIdx: index('support_ticket_messages_author_user_id_idx').on(table.authorUserId),
  }),
);

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

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 32 }).notNull().default('system'),
    level: notificationLevelEnum('level').notNull().default('info'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull().default(''),
    ctaLabel: varchar('cta_label', { length: 80 }),
    ctaUrl: varchar('cta_url', { length: 500 }),
    status: notificationStatusEnum('status').notNull().default('unread'),
    sourceEventId: uuid('source_event_id').references(() => events.id, { onDelete: 'set null' }),
    sourceEventName: varchar('source_event_name', { length: 120 }),
    dedupeKey: varchar('dedupe_key', { length: 255 }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userStatusCreatedIdx: index('notifications_user_status_created_idx').on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    userCategoryCreatedIdx: index('notifications_user_category_created_idx').on(
      table.userId,
      table.category,
      table.createdAt,
    ),
    sourceEventIdx: index('notifications_source_event_idx').on(table.sourceEventId),
    dedupeKeyIdx: uniqueIndex('notifications_dedupe_key_idx').on(table.dedupeKey),
  }),
);

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

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queue: varchar('queue', { length: 64 }).notNull().default('default'),
    kind: varchar('kind', { length: 120 }).notNull(),
    status: jobRunStatusEnum('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(100),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    result: jsonb('result')
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb('error')
      .notNull()
      .default(sql`'{}'::jsonb`),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    dedupeKey: varchar('dedupe_key', { length: 255 }),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    claimToken: uuid('claim_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 120 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    relatedEntityType: varchar('related_entity_type', { length: 64 }),
    relatedEntityId: varchar('related_entity_id', { length: 255 }),
    traceId: varchar('trace_id', { length: 120 }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusAvailableIdx: index('job_runs_status_available_idx').on(
      table.status,
      table.availableAt,
      table.priority,
      table.createdAt,
    ),
    kindCreatedIdx: index('job_runs_kind_created_idx').on(table.kind, table.createdAt),
    createdByIdx: index('job_runs_created_by_user_id_idx').on(table.createdByUserId),
    dedupeKeyIdx: uniqueIndex('job_runs_dedupe_key_idx').on(table.dedupeKey),
  }),
);

export const jobAttempts = pgTable('job_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobRuns.id, { onDelete: 'cascade' }),
  attempt: integer('attempt').notNull(),
  claimToken: uuid('claim_token').notNull().unique(),
  status: varchar('status', { length: 32 }).notNull(),
  error: jsonb('error')
    .notNull()
    .default(sql`'{}'::jsonb`),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorType: auditActorTypeEnum('actor_type').notNull().default('user'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorLabel: varchar('actor_label', { length: 160 }),
    action: varchar('action', { length: 160 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    resourceId: varchar('resource_id', { length: 255 }),
    outcome: auditOutcomeEnum('outcome').notNull().default('succeeded'),
    summary: varchar('summary', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 500 }),
    requestId: varchar('request_id', { length: 120 }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actionCreatedIdx: index('audit_logs_action_created_idx').on(table.action, table.createdAt),
    resourceCreatedIdx: index('audit_logs_resource_created_idx').on(
      table.resourceType,
      table.resourceId,
      table.createdAt,
    ),
    actorCreatedIdx: index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt),
    outcomeCreatedIdx: index('audit_logs_outcome_created_idx').on(table.outcome, table.createdAt),
  }),
);
