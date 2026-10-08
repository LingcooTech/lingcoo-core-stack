import { hasPendingSoftwareRefund } from './refund-guard';
import { and, desc, eq } from 'drizzle-orm';
import { hostingFulfillments, orders } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { hostingLicenseAccess } from '../license/public';
import type { HostingTermsFactory } from '../deployment/public';
import { HostingPurchases } from './hosting-purchases';
import { httpError } from '../../lib/errors';
export class HostingFulfillments {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock = () => new Date(),
    private readonly createHostingTerms?: HostingTermsFactory,
  ) {}
  async fulfill(order: typeof orders.$inferSelect) {
    const item = order.items.find((i) => i.kind === 'hosting');
    const target = item?.hostingTerms?.target;
    if (!item || !target) {
      await new HostingPurchases(this.db).issue(order);
      return;
    }
    const [existing] = await this.db
      .select()
      .from(hostingFulfillments)
      .where(eq(hostingFulfillments.orderId, order.id));
    if (existing) return;
    const license = hostingLicenseAccess(this.db);
    await license.lock(target.entitlementId);
    const entitlement = await license.find(target.entitlementId);
    const now = this.clock();
    let result: { status: 'applied' | 'review'; reason: string; before?: unknown; after?: unknown };
    if (
      !entitlement ||
      entitlement.userId !== order.userId ||
      entitlement.appId !== order.appId ||
      entitlement.planId !== order.planId ||
      entitlement.status !== 'active' ||
      (await hasPendingSoftwareRefund(this.db, entitlement)) ||
      (entitlement.startsAt && entitlement.startsAt > now) ||
      (entitlement.expiresAt && entitlement.expiresAt <= now)
    ) {
      result = { status: 'review', reason: '付款后软件授权已失效，请联系平台处理' };
    } else if (target.kind === 'renewal') {
      if (!this.createHostingTerms) throw new Error('Hosting terms factory missing');
      result = await this.createHostingTerms(this.db, this.clock).applyPaidRenewal({
        ...target,
        userId: order.userId,
        orderId: order.id,
        item,
      });
    } else {
      await new HostingPurchases(this.db).issue(order);
      result = { status: 'applied', reason: '托管服务已购买，可在部署时使用' };
    }
    await this.db.insert(hostingFulfillments).values({ orderId: order.id, ...result });
  }
  async assertRefundable(orderId: string) {
    const [row] = await this.db
      .select({ status: hostingFulfillments.status, items: orders.items })
      .from(hostingFulfillments)
      .innerJoin(orders, eq(orders.id, hostingFulfillments.orderId))
      .where(eq(orders.id, orderId));
    if (
      row?.status === 'applied' &&
      row.items.some((i) => i.hostingTerms?.target?.kind === 'renewal')
    )
      throw httpError(409, '已履约续费须通过服务终止与分项退款流程处理');
  }
  async revoke(orderId: string) {
    await this.db
      .update(hostingFulfillments)
      .set({ status: 'revoked', reason: '订单已退款' })
      .where(eq(hostingFulfillments.orderId, orderId));
  }
  async list(userId?: string, orderNo?: string) {
    if (!userId && !orderNo) throw httpError(400, '需要用户或订单范围');
    const rows = await this.db
      .select({
        record: hostingFulfillments,
        orderNo: orders.orderNo,
        appId: orders.appId,
        items: orders.items,
      })
      .from(hostingFulfillments)
      .innerJoin(orders, eq(orders.id, hostingFulfillments.orderId))
      .where(
        and(
          userId ? eq(orders.userId, userId) : undefined,
          orderNo ? eq(orders.orderNo, orderNo) : undefined,
        ),
      )
      .orderBy(desc(hostingFulfillments.createdAt))
      .limit(100);
    return {
      items: rows.map(({ record, orderNo, appId, items }) => ({
        orderId: record.orderId,
        orderNo,
        appId,
        status: record.status,
        reason: record.reason,
        target: items.find((i) => i.kind === 'hosting')!.hostingTerms!.target!,
        before: record.before,
        after: record.after,
        createdAt: record.createdAt.toISOString(),
      })),
    };
  }
}
