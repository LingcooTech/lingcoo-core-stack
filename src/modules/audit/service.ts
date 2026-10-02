import { queryBatch } from '../../db/query-batch';
import { redactAuditValue } from './redaction';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { auditLogs, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export interface AuditLogRecordInput {
  actorType?: 'user' | 'system' | 'job';
  actorUserId?: string | null;
  actorLabel?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: 'succeeded' | 'failed';
  summary?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  meta?: Record<string, unknown>;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export class AuditLogService {
  constructor(private readonly db: DbExecutor) {}

  async record(input: AuditLogRecordInput) {
    const now = new Date();
    const [created] = await this.db
      .insert(auditLogs)
      .values({
        actorType: input.actorType ?? 'user',
        actorUserId: input.actorUserId ?? null,
        actorLabel: normalizeString(input.actorLabel).slice(0, 160) || null,
        action: normalizeString(input.action),
        resourceType: normalizeString(input.resourceType),
        resourceId: normalizeString(input.resourceId) || null,
        outcome: input.outcome ?? 'succeeded',
        summary: normalizeString(input.summary).slice(0, 255) || null,
        ipAddress: normalizeString(input.ipAddress) || null,
        userAgent: normalizeString(input.userAgent).slice(0, 500) || null,
        requestId: normalizeString(input.requestId) || null,
        meta: redactAuditValue(input.meta ?? {}),
        createdAt: now,
      })
      .returning();

    return created;
  }

  async list(query: { limit: number; offset: number; search?: string }) {
    const conditions = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(auditLogs.action, pattern),
          ilike(auditLogs.resourceType, pattern),
          ilike(auditLogs.resourceId, pattern),
          ilike(auditLogs.summary, pattern),
          ilike(auditLogs.actorLabel, pattern),
          ilike(auditLogs.outcome, pattern),
          ilike(sql`${auditLogs.id}::text`, pattern),
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await queryBatch(this.db, [
      () =>
        this.db
          .select({ item: auditLogs })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.actorUserId, users.id))
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(query.limit)
          .offset(query.offset),
      () =>
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.actorUserId, users.id))
          .where(where),
    ]);

    return {
      items: rows.map((row) => ({ ...row.item, meta: redactAuditValue(row.item.meta) })),
      total: countResult[0]?.count ?? 0,
    };
  }

  async listRecentForUser(userId: string, limit = 10) {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(
        or(
          eq(auditLogs.actorUserId, userId),
          and(eq(auditLogs.resourceType, 'user'), eq(auditLogs.resourceId, userId)),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, meta: redactAuditValue(row.meta) }));
  }
}
