import { desc, eq } from 'drizzle-orm';

import { orders } from '../../db/schema';
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

  async listOrdersByUserId(userId: string) {
    return this.db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async markOrderPaid(orderId: string, providerOrderId?: string | null, meta?: Record<string, unknown>) {
    const [order] = await this.db
      .update(orders)
      .set({
        status: 'paid',
        providerOrderId: providerOrderId ?? null,
        paidAt: new Date(),
        updatedAt: new Date(),
        meta: meta ?? {}
      })
      .where(eq(orders.id, orderId))
      .returning();

    return order;
  }
}
