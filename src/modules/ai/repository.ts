import { acquireTransactionLock } from '../../db/locks';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { aiUsageEvents } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export type AiUsageSummary = {
  requestCount: number;
  requestChars: number;
  responseChars: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export class AiRepository {
  constructor(private readonly db: DbExecutor) {}

  async summarizeUsageWindow(userId: string, appId: string, since: Date): Promise<AiUsageSummary> {
    const [row] = await this.db
      .select({
        requestCount: sql<number>`count(*)::int`,
        requestChars: sql<number>`coalesce(sum(${aiUsageEvents.requestChars}), 0)::int`,
        responseChars: sql<number>`coalesce(sum(${aiUsageEvents.responseChars}), 0)::int`,
        promptTokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${aiUsageEvents.completionTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${aiUsageEvents.totalTokens}), 0)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.userId, userId),
          eq(aiUsageEvents.appId, appId),
          inArray(aiUsageEvents.status, ['pending', 'succeeded']),
          gte(aiUsageEvents.createdAt, since),
        ),
      );

    return {
      requestCount: row?.requestCount ?? 0,
      requestChars: row?.requestChars ?? 0,
      responseChars: row?.responseChars ?? 0,
      promptTokens: row?.promptTokens ?? 0,
      completionTokens: row?.completionTokens ?? 0,
      totalTokens: row?.totalTokens ?? 0,
    };
  }

  async lockQuota(userId: string, appCode: string) {
    await acquireTransactionLock(this.db, `ai-quota:${userId}:${appCode}`);
  }
  async finishUsageEvent(
    id: string,
    input: Pick<
      typeof aiUsageEvents.$inferInsert,
      | 'status'
      | 'model'
      | 'responseChars'
      | 'promptTokens'
      | 'completionTokens'
      | 'totalTokens'
      | 'meta'
    >,
  ) {
    const [row] = await this.db
      .update(aiUsageEvents)
      .set(input)
      .where(and(eq(aiUsageEvents.id, id), eq(aiUsageEvents.status, 'pending')))
      .returning();
    if (!row) throw new Error('AI quota reservation was already finalized');
    return row;
  }

  async createUsageEvent(input: {
    userId: string;
    appId: string;
    provider: string;
    model: string;
    operation: string;
    accessScope: 'trial' | 'entitled';
    status: 'pending' | 'succeeded' | 'failed';
    requestChars: number;
    responseChars: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    meta?: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(aiUsageEvents)
      .values({
        userId: input.userId,
        appId: input.appId,
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        accessScope: input.accessScope,
        status: input.status,
        requestChars: input.requestChars,
        responseChars: input.responseChars,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        meta: input.meta ?? {},
        createdAt: new Date(),
      })
      .returning();
    if (!row) throw new Error('Missing required write result: ai row');

    return row;
  }
}
