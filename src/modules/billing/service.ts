import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { createOrderNo } from '../../lib/orders';
import { PaymentSettingsService } from '../../lib/payment-settings';
import type { DbClient } from '../../db/types';
import { CheckoutRepository } from '../checkout/repository';
import { AppService } from '../app/service';
import { EventService } from '../event/service';
import { LicenseService } from '../license/service';
import { getBillingProviderAdapter, listBillingProviders } from './providers';
import type { PaymentNotificationResult } from './providers/types';
import { BillingRepository } from './repository';

type BillingOrder = NonNullable<Awaited<ReturnType<BillingRepository['findOrderByOrderNo']>>>;

export class BillingService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
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
      offerCode: input.offerCode
    });

    if (plan.interval === 'one_time') {
      const ownership = await new LicenseService(this.db).findActiveOneTimeOwnership(input.userId, app.id);
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
        planCode: plan.code
      }
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
        currency: order.currency
      }
    });

    const payment = await providerAdapter.preparePayment({
      env: runtimeEnv,
      clientIp: input.clientIp,
      order: {
        orderNo: order.orderNo,
        subject: order.subject,
        amount: order.amount,
        currency: order.currency
      }
    });

    return {
      order,
      plan,
      app,
      offer,
      payment
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

    if (order.userId !== input.userId && input.role !== 'admin') {
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
        entitlements: await new LicenseService(this.db).listUserEntitlements(input.userId)
      };
    }

    const result = await this.db.transaction(async (tx) => {
      return this.completeOrderPayment(tx as DbClient, {
        order,
        providerOrderId: `mock_${order.orderNo}`,
        paidAt: new Date(),
        meta: {
          ...this.getOrderMeta(order.meta),
          mockPaid: true
        },
        source: 'mock'
      });
    });

    return {
      order: result.order,
      entitlements: await new LicenseService(this.db).listUserEntitlements(input.userId),
      granted: result.granted
    };
  }

  async handlePaymentNotification(notification: Extract<PaymentNotificationResult, { kind: 'paid' }>) {
    return this.db.transaction(async (tx) => {
      const repository = new BillingRepository(tx);
      const insertedEvent = await repository.createWebhookEventIfAbsent({
        provider: notification.provider,
        providerEventId: notification.providerEventId,
        type: 'payment_paid',
        payload: notification.payload
      });
      const webhookEvent =
        insertedEvent ?? (await repository.findWebhookEvent(notification.provider, notification.providerEventId));

      if (!webhookEvent) {
        throw httpError(500, 'Failed to persist billing webhook event');
      }

      if (webhookEvent.processedAt) {
        return {
          duplicate: true,
          order: await repository.findOrderByOrderNo(notification.orderNo)
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
            receivedAt: new Date().toISOString()
          },
          lastPaidPayload: notification.payload
        },
        source: 'provider_notify',
        providerEventId: notification.providerEventId
      });

      await repository.markWebhookProcessed(webhookEvent.id);

      return {
        duplicate: false,
        order: result.order,
        granted: result.granted
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
    if (order.status === 'paid') {
      return {
        changed: false,
        order,
        reconciliation: {
          status: 'paid' as const,
          source: 'current_state' as const,
          providerOrderId: order.providerOrderId ?? null,
          paidAt: order.paidAt ?? null,
          reason: 'Order already marked as paid'
        }
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
        currency: order.currency
      }
    });

    if (query.kind === 'paid') {
      const result = await this.handlePaymentNotification({
        ...query,
        providerEventId: this.buildProviderQueryEventId({
          provider: query.provider,
          orderNo: query.orderNo,
          providerOrderId: query.providerOrderId
        })
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
          reason: result.duplicate ? 'Order was already reconciled earlier' : 'Provider query confirmed payment'
        }
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
        reason: query.reason
      }
    };
  }

  private getOrderMeta(value: unknown) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
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
    }
  ) {
    const repository = new BillingRepository(tx);
    const updatedOrder = await repository.markOrderPaidIfUnpaid({
      orderId: input.order.id,
      providerOrderId: input.providerOrderId,
      paidAt: input.paidAt,
      meta: input.meta
    });

    if (!updatedOrder) {
      const currentOrder = await repository.findOrderById(input.order.id);
      if (!currentOrder) {
        throw httpError(404, `Order not found: ${input.order.orderNo}`);
      }

      return {
        order: currentOrder,
        granted: undefined
      };
    }

    const granted = await new LicenseService(tx).grantEntitlementsForPlan({
      userId: input.order.userId,
      planId: input.order.planId,
      sourceType: 'order',
      sourceId: input.order.id,
      startsAt: updatedOrder.paidAt ?? new Date()
    });

    const checkoutRepository = new CheckoutRepository(tx);
    await checkoutRepository.markSessionPaidByOrderId(input.order.id, updatedOrder.paidAt ?? new Date());
    await checkoutRepository.markPaymentAttemptsPaidByOrderId(input.order.id, input.providerOrderId);

    await new EventService(tx).capture({
      userId: input.order.userId,
      appId: input.order.appId,
      eventName: 'billing.order_paid',
      properties: {
        orderNo: input.order.orderNo,
        provider: input.order.provider,
        source: input.source,
        providerEventId: input.providerEventId ?? null
      }
    });

    return {
      order: updatedOrder,
      granted
    };
  }
}
