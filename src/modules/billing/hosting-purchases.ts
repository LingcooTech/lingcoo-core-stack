import { assertNoItemRefunds } from './refund-guard';
import { and, desc, eq } from 'drizzle-orm';
import { OrderItemSchema } from '@lingcoo/contracts';
import { hostingPurchases, orders, apps } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';

/** All writes run in the caller's payment/deployment transaction. Lock order before entitlement. */
export class HostingPurchases {
  constructor(private readonly db: DbExecutor) {}
  async issue(order: typeof orders.$inferSelect) {
    const item = order.items.find((i) => i.kind === 'hosting');
    if (!item) return;
    if (order.status !== 'paid') throw httpError(409, '托管资格需要已支付订单');
    await this.db
      .insert(hostingPurchases)
      .values({
        orderId: order.id,
        userId: order.userId,
        appId: order.appId,
        item: OrderItemSchema.parse(item),
      })
      .onConflictDoNothing({ target: hostingPurchases.orderId });
  }
  async list(userId: string) {
    const rows = await this.db
      .select({ purchase: hostingPurchases, appCode: apps.code })
      .from(hostingPurchases)
      .innerJoin(apps, eq(apps.id, hostingPurchases.appId))
      .where(eq(hostingPurchases.userId, userId))
      .orderBy(desc(hostingPurchases.createdAt));
    return {
      items: rows.map(({ purchase: row, appCode }) => ({
        ...row,
        appCode,
        item: OrderItemSchema.parse(row.item),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async lockForBinding(id: string, userId: string) {
    const [purchase] = await this.db
      .select()
      .from(hostingPurchases)
      .where(and(eq(hostingPurchases.id, id), eq(hostingPurchases.userId, userId)));
    if (!purchase) throw httpError(404, '未找到托管资格');
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, purchase.orderId))
      .for('update');
    const [current] = await this.db
      .select()
      .from(hostingPurchases)
      .where(eq(hostingPurchases.id, id))
      .for('update');
    if (!order || order.status !== 'paid' || !current || current.status !== 'available')
      throw httpError(409, '托管资格已使用或正在退款');
    return { ...current, item: OrderItemSchema.parse(current.item) };
  }
  async bind(
    id: string,
    deploymentId: string,
    appId: string,
    userId: string,
    entitlementId?: string,
  ) {
    const purchase = await this.lockForBinding(id, userId);
    const target = purchase.item.hostingTerms?.target;
    if (target && (target.kind !== 'new' || target.entitlementId !== entitlementId))
      throw httpError(409, '托管购买与所选软件授权不匹配');
    if (purchase.appId !== appId) throw httpError(409, '托管资格与应用不匹配');
    await this.db
      .update(hostingPurchases)
      .set({ status: 'bound', deploymentId, updatedAt: new Date() })
      .where(eq(hostingPurchases.id, id));
    return purchase;
  }
  async reserveRefund(orderId: string) {
    const [order] = await this.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update');
    const [purchase] = await this.db
      .select()
      .from(hostingPurchases)
      .where(eq(hostingPurchases.orderId, orderId))
      .for('update');
    await assertNoItemRefunds(this.db, orderId);
    if (order?.status === 'refunding') return 'pending' as const;
    if (!order || order.status !== 'paid') throw httpError(409, '订单状态已变化');
    if (!purchase) {
      await this.db
        .update(orders)
        .set({ status: 'refunding', updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      return 'reserved' as const;
    }
    if (purchase.status === 'refund_pending') return 'pending' as const;
    if (purchase.status === 'revoked') throw httpError(409, '托管资格已退款撤销');
    if (purchase.status === 'bound')
      throw httpError(409, '托管已绑定部署，请先联系平台处理托管终止与分项退款');
    if (purchase.status === 'available')
      await this.db
        .update(hostingPurchases)
        .set({ status: 'refund_pending', updatedAt: new Date() })
        .where(eq(hostingPurchases.id, purchase.id));
    await this.db
      .update(orders)
      .set({ status: 'refunding', updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    return 'reserved' as const;
  }
  async settleRefund(orderId: string, refunded: boolean) {
    if (!refunded)
      await this.db
        .update(orders)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'refunding')));
    await this.db
      .update(hostingPurchases)
      .set({ status: refunded ? 'revoked' : 'available', updatedAt: new Date() })
      .where(
        and(eq(hostingPurchases.orderId, orderId), eq(hostingPurchases.status, 'refund_pending')),
      );
  }
}
