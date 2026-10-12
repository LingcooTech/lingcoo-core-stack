import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  timestamp,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { recordStatusEnum } from './enums';
import { plans } from './license';

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
    appCodeKey: unique('app_offers_app_id_code_key').on(table.appId, table.code),
  }),
);

export const appConnections = pgTable('app_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull(),
  host: varchar('host', { length: 255 }),
  credentials: jsonb('credentials').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Upstream development identity exists independently of a saleable application.
export const developmentProjects = pgTable('development_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  appId: uuid('app_id')
    .unique()
    .references(() => apps.id, { onDelete: 'restrict' }),
  source: jsonb('source'),
  definition: jsonb('definition'),
  definitionDigest: varchar('definition_digest', { length: 80 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appPublishingTokens = pgTable('app_publishing_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  appId: uuid('app_id').references(() => apps.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => developmentProjects.id, { onDelete: 'restrict' }),
  actorUserId: uuid('actor_user_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  revoked: boolean('revoked').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const appBuildRequests = pgTable('app_build_requests', {
  id: uuid('id').primaryKey(),
  appId: uuid('app_id').references(() => apps.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => developmentProjects.id, { onDelete: 'restrict' }),
  version: varchar('version', { length: 80 }).notNull(),
  commit: varchar('commit', { length: 40 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('dispatching'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const appSources = pgTable('app_sources', {
  appId: uuid('app_id')
    .primaryKey()
    .references(() => apps.id, { onDelete: 'cascade' }),
  source: jsonb('source'),
  definition: jsonb('definition').notNull(),
  definitionDigest: varchar('definition_digest', { length: 80 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const appReleases = pgTable(
  'app_releases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => developmentProjects.id, {
      onDelete: 'restrict',
    }),
    version: varchar('version', { length: 80 }).notNull(),
    commit: varchar('commit', { length: 40 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    definition: jsonb('definition').notNull(),
    definitionDigest: varchar('definition_digest', { length: 80 }).notNull(),
    images: jsonb('images').notNull(),
    notes: text('notes').notNull().default(''),
    buildUrl: text('build_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => ({
    appVersionKey: unique('app_releases_app_version_key').on(table.appId, table.version),
    projectVersionKey: unique('app_releases_project_version_key').on(
      table.projectId,
      table.version,
    ),
  }),
);
