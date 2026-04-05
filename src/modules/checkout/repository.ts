import { and, desc, eq, gte, inArray, ne, or, isNull } from 'drizzle-orm';

import { checkoutSessions, paymentAttempts } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class CheckoutRepository {
  constructor(private readonly db: DbExecutor) {}

  async createSession(input: {
    sessionCode: string;
    userId: string;
    appId: string;
    productId: string;
    planId: string;
    orderId: string;
    provider: 'wechat_pay' | 'alipay';
    status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
    actionType: 'qr_code' | 'redirect_url';
    actionPayload: Record<string, unknown>;
    successUrl?: string;
    cancelUrl?: string;
    expiresAt?: Date;
    completedAt?: Date;
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [session] = await this.db
      .insert(checkoutSessions)
      .values({
        sessionCode: input.sessionCode,
        userId: input.userId,
        appId: input.appId,
        productId: input.productId,
        planId: input.planId,
        orderId: input.orderId,
        provider: input.provider,
        status: input.status ?? 'pending',
        actionType: input.actionType,
        actionPayload: input.actionPayload,
        successUrl: input.successUrl ?? null,
        cancelUrl: input.cancelUrl ?? null,
        expiresAt: input.expiresAt ?? null,
        completedAt: input.completedAt ?? null,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return session;
  }

  async createPaymentAttempt(input: {
    checkoutSessionId: string;
    orderId: string;
    attemptNo?: number;
    provider: 'wechat_pay' | 'alipay';
    actionType: 'qr_code' | 'redirect_url';
    status?: 'prepared' | 'paid' | 'failed' | 'cancelled';
    providerReference?: string | null;
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [attempt] = await this.db
      .insert(paymentAttempts)
      .values({
        checkoutSessionId: input.checkoutSessionId,
        orderId: input.orderId,
        attemptNo: input.attemptNo ?? 1,
        provider: input.provider,
        actionType: input.actionType,
        status: input.status ?? 'prepared',
        providerReference: input.providerReference ?? null,
        requestPayload: input.requestPayload ?? {},
        responsePayload: input.responsePayload ?? {},
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return attempt;
  }

  async findSessionByCode(sessionCode: string) {
    const [session] = await this.db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.sessionCode, sessionCode))
      .limit(1);

    return session ?? null;
  }

  async findLatestReusablePendingSession(input: {
    userId: string;
    appId: string;
    planId: string;
    provider: 'wechat_pay' | 'alipay';
  }) {
    const [session] = await this.db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.userId, input.userId),
          eq(checkoutSessions.appId, input.appId),
          eq(checkoutSessions.planId, input.planId),
          eq(checkoutSessions.provider, input.provider),
          eq(checkoutSessions.status, 'pending'),
          or(isNull(checkoutSessions.expiresAt), gte(checkoutSessions.expiresAt, new Date()))
        )
      )
      .orderBy(desc(checkoutSessions.createdAt))
      .limit(1);

    return session ?? null;
  }

  async listSessionsByOrderIds(orderIds: string[]) {
    if (orderIds.length === 0) {
      return [];
    }

    return this.db.select().from(checkoutSessions).where(inArray(checkoutSessions.orderId, orderIds));
  }

  async listPaymentAttemptsByOrderIds(orderIds: string[]) {
    if (orderIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(paymentAttempts)
      .where(inArray(paymentAttempts.orderId, orderIds))
      .orderBy(desc(paymentAttempts.createdAt));
  }

  async markSessionPaidByOrderId(orderId: string, completedAt: Date) {
    const [session] = await this.db
      .update(checkoutSessions)
      .set({
        status: 'paid',
        completedAt,
        updatedAt: new Date()
      })
      .where(and(eq(checkoutSessions.orderId, orderId), ne(checkoutSessions.status, 'paid')))
      .returning();

    return session ?? null;
  }

  async markPaymentAttemptsPaidByOrderId(orderId: string, providerReference?: string | null) {
    return this.db
      .update(paymentAttempts)
      .set({
        status: 'paid',
        providerReference: providerReference ?? null,
        updatedAt: new Date()
      })
      .where(eq(paymentAttempts.orderId, orderId))
      .returning();
  }
}
