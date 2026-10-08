import { HostingPurchases } from './hosting-purchases';
import { pickBillingDependencies, type BillingDependencies } from './dependencies';
import type { AppEnv } from '../../lib/env';

import { httpError } from '../../lib/errors';

import { PaymentSettingsService } from '../settings/public';

import type { DbExecutor } from '../../db/types';
import { JobRunService } from '../../lib/job-runs';

import type { PaymentRefundQueryResult, PaymentRefundResult } from './providers/types';
import { BillingRepository } from './repository';

type BillingOrder = NonNullable<Awaited<ReturnType<BillingRepository['findOrderByOrderNo']>>>;

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export class BillingRefundUseCases {
  protected readonly capabilities: BillingDependencies;
  constructor(
    capabilities: BillingDependencies,
    protected readonly db: DbExecutor,
    protected readonly env: AppEnv,
  ) {
    this.capabilities = pickBillingDependencies(capabilities);
  }
  async refundOrderByOrderNo(orderNo: string) {
    const repository = new BillingRepository(this.db);
    const order = await repository.findOrderByOrderNo(orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.status === 'refunding') {
      return this.reconcileRefundRecord(order);
    }

    if (order.status !== 'paid') {
      throw httpError(409, `Only paid orders can be refunded (current: ${order.status})`);
    }

    const reservation = await this.db.transaction((tx) =>
      new HostingPurchases(tx).reserveRefund(order.id),
    );
    // Another request may have reached the provider. Query the stable refund id instead of sending twice.
    if (reservation === 'pending') return this.reconcileRefundRecord(order);

    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = this.capabilities.getBillingProviderAdapter(order.provider);
    const refundResult = await providerAdapter.refundPayment({
      env: runtimeEnv,
      order: {
        orderNo: order.orderNo,
        providerOrderId: order.providerOrderId,
        amount: order.amount,
        currency: order.currency,
      },
    });

    if (refundResult.kind === 'not_found') {
      await new HostingPurchases(this.db).settleRefund(order.id, false);
      throw httpError(404, refundResult.reason);
    }

    if (refundResult.kind === 'not_refundable') {
      await new HostingPurchases(this.db).settleRefund(order.id, false);
      throw httpError(409, refundResult.reason);
    }

    if (refundResult.kind !== 'refunded' && refundResult.kind !== 'processing') {
      throw httpError(500, 'Unexpected refund result');
    }

    this.assertFullOrderRefund(order, refundResult);
    return this.applyRefundResult(order, refundResult);
  }

  async reconcileRefundByOrderNo(orderNo: string, options: { forJob?: boolean } = {}) {
    const order = await new BillingRepository(this.db).findOrderByOrderNo(orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.status === 'refunded') {
      return {
        changed: false,
        order,
        action: {
          status: 'refunded' as const,
          reason: 'Order already marked as refunded',
          refundId: this.getRefundMeta(order.meta).refundId ?? null,
        },
      };
    }

    if (order.status !== 'refunding') {
      throw httpError(409, `Only refunding orders can be reconciled (current: ${order.status})`);
    }

    const result = await this.reconcileRefundRecord(order);
    if (options.forJob && result.action.status === 'refunding') {
      throw httpError(409, result.action.reason);
    }
    return result;
  }

  private assertFullOrderRefund(
    order: BillingOrder,
    result: Extract<PaymentRefundResult, { kind: 'refunded' | 'processing' }>,
  ) {
    if (
      result.orderNo !== order.orderNo ||
      result.provider !== order.provider ||
      result.amount !== order.amount ||
      result.currency !== order.currency ||
      (result.providerOrderId &&
        order.providerOrderId &&
        result.providerOrderId !== order.providerOrderId)
    )
      throw httpError(409, 'Refund result does not match the full order; entitlements unchanged');
  }

  protected async applyRefundResult(order: BillingOrder, refundResult: PaymentRefundResult) {
    if (refundResult.kind === 'processing') {
      const updatedOrder = await this.db.transaction(async (tx) => {
        const txDb = tx;
        const orderRepository = new BillingRepository(txDb);
        const refundingOrder = await orderRepository.markOrderRefundingIfPaid({
          orderId: order.id,
          meta: {
            ...this.getOrderMeta(order.meta),
            lastRefund: this.buildRefundMeta(refundResult, 'processing'),
          },
        });
        await this.capabilities.createEventService(txDb).capture({
          userId: order.userId,
          appId: order.appId,
          eventName: 'billing.order_refund_processing',
          properties: {
            orderNo: order.orderNo,
            provider: order.provider,
            refundId: refundResult.refundId ?? null,
            refundRequestNo: refundResult.refundRequestNo ?? null,
            amount: refundResult.amount,
            currency: refundResult.currency,
            reason: refundResult.reason,
          },
        });

        await this.enqueueRefundReconciliation(order.orderNo, refundResult.refundId ?? null, tx);
        return refundingOrder;
      });

      return {
        changed: Boolean(updatedOrder),
        order: updatedOrder ?? order,
        action: {
          status: 'refunding' as const,
          reason: refundResult.reason,
          refundId: refundResult.refundId ?? null,
        },
      };
    }

    if (refundResult.kind !== 'refunded') {
      throw httpError(500, 'Unexpected refund result');
    }

    const updatedOrder = await this.db.transaction(async (tx) => {
      const txDb = tx;
      const orderRepository = new BillingRepository(txDb);
      const refundedOrder = await orderRepository.markOrderRefundedIfRefundingOrPaid({
        orderId: order.id,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastRefund: this.buildRefundMeta(refundResult, 'refunded'),
        },
      });
      await new HostingPurchases(txDb).settleRefund(order.id, true);
      await this.capabilities
        .createLicenseAccess(txDb)
        .cancelEntitlementsBySource('order', order.id);
      await this.capabilities.createEventService(txDb).capture({
        userId: order.userId,
        appId: order.appId,
        eventName: 'billing.order_refunded',
        properties: {
          orderNo: order.orderNo,
          provider: order.provider,
          refundId: refundResult.refundId ?? null,
          amount: refundResult.amount,
          currency: refundResult.currency,
          reason: refundResult.reason,
        },
      });

      return refundedOrder;
    });

    return {
      changed: Boolean(updatedOrder),
      order: updatedOrder ?? order,
      action: {
        status: 'refunded' as const,
        reason: refundResult.reason,
        refundId: refundResult.refundId ?? null,
      },
    };
  }

  protected async reconcileRefundRecord(order: BillingOrder) {
    const refundMeta = this.getRefundMeta(order.meta);
    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = this.capabilities.getBillingProviderAdapter(order.provider);
    const refundQuery = await providerAdapter.queryRefundPayment({
      env: runtimeEnv,
      order: {
        orderNo: order.orderNo,
        providerOrderId: order.providerOrderId,
        amount: order.amount,
        currency: order.currency,
      },
      refund: {
        refundId: refundMeta.refundId,
        refundRequestNo: refundMeta.refundRequestNo,
      },
    });

    if (refundQuery.kind === 'refunded' || refundQuery.kind === 'processing')
      this.assertFullOrderRefund(order, refundQuery);

    if (refundQuery.kind === 'refunded') {
      return this.applyRefundQueryResult(order, refundQuery);
    }

    if (refundQuery.kind === 'processing') {
      const latestOrder = await new BillingRepository(this.db).markOrderRefundingIfPaid({
        orderId: order.id,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastRefund: this.buildRefundMeta(refundQuery, 'processing'),
        },
      });
      return {
        changed: false,
        order: latestOrder ?? order,
        action: {
          status: 'refunding' as const,
          reason: refundQuery.reason,
          refundId: refundQuery.refundId ?? refundMeta.refundId ?? null,
        },
        reconciliation: {
          status: 'refunding' as const,
          source: 'provider_query' as const,
          providerOrderId: refundQuery.providerOrderId ?? order.providerOrderId ?? null,
          paidAt: order.paidAt ?? null,
          reason: refundQuery.reason,
        },
      };
    }

    if (refundQuery.kind === 'not_found')
      throw httpError(409, '渠道暂未确认退款记录，请稍后核对；退款资格继续保留，禁止部署');
    await new HostingPurchases(this.db).settleRefund(order.id, false);
    const updatedOrder = await new BillingRepository(this.db).markOrderPaidIfRefunding({
      orderId: order.id,
      meta: {
        ...this.getOrderMeta(order.meta),
        lastRefund: this.buildRefundMeta(refundQuery, 'failed'),
      },
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: order.userId,
      appId: order.appId,
      eventName: 'billing.order_refund_failed',
      properties: {
        orderNo: order.orderNo,
        provider: order.provider,
        refundId: refundQuery.refundId ?? refundMeta.refundId ?? null,
        refundRequestNo: refundQuery.refundRequestNo ?? refundMeta.refundRequestNo ?? null,
        reason: refundQuery.reason,
      },
    });

    return {
      changed: Boolean(updatedOrder),
      order: updatedOrder ?? order,
      action: {
        status: 'paid' as const,
        reason: refundQuery.reason,
        refundId: refundQuery.refundId ?? refundMeta.refundId ?? null,
      },
      reconciliation: {
        status: 'paid' as const,
        source: 'provider_query' as const,
        providerOrderId: refundQuery.providerOrderId ?? order.providerOrderId ?? null,
        paidAt: order.paidAt ?? null,
        reason: refundQuery.reason,
      },
    };
  }

  protected async applyRefundQueryResult(
    order: BillingOrder,
    refundResult: Extract<PaymentRefundQueryResult, { kind: 'refunded' }>,
  ) {
    const updatedOrder = await this.db.transaction(async (tx) => {
      const txDb = tx;
      const orderRepository = new BillingRepository(txDb);
      const refundedOrder = await orderRepository.markOrderRefundedIfRefundingOrPaid({
        orderId: order.id,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastRefund: this.buildRefundMeta(refundResult, 'refunded'),
        },
      });
      await new HostingPurchases(txDb).settleRefund(order.id, true);
      await this.capabilities
        .createLicenseAccess(txDb)
        .cancelEntitlementsBySource('order', order.id);
      await this.capabilities.createEventService(txDb).capture({
        userId: order.userId,
        appId: order.appId,
        eventName: 'billing.order_refunded',
        properties: {
          orderNo: order.orderNo,
          provider: order.provider,
          refundId: refundResult.refundId ?? null,
          amount: refundResult.amount,
          currency: refundResult.currency,
          reason: refundResult.reason,
        },
      });

      return refundedOrder;
    });

    return {
      changed: Boolean(updatedOrder),
      order: updatedOrder ?? order,
      action: {
        status: 'refunded' as const,
        reason: refundResult.reason,
        refundId: refundResult.refundId ?? null,
      },
      reconciliation: {
        status: 'refunded' as const,
        source: 'provider_query' as const,
        providerOrderId: refundResult.providerOrderId ?? order.providerOrderId ?? null,
        paidAt: order.paidAt ?? null,
        reason: refundResult.reason,
      },
    };
  }

  protected async enqueueRefundReconciliation(
    orderNo: string,
    refundId?: string | null,
    executor: DbExecutor = this.db,
  ) {
    await new JobRunService(executor, this.env).enqueue({
      kind: 'billing.refund.reconcile',
      payload: {
        orderNo,
      },
      maxAttempts: 20,
      dedupeKey: ['billing', 'refund', 'reconcile', orderNo, refundId ?? 'default'].join(':'),
      relatedEntityType: 'order',
      relatedEntityId: orderNo,
    });
  }

  protected getOrderMeta(value: unknown) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  protected getRefundMeta(value: unknown) {
    const meta = this.getOrderMeta(value);
    const raw = this.getOrderMeta(meta.lastRefund);
    return {
      refundId: normalizeString(raw.refundId) || null,
      refundRequestNo: normalizeString(raw.refundRequestNo) || null,
    };
  }

  protected buildRefundMeta(
    result: PaymentRefundResult | PaymentRefundQueryResult,
    status: 'processing' | 'refunded' | 'failed',
  ) {
    return {
      provider: result.provider,
      providerOrderId: result.providerOrderId ?? null,
      refundId: result.refundId ?? null,
      refundRequestNo: result.refundRequestNo ?? null,
      status,
      reason: result.reason,
      payload: result.payload,
      updatedAt: this.capabilities.now().toISOString(),
      ...(result.kind === 'refunded' ? { refundedAt: result.refundedAt.toISOString() } : {}),
    };
  }
}
