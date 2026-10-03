import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const idempotencyRequests = pgTable('idempotency_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  scopeDigest: varchar('scope_digest', { length: 64 }).notNull().unique(),
  payloadDigest: varchar('payload_digest', { length: 64 }).notNull(),
  ownerToken: uuid('owner_token').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('processing'),
  responseStatus: integer('response_status'),
  result: jsonb('result'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
