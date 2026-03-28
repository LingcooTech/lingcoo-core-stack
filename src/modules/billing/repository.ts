import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { billingWebhookEvents, orders } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class BillingRepository {
  constructor(private readonly db: DbExecutor) {}

  async createOrder(input: {
    userId: string;
    productId: string;
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
        meta: input.meta ?? {}
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
    return this.db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async listRecentOrders(limit = 50) {
    return this.db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
  }

  async listOrdersByIds(orderIds: string[]) {
    if (orderIds.length === 0) {
      return [];
    }

    return this.db.select().from(orders).where(inArray(orders.id, orderIds));
  }

  async listRecentWebhookEvents(limit = 50) {
    return this.db.select().from(billingWebhookEvents).orderBy(desc(billingWebhookEvents.createdAt)).limit(limit);
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
        meta: input.meta ?? {}
      })
      .where(and(eq(orders.id, input.orderId), ne(orders.status, 'paid')))
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
        payload: input.payload
      })
      .onConflictDoNothing({
        target: [billingWebhookEvents.provider, billingWebhookEvents.providerEventId]
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
          eq(billingWebhookEvents.providerEventId, providerEventId)
        )
      )
      .limit(1);

    return event ?? null;
  }

  async markWebhookProcessed(id: string) {
    const [event] = await this.db
      .update(billingWebhookEvents)
      .set({
        processedAt: new Date()
      })
      .where(eq(billingWebhookEvents.id, id))
      .returning();

    return event ?? null;
  }
}
