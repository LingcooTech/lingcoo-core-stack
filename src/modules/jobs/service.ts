import { queryBatch } from '../../db/query-batch';
import { validateJobPayload } from './registry';
import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, ilike, lte, gt, isNull, or, sql, inArray } from 'drizzle-orm';

import { jobRuns, jobAttempts, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';

export type JobRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead';
export type JobRunKind =
  | 'email.deliver'
  | 'alert.webhook.deliver'
  | 'billing.refund.reconcile'
  | 'notifications.project';

export interface MailDeliveryJobPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface AlertWebhookDeliveryJobPayload {
  body: Record<string, unknown>;
}

export interface EnqueueJobInput {
  queue?: string;
  kind: JobRunKind;
  priority?: number;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  dedupeKey?: string;
  createdByUserId?: string | null;
  relatedEntityType?: string;
  relatedEntityId?: string;
  traceId?: string;
  meta?: Record<string, unknown>;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toRecord(value: MailDeliveryJobPayload): Record<string, unknown> {
  return {
    to: value.to,
    subject: value.subject,
    text: value.text,
    ...(value.html ? { html: value.html } : {}),
  };
}

export function computeJobBackoffMs(attempts: number) {
  const safeAttempts = Math.max(1, attempts);
  return Math.min(30_000 * 2 ** (safeAttempts - 1), 15 * 60_000);
}

function serializeError(error: unknown) {
  const status =
    error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500;
  return {
    code: 'JOB_EXECUTION_FAILED',
    message: 'Job execution failed',
    retryable: ![400, 401, 403, 404, 422].includes(status),
  };
}

export function buildMailDedupeKey(input: {
  scope: string;
  recipient: string;
  subject: string;
  reference?: string;
}) {
  return [
    'mail',
    normalizeString(input.scope),
    normalizeString(input.recipient).toLowerCase(),
    normalizeString(input.subject),
    normalizeString(input.reference),
  ]
    .filter(Boolean)
    .join(':');
}

export class JobRunService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env?: AppEnv,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async enqueue(input: EnqueueJobInput) {
    validateJobPayload(input.kind, input.payload);
    const now = this.clock();
    const [inserted] = await this.db
      .insert(jobRuns)
      .values({
        queue: normalizeString(input.queue) || 'default',
        kind: input.kind,
        status: 'pending',
        priority: input.priority ?? 100,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? 5,
        dedupeKey: normalizeString(input.dedupeKey) || null,
        createdByUserId: input.createdByUserId ?? null,
        relatedEntityType: normalizeString(input.relatedEntityType) || null,
        relatedEntityId: normalizeString(input.relatedEntityId) || null,
        traceId: normalizeString(input.traceId) || null,
        meta: { ...input.meta, payloadVersion: 1 },
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: jobRuns.dedupeKey,
      })
      .returning();

    if (inserted) {
      return inserted;
    }

    const dedupeKey = normalizeString(input.dedupeKey);
    if (!dedupeKey) {
      throw httpError(500, 'Failed to enqueue job');
    }

    const [existing] = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.dedupeKey, dedupeKey))
      .limit(1);

    if (!existing) {
      throw httpError(500, 'Failed to load deduplicated job');
    }

    return existing;
  }

  async enqueueMail(
    payload: MailDeliveryJobPayload,
    options: {
      scope: string;
      reference?: string;
      createdByUserId?: string | null;
      relatedEntityType?: string;
      relatedEntityId?: string;
      traceId?: string;
    },
  ) {
    return this.enqueue({
      kind: 'email.deliver',
      payload: toRecord(payload),
      dedupeKey: buildMailDedupeKey({
        scope: options.scope,
        recipient: payload.to,
        subject: payload.subject,
        reference: options.reference,
      }),
      createdByUserId: options.createdByUserId,
      relatedEntityType: options.relatedEntityType,
      relatedEntityId: options.relatedEntityId,
      traceId: options.traceId,
    });
  }

  async enqueueAlertWebhook(
    payload: AlertWebhookDeliveryJobPayload,
    options: {
      dedupeKey: string;
      traceId?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    return this.enqueue({
      kind: 'alert.webhook.deliver',
      payload: {
        body: payload.body,
      },
      dedupeKey: options.dedupeKey,
      relatedEntityType: 'observability_alert',
      relatedEntityId: 'active',
      traceId: options.traceId,
      meta: options.meta,
    });
  }

  async listJobs(query: { limit: number; offset: number; search?: string }) {
    const conditions = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(jobRuns.kind, pattern),
          ilike(jobRuns.queue, pattern),
          ilike(jobRuns.status, pattern),
          ilike(jobRuns.relatedEntityType, pattern),
          ilike(jobRuns.relatedEntityId, pattern),
          ilike(jobRuns.lockedBy, pattern),
          ilike(jobRuns.dedupeKey, pattern),
          ilike(sql`${jobRuns.id}::text`, pattern),
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await queryBatch(this.db, [
      () =>
        this.db
          .select({ item: jobRuns })
          .from(jobRuns)
          .leftJoin(users, eq(jobRuns.createdByUserId, users.id))
          .where(where)
          .orderBy(desc(jobRuns.createdAt))
          .limit(query.limit)
          .offset(query.offset),
      () =>
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(jobRuns)
          .leftJoin(users, eq(jobRuns.createdByUserId, users.id))
          .where(where),
    ]);

    return {
      items: rows.map(({ item }) => ({
        id: item.id,
        queue: item.queue,
        kind: item.kind,
        status: item.status,
        attempts: item.attempts,
        maxAttempts: item.maxAttempts,
        availableAt: item.availableAt,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        relatedEntityType: item.relatedEntityType,
        relatedEntityId: item.relatedEntityId,
        error:
          item.status === 'dead' || item.status === 'failed'
            ? { code: 'JOB_EXECUTION_FAILED', message: 'Job execution failed' }
            : {},
      })),
      total: countResult[0]?.count ?? 0,
    };
  }

  async claimNext(workerId: string, queue?: string) {
    const now = this.clock();
    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.status, 'pending'),
            lte(jobRuns.availableAt, now),
            queue ? eq(jobRuns.queue, queue) : undefined,
          ),
        )
        .orderBy(asc(jobRuns.priority), asc(jobRuns.availableAt), asc(jobRuns.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!candidate) return null;
      const claimToken = randomUUID();
      const [claimed] = await tx
        .update(jobRuns)
        .set({
          status: 'running',
          attempts: candidate.attempts + 1,
          claimToken,
          leaseExpiresAt: new Date(
            now.getTime() + (this.env?.WORKER_STALE_JOB_TIMEOUT_MS ?? 600000),
          ),
          lockedAt: now,
          lockedBy: workerId,
          startedAt: now,
          finishedAt: null,
          updatedAt: now,
        })
        .where(eq(jobRuns.id, candidate.id))
        .returning();
      await tx.insert(jobAttempts).values({
        jobId: claimed.id,
        attempt: claimed.attempts,
        claimToken,
        status: 'running',
        startedAt: now,
      });
      return claimed;
    });
  }

  async heartbeat(jobId: string, claimToken: string) {
    const now = this.clock();
    const [owned] = await this.db
      .update(jobRuns)
      .set({
        leaseExpiresAt: new Date(now.getTime() + (this.env?.WORKER_STALE_JOB_TIMEOUT_MS ?? 600000)),
        updatedAt: now,
      })
      .where(
        and(
          eq(jobRuns.id, jobId),
          eq(jobRuns.status, 'running'),
          eq(jobRuns.claimToken, claimToken),
          gt(jobRuns.leaseExpiresAt, now),
        ),
      )
      .returning({ id: jobRuns.id });
    return Boolean(owned);
  }

  async markSucceeded(jobId: string, claimToken: string, result: Record<string, unknown> = {}) {
    const now = this.clock();
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(jobRuns)
        .set({
          status: 'succeeded',
          result,
          error: {},
          claimToken: null,
          leaseExpiresAt: null,
          lockedAt: null,
          lockedBy: null,
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobRuns.id, jobId),
            eq(jobRuns.status, 'running'),
            eq(jobRuns.claimToken, claimToken),
            gt(jobRuns.leaseExpiresAt, now),
          ),
        )
        .returning();
      if (updated)
        await tx
          .update(jobAttempts)
          .set({ status: 'succeeded', finishedAt: now })
          .where(eq(jobAttempts.claimToken, claimToken));
      return updated ?? null;
    });
  }

  private async failOwned(
    tx: Parameters<Parameters<DbExecutor['transaction']>[0]>[0],
    job: typeof jobRuns.$inferSelect,
    error: unknown,
    timedOut = false,
  ) {
    const now = this.clock();
    const failure = serializeError(error);
    const status: JobRunStatus =
      !failure.retryable || job.attempts >= job.maxAttempts ? 'dead' : 'pending';
    const ownership = job.claimToken
      ? eq(jobRuns.claimToken, job.claimToken)
      : isNull(jobRuns.claimToken);
    const [updated] = await tx
      .update(jobRuns)
      .set({
        status,
        error: failure,
        claimToken: null,
        leaseExpiresAt: null,
        lockedAt: null,
        lockedBy: null,
        availableAt:
          status === 'pending'
            ? new Date(now.getTime() + computeJobBackoffMs(job.attempts))
            : job.availableAt,
        finishedAt: status === 'dead' ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobRuns.id, job.id),
          eq(jobRuns.status, 'running'),
          ownership,
          timedOut ? undefined : gt(jobRuns.leaseExpiresAt, now),
        ),
      )
      .returning();
    if (updated && job.claimToken)
      await tx
        .update(jobAttempts)
        .set({ status: timedOut ? 'timed_out' : 'failed', error: failure, finishedAt: now })
        .where(eq(jobAttempts.claimToken, job.claimToken));
    return updated ?? null;
  }

  async markFailed(job: typeof jobRuns.$inferSelect, error: unknown) {
    if (!job.claimToken) return null;
    return this.db.transaction((tx) => this.failOwned(tx, job, error));
  }

  async retry(jobId: string) {
    const now = this.clock();
    const [updated] = await this.db
      .update(jobRuns)
      .set({
        status: 'pending',
        availableAt: now,
        maxAttempts: sql`greatest(${jobRuns.maxAttempts}, ${jobRuns.attempts} + 1)`,
        claimToken: null,
        leaseExpiresAt: null,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        error: {},
        updatedAt: now,
      })
      .where(
        and(eq(jobRuns.id, jobId), or(eq(jobRuns.status, 'failed'), eq(jobRuns.status, 'dead'))),
      )
      .returning();
    if (!updated) throw httpError(409, 'Only failed or dead jobs can be retried');
    return updated;
  }

  async recoverStaleRunningJobs(timeoutMs: number, _workerId: string) {
    const now = this.clock();
    return this.db.transaction(async (tx) => {
      const staleJobs = await tx
        .select()
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.status, 'running'),
            or(
              lte(jobRuns.leaseExpiresAt, now),
              and(
                isNull(jobRuns.leaseExpiresAt),
                lte(jobRuns.lockedAt, new Date(now.getTime() - timeoutMs)),
              ),
            ),
          ),
        )
        .limit(100)
        .for('update', { skipLocked: true });
      for (const job of staleJobs)
        await this.failOwned(tx, job, new Error('Job lease expired'), true);
      return staleJobs.length;
    });
  }

  async pruneCompleted(retentionDays: number) {
    const cutoff = new Date(this.clock().getTime() - retentionDays * 86400000);
    const expired = await this.db
      .select({ id: jobRuns.id })
      .from(jobRuns)
      .where(and(inArray(jobRuns.status, ['succeeded', 'dead']), lte(jobRuns.finishedAt, cutoff)))
      .limit(1000);
    if (expired.length)
      await this.db.delete(jobRuns).where(
        inArray(
          jobRuns.id,
          expired.map((item) => item.id),
        ),
      );
    return expired.length;
  }
}
