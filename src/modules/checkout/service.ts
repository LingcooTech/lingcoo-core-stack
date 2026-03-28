import QRCode from 'qrcode';

import type { DbClient } from '../../db/types';
import { createCheckoutSessionCode, normalizePreparedPaymentToCheckoutAction } from '../../lib/checkout';
import { type AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { AppService } from '../app/service';
import { BillingRepository } from '../billing/repository';
import { BillingService } from '../billing/service';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';
import { AppRepository } from '../app/repository';
import { CheckoutRepository } from './repository';

type SessionRecord = NonNullable<Awaited<ReturnType<CheckoutRepository['findSessionByCode']>>>;

export class CheckoutService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private resolveEffectiveStatus(
    session: SessionRecord,
    orderStatus: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
  ) {
    if (orderStatus === 'paid' || session.status === 'paid') {
      return 'paid' as const;
    }

    if (session.status !== 'pending') {
      return session.status;
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      return 'expired' as const;
    }

    return 'pending' as const;
  }

  private buildHostedUrl(sessionCode: string) {
    return new URL(`/checkout/${sessionCode}`, this.env.PUBLIC_BASE_URL).toString();
  }

  private async resolveProvider(preferred?: 'wechat_pay' | 'alipay') {
    if (preferred) {
      return preferred;
    }

    const providers = await new BillingService(this.db, this.env).listProviders();
    const selected =
      providers.find((item) => item.code === 'alipay' && item.configured) ??
      providers.find((item) => item.code === 'wechat_pay' && item.configured);

    if (!selected) {
      throw httpError(422, 'No billing provider is configured');
    }

    return selected.code;
  }

  private async loadSessionDetail(sessionCode: string) {
    const session = await new CheckoutRepository(this.db).findSessionByCode(sessionCode);
    if (!session) {
      throw httpError(404, 'Checkout session not found');
    }

    const [order, app, product, plan] = await Promise.all([
      new BillingRepository(this.db).findOrderById(session.orderId),
      new AppRepository(this.db).findAppById(session.appId),
      new LicenseRepository(this.db).getProductById(session.productId),
      new LicenseRepository(this.db).getPlanById(session.planId)
    ]);

    if (!order || !app || !product || !plan) {
      throw httpError(500, 'Checkout session is missing related resources');
    }

    return {
      session,
      order,
      app,
      product,
      plan
    };
  }

  async createSession(input: {
    userId: string;
    appCode: string;
    planCode: string;
    providerPreference?: 'wechat_pay' | 'alipay';
    successUrl?: string;
    cancelUrl?: string;
    clientIp?: string;
  }) {
    const appService = new AppService(this.db);
    const app = await appService.requireActiveApp(input.appCode);
    const { plan, product } = await new LicenseService(this.db).getPlanForCheckout(input.planCode);
    await appService.assertAppAllowsProduct(app.id, product.id);

    const provider = await this.resolveProvider(input.providerPreference);
    const billingResult = await new BillingService(this.db, this.env).createOrder({
      userId: input.userId,
      planCode: input.planCode,
      provider,
      clientIp: input.clientIp
    });
    const action = normalizePreparedPaymentToCheckoutAction(billingResult.payment);
    const sessionCode = createCheckoutSessionCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const session = await this.db.transaction(async (tx) => {
      const repository = new CheckoutRepository(tx as DbClient);
      const created = await repository.createSession({
        sessionCode,
        userId: input.userId,
        appId: app.id,
        productId: product.id,
        planId: plan.id,
        orderId: billingResult.order.id,
        provider,
        actionType: action.type,
        actionPayload: action,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt,
        meta: {
          paymentMode: billingResult.payment.mode,
          integrationStatus: billingResult.payment.integrationStatus
        }
      });

      await repository.createPaymentAttempt({
        checkoutSessionId: created.id,
        orderId: billingResult.order.id,
        provider,
        actionType: action.type,
        status: 'prepared',
        requestPayload: {
          appCode: app.code,
          planCode: plan.code,
          successUrl: input.successUrl ?? null,
          cancelUrl: input.cancelUrl ?? null
        },
        responsePayload: {
          mode: billingResult.payment.mode,
          notifyUrl: billingResult.payment.notifyUrl,
          payload: billingResult.payment.payload
        }
      });

      await new EventService(tx as DbClient).capture({
        userId: input.userId,
        productId: product.id,
        eventName: 'checkout.session_created',
        properties: {
          sessionCode,
          appCode: app.code,
          orderNo: billingResult.order.orderNo,
          provider
        }
      });

      return created;
    });

    return {
      sessionId: session.id,
      sessionCode: session.sessionCode,
      status: session.status,
      app: {
        code: app.code,
        name: app.name,
        type: app.type
      },
      product: {
        code: product.code,
        name: product.name
      },
      plan: {
        code: plan.code,
        name: plan.name,
        interval: plan.interval,
        priceAmount: plan.priceAmount,
        currency: plan.currency
      },
      order: {
        id: billingResult.order.id,
        orderNo: billingResult.order.orderNo,
        amount: billingResult.order.amount,
        currency: billingResult.order.currency,
        status: billingResult.order.status
      },
      presentation: {
        type: 'hosted_page',
        url: this.buildHostedUrl(session.sessionCode)
      },
      expiresAt: session.expiresAt,
      createdAt: session.createdAt
    };
  }

  async getOwnedSession(input: { sessionCode: string; userId: string; role?: string }) {
    const detail = await this.loadSessionDetail(input.sessionCode);
    if (detail.session.userId !== input.userId && input.role !== 'admin') {
      throw httpError(403, 'You can only view your own checkout sessions');
    }

    const status = this.resolveEffectiveStatus(detail.session, detail.order.status);

    return {
      sessionId: detail.session.id,
      sessionCode: detail.session.sessionCode,
      status,
      app: {
        code: detail.app.code,
        name: detail.app.name,
        type: detail.app.type
      },
      product: {
        code: detail.product.code,
        name: detail.product.name
      },
      plan: {
        code: detail.plan.code,
        name: detail.plan.name,
        interval: detail.plan.interval,
        priceAmount: detail.plan.priceAmount,
        currency: detail.plan.currency
      },
      order: {
        orderNo: detail.order.orderNo,
        amount: detail.order.amount,
        currency: detail.order.currency,
        status: detail.order.status,
        paidAt: detail.order.paidAt
      },
      presentation: {
        type: 'hosted_page',
        url: this.buildHostedUrl(detail.session.sessionCode)
      },
      successUrl: detail.session.successUrl,
      cancelUrl: detail.session.cancelUrl,
      expiresAt: detail.session.expiresAt,
      completedAt: detail.session.completedAt,
      createdAt: detail.session.createdAt
    };
  }

  async getPublicSession(sessionCode: string) {
    const detail = await this.loadSessionDetail(sessionCode);
    const status = this.resolveEffectiveStatus(detail.session, detail.order.status);
    const rawAction =
      detail.session.actionPayload && typeof detail.session.actionPayload === 'object'
        ? (detail.session.actionPayload as Record<string, unknown>)
        : {};

    let paymentAction: Record<string, unknown> | null = null;
    if (status === 'pending' && detail.session.actionType === 'qr_code') {
      const qrCodeText = String(rawAction.qrCodeText ?? '').trim();
      if (qrCodeText) {
        paymentAction = {
          type: 'qr_code',
          qrCodeText,
          codeUrl: String(rawAction.codeUrl ?? qrCodeText),
          qrCodeDataUrl: await QRCode.toDataURL(qrCodeText, {
            margin: 1,
            width: 280
          })
        };
      }
    } else if (status === 'pending' && detail.session.actionType === 'redirect_url') {
      const url = String(rawAction.url ?? '').trim();
      paymentAction = url
        ? {
            type: 'redirect_url',
            url
          }
        : null;
    }

    return {
      sessionId: detail.session.id,
      sessionCode: detail.session.sessionCode,
      status,
      app: {
        code: detail.app.code,
        name: detail.app.name,
        type: detail.app.type
      },
      product: {
        code: detail.product.code,
        name: detail.product.name
      },
      plan: {
        code: detail.plan.code,
        name: detail.plan.name,
        interval: detail.plan.interval
      },
      order: {
        orderNo: detail.order.orderNo,
        subject: detail.order.subject,
        amount: detail.order.amount,
        amountYuan: (detail.order.amount / 100).toFixed(2),
        currency: detail.order.currency
      },
      paymentAction,
      successUrl: detail.session.successUrl,
      cancelUrl: detail.session.cancelUrl,
      expiresAt: detail.session.expiresAt,
      completedAt: detail.session.completedAt
    };
  }

  async getSessionStatus(sessionCode: string) {
    const detail = await this.loadSessionDetail(sessionCode);
    const status = this.resolveEffectiveStatus(detail.session, detail.order.status);

    return {
      sessionCode: detail.session.sessionCode,
      status,
      orderNo: detail.order.orderNo,
      paidAt: detail.order.paidAt,
      completedAt: detail.session.completedAt ?? detail.order.paidAt ?? null,
      expiresAt: detail.session.expiresAt
    };
  }
}
