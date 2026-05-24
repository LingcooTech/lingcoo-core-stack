import { and, asc, desc, eq, ilike, lte, or, sql } from 'drizzle-orm';

import { jobRuns, users } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';
import { httpError } from './errors';
import { Mailer } from './mailer';
import { SmtpSettingsService } from './smtp-settings';

export type JobRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead';
export type JobRunKind = 'email.deliver';

export interface MailDeliveryJobPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
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

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Unknown job failure',
    stack: null,
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
    private readonly db: DbClient,
    private readonly env?: AppEnv,
  ) {}

  async enqueue(input: EnqueueJobInput) {
    const now = new Date();
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
        meta: input.meta ?? {},
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

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ item: jobRuns })
        .from(jobRuns)
        .leftJoin(users, eq(jobRuns.createdByUserId, users.id))
        .where(where)
        .orderBy(desc(jobRuns.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobRuns)
        .leftJoin(users, eq(jobRuns.createdByUserId, users.id))
        .where(where),
    ]);

    return {
      items: rows.map((row) => row.item),
      total: countResult[0]?.count ?? 0,
    };
  }

  async claimNext(workerId: string) {
    const now = new Date();
    const candidates = await this.db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.status, 'pending'), lte(jobRuns.availableAt, now)))
      .orderBy(asc(jobRuns.priority), asc(jobRuns.availableAt), asc(jobRuns.createdAt))
      .limit(10);

    for (const candidate of candidates) {
      const [claimed] = await this.db
        .update(jobRuns)
        .set({
          status: 'running',
          attempts: candidate.attempts + 1,
          lockedAt: now,
          lockedBy: workerId,
          startedAt: now,
          updatedAt: now,
        })
        .where(and(eq(jobRuns.id, candidate.id), eq(jobRuns.status, 'pending')))
        .returning();

      if (claimed) {
        return claimed;
      }
    }

    return null;
  }

  async markSucceeded(jobId: string, result: Record<string, unknown> = {}) {
    const now = new Date();
    const [updated] = await this.db
      .update(jobRuns)
      .set({
        status: 'succeeded',
        result,
        error: {},
        lockedAt: null,
        lockedBy: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(jobRuns.id, jobId))
      .returning();

    return updated ?? null;
  }

  async markFailed(job: typeof jobRuns.$inferSelect, error: unknown) {
    const now = new Date();
    const nextStatus: JobRunStatus = job.attempts >= job.maxAttempts ? 'dead' : 'failed';
    const availableAt =
      nextStatus === 'dead'
        ? job.availableAt
        : new Date(now.getTime() + computeJobBackoffMs(job.attempts));
    const [updated] = await this.db
      .update(jobRuns)
      .set({
        status: nextStatus,
        error: serializeError(error),
        lockedAt: null,
        lockedBy: null,
        availableAt,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(jobRuns.id, job.id))
      .returning();

    return updated ?? null;
  }

  async retry(jobId: string) {
    const [existing] = await this.db.select().from(jobRuns).where(eq(jobRuns.id, jobId)).limit(1);
    if (!existing) {
      throw httpError(404, 'Job not found');
    }

    if (!['failed', 'dead'].includes(existing.status)) {
      throw httpError(409, 'Only failed or dead jobs can be retried');
    }

    const now = new Date();
    const [updated] = await this.db
      .update(jobRuns)
      .set({
        status: 'pending',
        availableAt: now,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        error: {},
        updatedAt: now,
      })
      .where(eq(jobRuns.id, jobId))
      .returning();

    return updated ?? null;
  }

  async recoverStaleRunningJobs(timeoutMs: number, workerId: string) {
    const staleBefore = new Date(Date.now() - timeoutMs);
    const staleJobs = await this.db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.status, 'running'), lte(jobRuns.lockedAt, staleBefore)))
      .limit(100);

    for (const job of staleJobs) {
      await this.markFailed(
        { ...job, lockedBy: workerId },
        new Error(`Job timed out after ${timeoutMs}ms`),
      );
    }

    return staleJobs.length;
  }

  private async buildMailer() {
    if (!this.env) {
      return new Mailer();
    }

    const config = await new SmtpSettingsService(this.db, this.env).getRuntimeSettings();
    return new Mailer(
      config && config.password
        ? {
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.user,
            password: config.password,
            from: config.from,
          }
        : null,
    );
  }

  async process(job: typeof jobRuns.$inferSelect) {
    switch (job.kind) {
      case 'email.deliver': {
        const raw = normalizeObject(job.payload);
        const payload: MailDeliveryJobPayload = {
          to: normalizeString(raw.to),
          subject: normalizeString(raw.subject),
          text: normalizeString(raw.text),
          html: normalizeString(raw.html) || undefined,
        };
        const mailer = await this.buildMailer();
        if (!mailer.isConfigured) {
          throw httpError(503, 'SMTP is not configured');
        }
        await mailer.send({
          to: normalizeString(payload.to),
          subject: normalizeString(payload.subject),
          text: normalizeString(payload.text),
          html: normalizeString(payload.html) || undefined,
        });
        return {
          ok: true,
          channel: 'smtp',
          to: normalizeString(payload.to).toLowerCase(),
        };
      }
      default:
        throw httpError(400, `Unsupported job kind: ${job.kind}`);
    }
  }
}
