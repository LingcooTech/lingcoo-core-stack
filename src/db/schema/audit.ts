import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { auditActorTypeEnum, auditOutcomeEnum } from './enums';
import { users } from './auth';
import { sql } from 'drizzle-orm';

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
