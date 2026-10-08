import { and, asc, eq } from 'drizzle-orm';
import { ItemRefundCommandSchema, type ItemRefundCommand } from '@lingcoo/contracts';
import { orders, orderItemRefunds, hostingPurchases } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import type { BillingDependencies } from './dependencies';
import type { PaymentRefundResult, PaymentRefundQueryResult } from './providers/types';
import { PaymentSettingsService } from '../settings/public';
import { hostingLicenseAccess } from '../license/public';
import { JobRunService } from '../jobs/public';
import { HostingFulfillments } from './hosting-fulfillments';
import { httpError } from '../../lib/errors';
type Order = typeof orders.$inferSelect;
type Refund = typeof orderItemRefunds.$inferSelect;
const requestNo = (id: string) => id.replaceAll('-', '');
const metaRefund = (order: Order) => Boolean((order.meta as Record<string, unknown>)?.lastRefund);
export class ItemRefunds {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly capabilities: BillingDependencies,
  ) {}
  private async findOrder(orderNo: string, executor = this.db) {
    const [order] = await executor.select().from(orders).where(eq(orders.orderNo, orderNo));
    if (!order) throw httpError(404, '订单不存在');
    return order;
  }
  async read(orderNo: string, userId?: string) {
    const order = await this.findOrder(orderNo);
    if (userId && order.userId !== userId) throw httpError(404, '订单不存在');
    const rows = await this.db
      .select()
      .from(orderItemRefunds)
      .where(eq(orderItemRefunds.orderId, order.id))
      .orderBy(asc(orderItemRefunds.createdAt));
    const legacyRefund =
      rows.length === 0 && (metaRefund(order) || ['refunding', 'refunded'].includes(order.status));
    return {
      orderNo,
      orderStatus: order.status,
      legacyRefund,
      lines: order.items.map((item) => {
        const records = rows.filter((r) => r.kind === item.kind);
        const refunded = records
          .filter((r) => r.status === 'succeeded')
          .reduce((s, r) => s + r.amount, 0);
        const pending = records
          .filter((r) => r.status === 'pending')
          .reduce((s, r) => s + r.amount, 0);
        return {
          kind: item.kind,
          title: item.title,
          amount: item.amount,
          refunded,
          pending,
          remaining: legacyRefund ? 0 : item.amount - refunded - pending,
        };
      }),
      records: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }
  async request(orderNo: string, actorId: string, raw: ItemRefundCommand) {
    const input = ItemRefundCommandSchema.parse(raw);
    const reservation = await this.db.transaction(async (tx) => {
      const order = await this.findOrder(orderNo, tx);
      await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, order.id)).for('update');
      const current = await this.findOrder(orderNo, tx);
      const [existing] = await tx
        .select()
        .from(orderItemRefunds)
        .where(eq(orderItemRefunds.id, input.requestId));
      if (existing) {
        if (
          existing.orderId !== current.id ||
          existing.kind !== input.kind ||
          existing.amount !== input.amount ||
          existing.reason !== input.reason ||
          existing.actorId !== actorId
        )
          throw httpError(409, '退款请求标识已被其他参数使用');
        return { order: current, refund: existing, created: false };
      }
      if (current.status !== 'paid' || metaRefund(current))
        throw httpError(409, '当前订单不支持分项退款');
      const item = current.items.find((i) => i.kind === input.kind);
      if (!item) throw httpError(409, '订单缺少该购买明细；历史订单请使用原整单退款');
      const rows = await tx
        .select()
        .from(orderItemRefunds)
        .where(eq(orderItemRefunds.orderId, current.id));
      const occupied = rows
        .filter((r) => r.kind === input.kind && r.status !== 'failed')
        .reduce((s, r) => s + r.amount, 0);
      if (occupied + input.amount > item.amount) throw httpError(409, '退款金额超过该明细可退余额');
      // Only one unsettled request per line: no ambiguous entitlement restoration.
      if (rows.some((r) => r.kind === input.kind && r.status === 'pending'))
        throw httpError(409, '该明细仍有待确认退款，请先对账');
      const full = occupied + input.amount === item.amount;
      if (input.kind === 'hosting') {
        if (full) await new HostingFulfillments(tx).assertRefundable(current.id);
        const [grant] = await tx
          .select()
          .from(hostingPurchases)
          .where(eq(hostingPurchases.orderId, current.id))
          .for('update');
        if (grant?.status === 'refund_pending') throw httpError(409, '托管资格正在其他退款中');
        if (full && grant?.status === 'bound')
          throw httpError(409, '托管已绑定部署，请先完成服务终止与交接');
        if (grant?.status === 'available')
          await tx
            .update(hostingPurchases)
            .set({ status: 'refund_pending', updatedAt: new Date() })
            .where(eq(hostingPurchases.id, grant.id));
      } else {
        const license = hostingLicenseAccess(tx);
        const entitlements = await license.source(current.id);
        for (const entitlement of entitlements.sort((a, b) => a.id.localeCompare(b.id)))
          await license.lock(entitlement.id);
        if (full)
          await this.capabilities
            .createHostingTerms(tx, this.capabilities.now)
            .assertSoftwareRefundable(entitlements.map((e) => e.id));
      }
      const [refund] = await tx
        .insert(orderItemRefunds)
        .values({
          id: input.requestId,
          orderId: current.id,
          kind: input.kind,
          amount: input.amount,
          reason: input.reason,
          actorId,
        })
        .returning();
      await new JobRunService(tx, this.env).enqueue({
        kind: 'billing.item-refund.reconcile',
        payload: { orderNo, refundId: input.requestId },
        maxAttempts: 20,
        dedupeKey: `item-refund:${input.requestId}`,
        relatedEntityType: 'order',
        relatedEntityId: current.id,
        createdByUserId: actorId,
      });
      return { order: current, refund: refund!, created: true };
    });
    if (!reservation.created) {
      if (reservation.refund.status === 'pending')
        await this.reconcile(orderNo, reservation.refund.id);
      return this.read(orderNo);
    }
    try {
      const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
      const result = await this.capabilities
        .getBillingProviderAdapter(reservation.order.provider)
        .refundPayment({
          env: runtimeEnv,
          order: this.providerOrder(reservation.order),
          refund: { refundRequestNo: requestNo(reservation.refund.id), amount: input.amount },
        });
      await this.apply(reservation.order, reservation.refund, result, false);
    } catch {
      // Transport failures, signature/identity mismatches remain reserved. Query the same id; never resend.
    }
    return this.read(orderNo);
  }
  private providerOrder(order: Order) {
    return {
      orderNo: order.orderNo,
      providerOrderId: order.providerOrderId,
      amount: order.amount,
      currency: order.currency,
    };
  }
  async reconcile(orderNo: string, refundId: string, forJob = false) {
    const order = await this.findOrder(orderNo);
    const [refund] = await this.db
      .select()
      .from(orderItemRefunds)
      .where(and(eq(orderItemRefunds.id, refundId), eq(orderItemRefunds.orderId, order.id)));
    if (!refund) throw httpError(404, '退款记录不存在');
    if (refund.status === 'pending') {
      const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
      const result = await this.capabilities
        .getBillingProviderAdapter(order.provider)
        .queryRefundPayment({
          env: runtimeEnv,
          order: this.providerOrder(order),
          refund: {
            refundRequestNo: requestNo(refund.id),
            refundId: refund.providerRefundId,
            amount: refund.amount,
          },
        });
      await this.apply(order, refund, result, true);
    }
    const ledger = await this.read(orderNo);
    if (forJob && ledger.records.find((r) => r.id === refundId)?.status === 'pending')
      throw httpError(409, '退款结果尚未确认，继续对账');
    return ledger;
  }
  private async apply(
    order: Order,
    refund: Refund,
    result: PaymentRefundResult | PaymentRefundQueryResult,
    query: boolean,
  ) {
    if (
      result.provider !== order.provider ||
      result.orderNo !== order.orderNo ||
      (result.providerOrderId &&
        order.providerOrderId &&
        result.providerOrderId !== order.providerOrderId)
    )
      throw httpError(409, '退款响应订单不匹配');
    if (result.kind === 'not_found') return; // A query before submission or delayed visibility is not proof of failure.
    if (result.kind === 'refunded' || result.kind === 'processing') {
      if (
        result.refundRequestNo !== requestNo(refund.id) ||
        result.amount !== refund.amount ||
        result.currency !== order.currency
      )
        throw httpError(409, '退款响应编号或金额不匹配');
    } else {
      // Definitive refusal from initial submission, or a verified terminal failure from query.
      if ((result.kind === 'failed' && !query) || result.refundRequestNo !== requestNo(refund.id))
        throw httpError(409, '退款失败响应编号不匹配');
    }
    await this.db.transaction(async (tx) => {
      await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, order.id)).for('update');
      const [current] = await tx
        .select()
        .from(orderItemRefunds)
        .where(eq(orderItemRefunds.id, refund.id))
        .for('update');
      if (!current || current.status !== 'pending') return;
      const status =
        result.kind === 'refunded'
          ? 'succeeded'
          : result.kind === 'processing'
            ? 'pending'
            : 'failed';
      await tx
        .update(orderItemRefunds)
        .set({
          status,
          providerRefundId: result.refundId ?? current.providerRefundId,
          updatedAt: new Date(),
        })
        .where(eq(orderItemRefunds.id, refund.id));
      if (status === 'pending') return;
      const succeeded = await tx
        .select()
        .from(orderItemRefunds)
        .where(
          and(eq(orderItemRefunds.orderId, order.id), eq(orderItemRefunds.status, 'succeeded')),
        );
      const lineTotal = succeeded
        .filter((r) => r.kind === refund.kind)
        .reduce((s, r) => s + r.amount, 0);
      const full = lineTotal === order.items.find((i) => i.kind === refund.kind)!.amount;
      if (refund.kind === 'hosting') {
        await tx
          .update(hostingPurchases)
          .set({ status: full ? 'revoked' : 'available', updatedAt: new Date() })
          .where(
            and(
              eq(hostingPurchases.orderId, order.id),
              eq(hostingPurchases.status, 'refund_pending'),
            ),
          );
        if (full) await new HostingFulfillments(tx).revoke(order.id);
      } else if (full) {
        await this.capabilities
          .createLicenseAccess(tx)
          .cancelEntitlementsBySource('order', order.id);
      }
      if (succeeded.reduce((s, r) => s + r.amount, 0) === order.amount)
        await tx
          .update(orders)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      await this.capabilities.createEventService(tx).capture({
        userId: order.userId,
        appId: order.appId,
        eventName: `billing.item_refund_${status}`,
        properties: {
          orderNo: order.orderNo,
          refundId: refund.id,
          kind: refund.kind,
          amount: refund.amount,
          actorId: refund.actorId,
        },
      });
    });
  }
}
