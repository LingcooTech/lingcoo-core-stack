import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { createOrderNo } from '../../lib/orders';
import type { DbClient } from '../../db/types';
import { EventService } from '../event/service';
import { LicenseService } from '../license/service';
import { getBillingProviderAdapter, listBillingProviders } from './providers';
import { BillingRepository } from './repository';

export class BillingService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  listProviders() {
    return listBillingProviders(this.env);
  }

  async createOrder(input: { userId: string; planCode: string; provider: 'wechat_pay' | 'alipay' }) {
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

    const payment = getBillingProviderAdapter(input.provider).preparePayment({
      env: this.env,
      order: {
        orderNo: order.orderNo,
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
      const currentMeta =
        order.meta && typeof order.meta === 'object' && !Array.isArray(order.meta)
          ? (order.meta as Record<string, unknown>)
          : {};

      const updatedOrder = await new BillingRepository(tx).markOrderPaid(order.id, `mock_${order.orderNo}`, {
        ...currentMeta,
        mockPaid: true
      });

      const granted = await new LicenseService(tx).grantEntitlementsForPlan({
        userId: order.userId,
        planId: order.planId,
        sourceType: 'order',
        sourceId: order.id,
        startsAt: updatedOrder.paidAt ?? new Date()
      });

      await new EventService(tx).capture({
        userId: order.userId,
        productId: order.productId,
        eventName: 'billing.order_paid',
        properties: {
          orderNo: order.orderNo,
          provider: order.provider,
          source: 'mock'
        }
      });

      return {
        order: updatedOrder,
        granted
      };
    });

    return {
      order: result.order,
      entitlements: await new LicenseService(this.db).listUserEntitlements(input.userId),
      granted: result.granted
    };
  }
}
