import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { apps } from './app';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { entitlements } from './license';
import { recordStatusEnum } from './enums';

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
  (table) => ({ entitlementIdx: index('deployments_entitlement_id_idx').on(table.entitlementId) }),
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
