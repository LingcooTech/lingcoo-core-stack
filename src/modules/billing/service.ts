import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { createOrderNo } from '../../lib/orders';
import { PaymentSettingsService } from '../../lib/payment-settings';
import type { DbClient } from '../../db/types';
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

  async createOrder(input: { userId: string; planCode: string; provider: 'wechat_pay' | 'alipay' }) {
    const runtimeEnv = await new PaymentSettingsService(this.db, this.env).buildRuntimeEnv();
    const providerAdapter = getBillingProviderAdapter(input.provider);
    if (!providerAdapter.isConfigured(runtimeEnv)) {
      throw httpError(422, `${input.provider} is not configured`);
    }

    const { plan, product } = await new LicenseService(this.db).getPlanForCheckout(input.planCode);

    if (plan.priceAmount <= 0) {
      throw httpError(422, 'Plan price is not configured');
    }

    const repository = new BillingRepository(this.db);
    const order = await repository.createOrder({
      userId: input.userId,
      productId: product.id,
      planId: plan.id,
      orderNo: createOrderNo(),
      provider: input.provider,
      subject: `${product.name} - ${plan.name}`,
      amount: plan.priceAmount,
      currency: plan.currency,
      meta: {
        planCode: plan.code,
        productCode: product.code
      }
    });

    await new EventService(this.db).capture({
      userId: input.userId,
      productId: product.id,
      eventName: 'billing.order_created',
      properties: {
        orderNo: order.orderNo,
        planCode: plan.code,
        provider: input.provider,
        amount: order.amount,
        currency: order.currency
      }
    });

    const payment = await providerAdapter.preparePayment({
      env: runtimeEnv,
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
      product,
      payment
    };
  }

  async listOrdersByUser(userId: string) {
    return new BillingRepository(this.db).listOrdersByUserId(userId);
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

    await new EventService(tx).capture({
      userId: input.order.userId,
      productId: input.order.productId,
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
