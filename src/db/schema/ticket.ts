import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
  boolean,
  text,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { apps } from './app';
import { orders } from './billing';
import { installs } from './install';
import { deployments } from './deployment';
import {
  supportTicketCategoryEnum,
  supportTicketPriorityEnum,
  supportTicketStatusEnum,
  supportTicketMessageAuthorTypeEnum,
} from './enums';
import { sql } from 'drizzle-orm';

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
