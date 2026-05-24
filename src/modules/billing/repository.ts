import { and, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';

import { apps, billingWebhookEvents, orders, plans, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class BillingRepository {
  constructor(private readonly db: DbExecutor) {}

  async createOrder(input: {
    userId: string;
    appId: string;
    planId: string;
    orderNo: string;
    provider: 'wechat_pay' | 'alipay';
    subject: string;
    amount: number;
    currency: string;
    meta?: Record<string, unknown>;
  }) {
    const [order] = await this.db
      .insert(orders)
      .values({
        ...input,
        meta: input.meta ?? {},
      })
      .returning();

    return order;
  }

  async findOrderByOrderNo(orderNo: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1);
    return order ?? null;
  }

  async findOrderById(id: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return order ?? null;
  }

  async listOrdersByUserId(userId: string) {
    return this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async listRecentOrders(limit = 50) {
    return this.db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
  }

  async listOrders(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded';
    provider?: 'wechat_pay' | 'alipay';
  }) {
    const conditions = [];

    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }

    if (query.provider) {
      conditions.push(eq(orders.provider, query.provider));
    }

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(orders.orderNo, pattern),
          ilike(orders.providerOrderId, pattern),
          ilike(orders.subject, pattern),
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
          ilike(apps.code, pattern),
          ilike(apps.name, pattern),
          ilike(plans.code, pattern),
          ilike(plans.name, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ item: orders })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(apps, eq(orders.appId, apps.id))
        .leftJoin(plans, eq(orders.planId, plans.id))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(apps, eq(orders.appId, apps.id))
        .leftJoin(plans, eq(orders.planId, plans.id))
        .where(where),
    ]);

    return {
      items: rows.map((row) => row.item),
      total: countResult[0]?.count ?? 0,
    };
  }

  async listOrdersByIds(orderIds: string[]) {
    if (orderIds.length === 0) {
      return [];
    }

    return this.db.select().from(orders).where(inArray(orders.id, orderIds));
  }

  async listRecentWebhookEvents(limit = 50) {
    return this.db
      .select()
      .from(billingWebhookEvents)
      .orderBy(desc(billingWebhookEvents.createdAt))
      .limit(limit);
  }

  async listWebhookEvents(query: { limit: number; offset: number; search?: string }) {
    const conditions = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(billingWebhookEvents.provider, pattern),
          ilike(billingWebhookEvents.type, pattern),
          ilike(billingWebhookEvents.providerEventId, pattern),
          ilike(billingWebhookEvents.status, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(billingWebhookEvents)
        .where(where)
        .orderBy(desc(billingWebhookEvents.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(billingWebhookEvents)
        .where(where),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
    };
  }

  async markOrderPaidIfUnpaid(input: {
    orderId: string;
    providerOrderId?: string | null;
    paidAt?: Date;
    meta?: Record<string, unknown>;
  }) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'paid',
        providerOrderId: input.providerOrderId ?? null,
        paidAt: input.paidAt ?? new Date(),
        updatedAt: new Date(),
        meta: input.meta ?? {},
      })
      .where(and(eq(orders.id, input.orderId), ne(orders.status, 'paid')))
      .returning();

    return order ?? null;
  }

  async markOrderCancelledIfPending(input: { orderId: string; meta?: Record<string, unknown> }) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
        meta: input.meta ?? {},
      })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'pending')))
      .returning();

    return order ?? null;
  }

  async markOrderRefundedIfPaid(input: { orderId: string; meta?: Record<string, unknown> }) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'refunded',
        updatedAt: new Date(),
        meta: input.meta ?? {},
      })
      .where(and(eq(orders.id, input.orderId), inArray(orders.status, ['paid', 'refunding'])))
      .returning();

    return order ?? null;
  }

  async markOrderRefundingIfPaid(input: { orderId: string; meta?: Record<string, unknown> }) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'refunding',
        updatedAt: new Date(),
        meta: input.meta ?? {},
      })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'paid')))
      .returning();

    return order ?? null;
  }

  async markOrderRefundedIfRefundingOrPaid(input: {
    orderId: string;
    meta?: Record<string, unknown>;
  }) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'refunded',
        updatedAt: new Date(),
        meta: input.meta ?? {},
      })
      .where(and(eq(orders.id, input.orderId), inArray(orders.status, ['paid', 'refunding'])))
      .returning();

    return order ?? null;
  }

  async markOrderPaidIfRefunding(input: { orderId: string; meta?: Record<string, unknown> }) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'paid',
        updatedAt: new Date(),
        meta: input.meta ?? {},
      })
      .where(and(eq(orders.id, input.orderId), eq(orders.status, 'refunding')))
      .returning();

    return order ?? null;
  }

  async createWebhookEventIfAbsent(input: {
    provider: 'wechat_pay' | 'alipay';
    providerEventId: string;
    type: string;
    payload: Record<string, unknown>;
  }) {
    const [event] = await this.db
      .insert(billingWebhookEvents)
      .values({
        ...input,
        payload: input.payload,
      })
      .onConflictDoNothing({
        target: [billingWebhookEvents.provider, billingWebhookEvents.providerEventId],
      })
      .returning();

    return event ?? null;
  }

  async findWebhookEvent(provider: 'wechat_pay' | 'alipay', providerEventId: string) {
    const [event] = await this.db
      .select()
      .from(billingWebhookEvents)
      .where(
        and(
          eq(billingWebhookEvents.provider, provider),
          eq(billingWebhookEvents.providerEventId, providerEventId),
        ),
      )
      .limit(1);

    return event ?? null;
  }

  async markWebhookProcessed(id: string) {
    const [event] = await this.db
      .update(billingWebhookEvents)
      .set({
        processedAt: new Date(),
      })
      .where(eq(billingWebhookEvents.id, id))
      .returning();

    return event ?? null;
  }
}
