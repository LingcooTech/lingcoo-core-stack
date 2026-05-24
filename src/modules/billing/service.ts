import type { AppEnv } from '../../lib/env';
import { normalizeDeploymentPolicy } from '../../lib/deployment-policy';
import { httpError } from '../../lib/errors';
import { createOrderNo } from '../../lib/orders';
import { PaymentSettingsService } from '../../lib/payment-settings';
import { canAccessAdminConsole, normalizeRole } from '../../lib/rbac';
import type { DbClient } from '../../db/types';
import { JobRunService } from '../../lib/job-runs';
import { CheckoutRepository } from '../checkout/repository';
import { AppService } from '../app/service';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';
import { getBillingProviderAdapter, listBillingProviders } from './providers';
import type {
  PaymentNotificationResult,
  PaymentRefundQueryResult,
  PaymentRefundResult,
} from './providers/types';
import { BillingRepository } from './repository';

type BillingOrder = NonNullable<Awaited<ReturnType<BillingRepository['findOrderByOrderNo']>>>;

function normalizeMeta(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export class BillingService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv,
  ) {}

  async listProviders() {
    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    return listBillingProviders(runtimeEnv);
  }

  async createOrder(input: {
    userId: string;
    appCode: string;
    planCode: string;
    offerCode?: string;
    provider: 'wechat_pay' | 'alipay';
    clientIp?: string;
  }) {
    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = getBillingProviderAdapter(input.provider);
    if (!providerAdapter.isConfigured(runtimeEnv)) {
      throw httpError(422, `${input.provider} is not configured`);
    }

    const { app, plan, offer } = await new AppService(this.db).resolveCheckoutOffer(input.appCode, {
      planCode: input.planCode,
      offerCode: input.offerCode,
    });

    const deploymentPolicy = normalizeDeploymentPolicy(normalizeMeta(plan.meta).deploymentPolicy);
    if (plan.interval === 'one_time' && !deploymentPolicy.allowMultiplePurchases) {
      const ownership = await new LicenseService(this.db).findActiveOneTimeOwnership(
        input.userId,
        app.id,
        plan.id,
      );
      if (ownership) {
        throw httpError(409, 'You already own this one-time product');
      }
    }

    if (offer.priceAmount <= 0) {
      throw httpError(422, 'Checkout offer price is not configured');
    }

    const repository = new BillingRepository(this.db);
    const order = await repository.createOrder({
      userId: input.userId,
      appId: app.id,
      planId: plan.id,
      orderNo: createOrderNo(),
      provider: input.provider,
      subject: `${app.name} - ${offer.title}`,
      amount: offer.priceAmount,
      currency: offer.currency,
      meta: {
        appCode: input.appCode,
        offerCode: offer.code,
        offerTitle: offer.title,
        planCode: plan.code,
      },
    });

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: app.id,
      eventName: 'billing.order_created',
      properties: {
        orderNo: order.orderNo,
        offerCode: offer.code,
        planCode: plan.code,
        provider: input.provider,
        amount: order.amount,
        currency: order.currency,
      },
    });

    const payment = await providerAdapter.preparePayment({
      env: runtimeEnv,
      clientIp: input.clientIp,
      order: {
        orderNo: order.orderNo,
        subject: order.subject,
        amount: order.amount,
        currency: order.currency,
      },
    });

    return {
      order,
      plan,
      app,
      offer,
      payment,
    };
  }

  async listOrdersByUser(userId: string) {
    return new BillingRepository(this.db).listOrdersByUserId(userId);
  }

  async syncOrderStatus(input: { orderNo: string; userId: string; role?: string }) {
    const repository = new BillingRepository(this.db);
    const order = await repository.findOrderByOrderNo(input.orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.userId !== input.userId && !canAccessAdminConsole(normalizeRole(input.role))) {
      throw httpError(403, 'You can only sync your own orders');
    }

    return this.syncOrderRecord(order);
  }

  async syncOrderStatusByOrderNo(orderNo: string) {
    const order = await new BillingRepository(this.db).findOrderByOrderNo(orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    return this.syncOrderRecord(order);
  }

  async cancelOrderByOrderNo(orderNo: string) {
    const repository = new BillingRepository(this.db);
    const order = await repository.findOrderByOrderNo(orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.status !== 'pending') {
      throw httpError(409, `Only pending orders can be cancelled (current: ${order.status})`);
    }

    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = getBillingProviderAdapter(order.provider);
    const closeResult = await providerAdapter.closePayment({
      env: runtimeEnv,
      order: {
        orderNo: order.orderNo,
        providerOrderId: order.providerOrderId,
        amount: order.amount,
        currency: order.currency,
      },
    });

    if (closeResult.kind === 'not_found') {
      throw httpError(404, closeResult.reason);
    }

    if (closeResult.kind === 'not_closable') {
      throw httpError(409, closeResult.reason);
    }

    const updatedOrder = await this.db.transaction(async (tx) => {
      const txDb = tx as DbClient;
      const orderRepository = new BillingRepository(txDb);
      const cancelledOrder = await orderRepository.markOrderCancelledIfPending({
        orderId: order.id,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastClose: {
            provider: closeResult.provider,
            providerOrderId: closeResult.providerOrderId ?? null,
            reason: closeResult.reason,
            payload: closeResult.payload,
            cancelledAt: new Date().toISOString(),
          },
        },
      });
      await new CheckoutRepository(txDb).markSessionCancelledByOrderId(order.id);
      await new CheckoutRepository(txDb).markPaymentAttemptsCancelledByOrderId(order.id);
      await new EventService(txDb).capture({
        userId: order.userId,
        appId: order.appId,
        eventName: 'billing.order_cancelled',
        properties: {
          orderNo: order.orderNo,
          provider: order.provider,
          reason: closeResult.reason,
        },
      });

      return cancelledOrder;
    });

    return {
      changed: Boolean(updatedOrder),
      order: updatedOrder ?? order,
      action: {
        status: 'cancelled' as const,
        reason: closeResult.reason,
      },
    };
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

    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = getBillingProviderAdapter(order.provider);
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
      throw httpError(404, refundResult.reason);
    }

    if (refundResult.kind === 'not_refundable') {
      throw httpError(409, refundResult.reason);
    }

    if (refundResult.kind !== 'refunded' && refundResult.kind !== 'processing') {
      throw httpError(500, 'Unexpected refund result');
    }

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

  private async applyRefundResult(order: BillingOrder, refundResult: PaymentRefundResult) {
    if (refundResult.kind === 'processing') {
      const updatedOrder = await this.db.transaction(async (tx) => {
        const txDb = tx as DbClient;
        const orderRepository = new BillingRepository(txDb);
        const refundingOrder = await orderRepository.markOrderRefundingIfPaid({
          orderId: order.id,
          meta: {
            ...this.getOrderMeta(order.meta),
            lastRefund: this.buildRefundMeta(refundResult, 'processing'),
          },
        });
        await new EventService(txDb).capture({
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

        return refundingOrder;
      });

      await this.enqueueRefundReconciliation(order.orderNo, refundResult.refundId ?? null);

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
      const txDb = tx as DbClient;
      const orderRepository = new BillingRepository(txDb);
      const refundedOrder = await orderRepository.markOrderRefundedIfRefundingOrPaid({
        orderId: order.id,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastRefund: this.buildRefundMeta(refundResult, 'refunded'),
        },
      });
      await new LicenseRepository(txDb).cancelEntitlementsBySource('order', order.id);
      await new EventService(txDb).capture({
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

  private async reconcileRefundRecord(order: BillingOrder) {
    const refundMeta = this.getRefundMeta(order.meta);
    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = getBillingProviderAdapter(order.provider);
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

    const updatedOrder = await new BillingRepository(this.db).markOrderPaidIfRefunding({
      orderId: order.id,
      meta: {
        ...this.getOrderMeta(order.meta),
        lastRefund: this.buildRefundMeta(refundQuery, 'failed'),
      },
    });

    await new EventService(this.db).capture({
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

  private async applyRefundQueryResult(
    order: BillingOrder,
    refundResult: Extract<PaymentRefundQueryResult, { kind: 'refunded' }>,
  ) {
    const updatedOrder = await this.db.transaction(async (tx) => {
      const txDb = tx as DbClient;
      const orderRepository = new BillingRepository(txDb);
      const refundedOrder = await orderRepository.markOrderRefundedIfRefundingOrPaid({
        orderId: order.id,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastRefund: this.buildRefundMeta(refundResult, 'refunded'),
        },
      });
      await new LicenseRepository(txDb).cancelEntitlementsBySource('order', order.id);
      await new EventService(txDb).capture({
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

  private async enqueueRefundReconciliation(orderNo: string, refundId?: string | null) {
    await new JobRunService(this.db, this.env).enqueue({
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

  async mockPayOrder(input: { userId: string; orderNo: string }) {
    if (this.env.NODE_ENV === 'production') {
      throw httpError(404, 'Mock payment is disabled in production');
    }

    const repository = new BillingRepository(this.db);
    const order = await repository.findOrderByOrderNo(input.orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (order.userId !== input.userId) {
      throw httpError(403, 'You can only operate on your own orders');
    }

    if (order.status === 'paid') {
      return {
        order,
        entitlements: await new LicenseService(this.db).listUserEntitlements(input.userId),
      };
    }

    const result = await this.db.transaction(async (tx) => {
      return this.completeOrderPayment(tx as DbClient, {
        order,
        providerOrderId: `mock_${order.orderNo}`,
        paidAt: new Date(),
        meta: {
          ...this.getOrderMeta(order.meta),
          mockPaid: true,
        },
        source: 'mock',
      });
    });

    return {
      order: result.order,
      entitlements: await new LicenseService(this.db).listUserEntitlements(input.userId),
      granted: result.granted,
    };
  }

  async handlePaymentNotification(
    notification: Extract<PaymentNotificationResult, { kind: 'paid' }>,
  ) {
    return this.db.transaction(async (tx) => {
      const repository = new BillingRepository(tx);
      const insertedEvent = await repository.createWebhookEventIfAbsent({
        provider: notification.provider,
        providerEventId: notification.providerEventId,
        type: 'payment_paid',
        payload: notification.payload,
      });
      const webhookEvent =
        insertedEvent ??
        (await repository.findWebhookEvent(notification.provider, notification.providerEventId));

      if (!webhookEvent) {
        throw httpError(500, 'Failed to persist billing webhook event');
      }

      if (webhookEvent.processedAt) {
        return {
          duplicate: true,
          order: await repository.findOrderByOrderNo(notification.orderNo),
        };
      }

      const order = await repository.findOrderByOrderNo(notification.orderNo);
      if (!order) {
        throw httpError(404, `Order not found: ${notification.orderNo}`);
      }

      if (order.provider !== notification.provider) {
        throw httpError(409, `Order provider mismatch for ${notification.orderNo}`);
      }

      if (order.amount !== notification.amount) {
        throw httpError(409, `Order amount mismatch for ${notification.orderNo}`);
      }

      if (order.currency !== notification.currency) {
        throw httpError(409, `Order currency mismatch for ${notification.orderNo}`);
      }

      const result = await this.completeOrderPayment(tx as DbClient, {
        order,
        providerOrderId: notification.providerOrderId,
        paidAt: notification.paidAt,
        meta: {
          ...this.getOrderMeta(order.meta),
          lastPaymentNotification: {
            provider: notification.provider,
            providerEventId: notification.providerEventId,
            receivedAt: new Date().toISOString(),
          },
          lastPaidPayload: notification.payload,
        },
        source: 'provider_notify',
        providerEventId: notification.providerEventId,
      });

      await repository.markWebhookProcessed(webhookEvent.id);

      return {
        duplicate: false,
        order: result.order,
        granted: result.granted,
      };
    });
  }

  private buildProviderQueryEventId(input: {
    provider: 'wechat_pay' | 'alipay';
    orderNo: string;
    providerOrderId: string;
  }) {
    return `query_paid:${input.provider}:${input.providerOrderId}:${input.orderNo}`;
  }

  private async syncOrderRecord(order: BillingOrder) {
    if (order.status === 'refunding') {
      return this.reconcileRefundRecord(order);
    }

    if (order.status === 'paid') {
      return {
        changed: false,
        order,
        reconciliation: {
          status: 'paid' as const,
          source: 'current_state' as const,
          providerOrderId: order.providerOrderId ?? null,
          paidAt: order.paidAt ?? null,
          reason: 'Order already marked as paid',
        },
      };
    }

    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = getBillingProviderAdapter(order.provider);
    const query = await providerAdapter.queryPayment({
      env: runtimeEnv,
      order: {
        orderNo: order.orderNo,
        providerOrderId: order.providerOrderId,
        amount: order.amount,
        currency: order.currency,
      },
    });

    if (query.kind === 'paid') {
      const result = await this.handlePaymentNotification({
        ...query,
        providerEventId: this.buildProviderQueryEventId({
          provider: query.provider,
          orderNo: query.orderNo,
          providerOrderId: query.providerOrderId,
        }),
      });
      const latestOrder = await new BillingRepository(this.db).findOrderByOrderNo(order.orderNo);

      return {
        changed: !result.duplicate,
        order: latestOrder ?? order,
        reconciliation: {
          status: 'paid' as const,
          source: 'provider_query' as const,
          providerOrderId: query.providerOrderId,
          paidAt: query.paidAt,
          reason: result.duplicate
            ? 'Order was already reconciled earlier'
            : 'Provider query confirmed payment',
        },
      };
    }

    const latestOrder = await new BillingRepository(this.db).findOrderByOrderNo(order.orderNo);

    return {
      changed: false,
      order: latestOrder ?? order,
      reconciliation: {
        status: query.kind,
        source: 'provider_query' as const,
        providerOrderId: query.providerOrderId ?? null,
        paidAt: null,
        reason: query.reason,
      },
    };
  }

  private getOrderMeta(value: unknown) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private getRefundMeta(value: unknown) {
    const meta = this.getOrderMeta(value);
    const raw = this.getOrderMeta(meta.lastRefund);
    return {
      refundId: normalizeString(raw.refundId) || null,
      refundRequestNo: normalizeString(raw.refundRequestNo) || null,
    };
  }

  private buildRefundMeta(
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
      updatedAt: new Date().toISOString(),
      ...(result.kind === 'refunded' ? { refundedAt: result.refundedAt.toISOString() } : {}),
    };
  }

  private async completeOrderPayment(
    tx: DbClient,
    input: {
      order: BillingOrder;
      providerOrderId?: string | null;
      paidAt?: Date;
      meta?: Record<string, unknown>;
      source: 'mock' | 'provider_notify';
      providerEventId?: string;
    },
  ) {
    const repository = new BillingRepository(tx);
    const updatedOrder = await repository.markOrderPaidIfUnpaid({
      orderId: input.order.id,
      providerOrderId: input.providerOrderId,
      paidAt: input.paidAt,
      meta: input.meta,
    });

    if (!updatedOrder) {
      const currentOrder = await repository.findOrderById(input.order.id);
      if (!currentOrder) {
        throw httpError(404, `Order not found: ${input.order.orderNo}`);
      }

      return {
        order: currentOrder,
        granted: undefined,
      };
    }

    const granted = await new LicenseService(tx).grantEntitlementsForPlan({
      userId: input.order.userId,
      planId: input.order.planId,
      sourceType: 'order',
      sourceId: input.order.id,
      startsAt: updatedOrder.paidAt ?? new Date(),
    });

    const checkoutRepository = new CheckoutRepository(tx);
    await checkoutRepository.markSessionPaidByOrderId(
      input.order.id,
      updatedOrder.paidAt ?? new Date(),
    );
    await checkoutRepository.markPaymentAttemptsPaidByOrderId(
      input.order.id,
      input.providerOrderId,
    );

    await new EventService(tx).capture({
      userId: input.order.userId,
      appId: input.order.appId,
      eventName: 'billing.order_paid',
      properties: {
        orderNo: input.order.orderNo,
        provider: input.order.provider,
        source: input.source,
        providerEventId: input.providerEventId ?? null,
      },
    });

    return {
      order: updatedOrder,
      granted,
    };
  }
}
