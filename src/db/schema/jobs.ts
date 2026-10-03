import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jobRunStatusEnum } from './enums';
import { sql } from 'drizzle-orm';
import { users } from './auth';

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
