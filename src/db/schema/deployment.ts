import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  timestamp,
  varchar,
  index,
  uniqueIndex,
  integer,
  check,
} from 'drizzle-orm/pg-core';
import { apps } from './app';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { entitlements } from './license';
import { recordStatusEnum } from './enums';

export const hostingNodes = pgTable('hosting_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 80 }).notNull(),
  serverIp: varchar('server_ip', { length: 64 }).notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  cpuMillis: integer('cpu_millis').notNull(),
  memoryMb: integer('memory_mb').notNull(),
  diskMb: integer('disk_mb').notNull(),
  reportTokenHash: varchar('report_token_hash', { length: 255 }).notNull(),
  asset: jsonb('asset')
    .notNull()
    .default(sql`'{}'::jsonb`),
  report: jsonb('report'),
  lastReportedAt: timestamp('last_reported_at', { withTimezone: true }),
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

export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'restrict' }),
    entitlementId: uuid('entitlement_id').references(() => entitlements.id, {
      onDelete: 'restrict',
    }),
    label: varchar('label', { length: 120 }).notNull(),
    deploymentMode: varchar('deployment_mode', { length: 24 }).notNull().default('self_hosted'),
    hostedPrefix: varchar('hosted_prefix', { length: 48 }),
    hostedDomain: varchar('hosted_domain', { length: 255 }),
    hostingNodeId: uuid('hosting_node_id').references(() => hostingNodes.id, {
      onDelete: 'restrict',
    }),
    hostingState: varchar('hosting_state', { length: 32 }),
    hostingResources: jsonb('hosting_resources'),
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
  },
  (table) => ({
    entitlementIdx: index('deployments_entitlement_id_idx').on(table.entitlementId),
    hostedPrefixKey: uniqueIndex('deployments_hosted_prefix_key').on(table.hostedPrefix),
    hostingNodeIdx: index('deployments_hosting_node_idx').on(table.hostingNodeId),
  }),
);

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

export const deploymentDomains = pgTable('deployment_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => deployments.id, { onDelete: 'cascade' }),
  hostname: varchar('hostname', { length: 253 }).notNull().unique(),
  verificationToken: varchar('verification_token', { length: 128 }).notNull(),
  state: varchar('state', { length: 24 }).notNull().default('pending_dns'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hostingOperations = pgTable(
  'hosting_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'restrict' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => hostingNodes.id, { onDelete: 'restrict' }),
    kind: varchar('kind', { length: 24 }).notNull(),
    state: varchar('state', { length: 24 }).notNull().default('pending'),
    requestKey: uuid('request_key').notNull().unique(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    result: varchar('result', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    pendingNodeIdx: index('hosting_operations_node_state_idx').on(t.nodeId, t.state),
    activeInstanceKey: uniqueIndex('hosting_operations_active_instance_key')
      .on(t.deploymentId)
      .where(sql`${t.state} in ('pending', 'running')`),
  }),
);

// Commercial service terms are independent of software entitlements and runtime state.
export const hostingServices = pgTable(
  'hosting_services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .unique()
      .references(() => deployments.id, { onDelete: 'restrict' }),
    source: varchar('source', { length: 16 }).$type<'trial' | 'manual' | 'paid'>().notNull(),
    interval: varchar('interval', { length: 16 }).$type<'month' | 'year'>().notNull(),
    periods: integer('periods').notNull(),
    anchorAt: timestamp('anchor_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    graceDays: integer('grace_days').notNull(),
    retentionDays: integer('retention_days').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    validity: check(
      'hosting_services_validity',
      sql`${t.periods} between 1 and 1200 and ${t.version} > 0 and ${t.graceDays} between 0 and 90 and ${t.retentionDays} between 1 and 3650 and ${t.source} in ('trial', 'manual', 'paid') and ${t.interval} in ('month', 'year') and ((${t.anchorAt} is null and ${t.expiresAt} is null) or (${t.anchorAt} is not null and ${t.expiresAt} is not null and ${t.expiresAt} > ${t.anchorAt}))`,
    ),
  }),
);
export const hostingServiceChanges = pgTable(
  'hosting_service_changes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => deployments.id, { onDelete: 'restrict' }),
    requestKey: uuid('request_key'),
    fingerprint: varchar('fingerprint', { length: 64 }),
    kind: varchar('kind', { length: 16 }).$type<'register' | 'extend' | 'activate'>().notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: varchar('reason', { length: 500 }).notNull(),
    version: integer('version').notNull(),
    before: jsonb('before'),
    after: jsonb('after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestKey: uniqueIndex('hosting_service_changes_request_key').on(t.deploymentId, t.requestKey),
    versionKey: uniqueIndex('hosting_service_changes_version_key').on(t.deploymentId, t.version),
  }),
);
