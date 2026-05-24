import QRCode from 'qrcode';

import type { DbClient } from '../../db/types';
import {
  createCheckoutSessionCode,
  normalizePreparedPaymentToCheckoutAction,
} from '../../lib/checkout';
import { normalizeDeploymentPolicy } from '../../lib/deployment-policy';
import { type AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { canAccessAdminConsole, normalizeRole } from '../../lib/rbac';
import { AppService } from '../app/service';
import { BillingRepository } from '../billing/repository';
import { BillingService } from '../billing/service';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';
import { AppRepository } from '../app/repository';
import { CheckoutRepository } from './repository';

type SessionRecord = NonNullable<Awaited<ReturnType<CheckoutRepository['findSessionByCode']>>>;
const AUTO_RECONCILE_STATUS_COOLDOWN_MS = 5_000;

function normalizeMeta(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export class CheckoutService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv,
  ) {}

  private resolveEffectiveStatus(
    session: SessionRecord,
    orderStatus: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded',
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

  private getSessionMeta(value: unknown) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) };
    }

    return {};
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

    const [order, app, plan] = await Promise.all([
      new BillingRepository(this.db).findOrderById(session.orderId),
      new AppRepository(this.db).findAppById(session.appId),
      new LicenseRepository(this.db).getPlanById(session.planId),
    ]);

    if (!order || !app || !plan) {
      throw httpError(500, 'Checkout session is missing related resources');
    }

    return { session, order, app, plan };
  }

  private shouldAutoReconcileStatus(detail: {
    session: SessionRecord;
    order: { status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded' };
  }) {
    if (detail.order.status === 'paid' || detail.session.status !== 'pending') {
      return false;
    }

    if (detail.session.expiresAt && detail.session.expiresAt.getTime() < Date.now()) {
      return false;
    }

    const sessionMeta = this.getSessionMeta(detail.session.meta);
    const lastAttemptAt =
      typeof sessionMeta.lastStatusReconcileAt === 'string'
        ? Date.parse(sessionMeta.lastStatusReconcileAt)
        : Number.NaN;

    if (!Number.isFinite(lastAttemptAt)) {
      return true;
    }

    return Date.now() - lastAttemptAt >= AUTO_RECONCILE_STATUS_COOLDOWN_MS;
  }

  private async maybeAutoReconcileStatus(detail: {
    session: SessionRecord;
    order: {
      orderNo: string;
      status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded';
      paidAt?: Date | null;
    };
  }) {
    if (!this.shouldAutoReconcileStatus(detail)) {
      return detail;
    }

    const sessionMeta = this.getSessionMeta(detail.session.meta);
    const attemptedAt = new Date().toISOString();

    await new CheckoutRepository(this.db).updateSessionMeta(detail.session.id, {
      ...sessionMeta,
      lastStatusReconcileAt: attemptedAt,
    });

    try {
      await new BillingService(this.db, this.env).syncOrderStatusByOrderNo(detail.order.orderNo);
      return this.loadSessionDetail(detail.session.sessionCode);
    } catch (error) {
      return detail;
    }
  }

  private toCreatedSessionPayload(input: {
    session: {
      id: string;
      sessionCode: string;
      status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
      expiresAt: Date | null;
      createdAt: Date;
    };
    app: { code: string; name: string; type: string };
    plan: {
      code: string;
      name: string;
      interval: 'month' | 'year' | 'one_time';
      priceAmount: number;
      currency: string;
    };
    order: {
      id: string;
      orderNo: string;
      amount: number;
      currency: string;
      status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded';
    };
  }) {
    return {
      sessionId: input.session.id,
      sessionCode: input.session.sessionCode,
      status: input.session.status,
      app: { code: input.app.code, name: input.app.name, type: input.app.type },
      product: { code: input.app.code, name: input.app.name },
      plan: {
        code: input.plan.code,
        name: input.plan.name,
        interval: input.plan.interval,
        priceAmount: input.plan.priceAmount,
        currency: input.plan.currency,
      },
      order: {
        id: input.order.id,
        orderNo: input.order.orderNo,
        amount: input.order.amount,
        currency: input.order.currency,
        status: input.order.status,
      },
      presentation: {
        type: 'hosted_page' as const,
        url: this.buildHostedUrl(input.session.sessionCode),
      },
      expiresAt: input.session.expiresAt,
      createdAt: input.session.createdAt,
    };
  }

  async createSession(input: {
    userId: string;
    appCode: string;
    planCode: string;
    offerCode?: string;
    providerPreference?: 'wechat_pay' | 'alipay';
    successUrl?: string;
    cancelUrl?: string;
    clientIp?: string;
  }) {
    const appService = new AppService(this.db);
    const licenseService = new LicenseService(this.db);
    const selection = await appService.resolveCheckoutOffer(input.appCode, {
      planCode: input.planCode,
      offerCode: input.offerCode,
    });
    const { app, plan, offer } = selection;

    const deploymentPolicy = normalizeDeploymentPolicy(normalizeMeta(plan.meta).deploymentPolicy);

    if (plan.interval === 'one_time' && !deploymentPolicy.allowMultiplePurchases) {
      const ownership = await licenseService.findActiveOneTimeOwnership(
        input.userId,
        app.id,
        plan.id,
      );
      if (ownership) {
        throw httpError(409, 'You already own this one-time product');
      }
    }

    const provider = await this.resolveProvider(input.providerPreference);
    const reusableSession =
      input.offerCode ||
      offer.code !== plan.code ||
      offer.priceAmount !== plan.priceAmount ||
      offer.currency !== plan.currency
        ? null
        : await new CheckoutRepository(this.db).findLatestReusablePendingSession({
            userId: input.userId,
            appId: app.id,
            planId: plan.id,
            provider,
          });

    if (reusableSession) {
      const existingOrder = await new BillingRepository(this.db).findOrderById(
        reusableSession.orderId,
      );
      if (existingOrder?.status === 'pending') {
        await new EventService(this.db).capture({
          userId: input.userId,
          appId: app.id,
          eventName: 'checkout.session_reused',
          properties: {
            sessionCode: reusableSession.sessionCode,
            appCode: app.code,
            orderNo: existingOrder.orderNo,
            provider,
          },
        });

        return this.toCreatedSessionPayload({
          session: reusableSession,
          app,
          plan,
          order: existingOrder,
        });
      }
    }

    const billingResult = await new BillingService(this.db, this.env).createOrder({
      userId: input.userId,
      appCode: input.appCode,
      planCode: input.planCode,
      offerCode: input.offerCode,
      provider,
      clientIp: input.clientIp,
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
        planId: plan.id,
        orderId: billingResult.order.id,
        provider,
        actionType: action.type,
        actionPayload: action,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt,
        meta: {
          offerCode: billingResult.offer.code,
          offerTitle: billingResult.offer.title,
          offerPriceAmount: billingResult.offer.priceAmount,
          offerCurrency: billingResult.offer.currency,
          paymentMode: billingResult.payment.mode,
          integrationStatus: billingResult.payment.integrationStatus,
        },
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
          cancelUrl: input.cancelUrl ?? null,
        },
        responsePayload: {
          mode: billingResult.payment.mode,
          notifyUrl: billingResult.payment.notifyUrl,
          payload: billingResult.payment.payload,
        },
      });

      await new EventService(tx as DbClient).capture({
        userId: input.userId,
        appId: app.id,
        eventName: 'checkout.session_created',
        properties: {
          sessionCode,
          appCode: app.code,
          offerCode: billingResult.offer.code,
          orderNo: billingResult.order.orderNo,
          provider,
        },
      });

      return created;
    });

    return this.toCreatedSessionPayload({
      session,
      app,
      plan,
      order: billingResult.order,
    });
  }

  async getOwnedSession(input: { sessionCode: string; userId: string; role?: string }) {
    const detail = await this.loadSessionDetail(input.sessionCode);
    if (
      detail.session.userId !== input.userId &&
      !canAccessAdminConsole(normalizeRole(input.role))
    ) {
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
        type: detail.app.type,
      },
      product: {
        code: detail.app.code,
        name: detail.app.name,
      },
      plan: {
        code: detail.plan.code,
        name: detail.plan.name,
        interval: detail.plan.interval,
        priceAmount: detail.plan.priceAmount,
        currency: detail.plan.currency,
      },
      order: {
        orderNo: detail.order.orderNo,
        amount: detail.order.amount,
        currency: detail.order.currency,
        status: detail.order.status,
        paidAt: detail.order.paidAt,
      },
      presentation: {
        type: 'hosted_page',
        url: this.buildHostedUrl(detail.session.sessionCode),
      },
      successUrl: detail.session.successUrl,
      cancelUrl: detail.session.cancelUrl,
      expiresAt: detail.session.expiresAt,
      completedAt: detail.session.completedAt,
      createdAt: detail.session.createdAt,
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
            width: 280,
          }),
        };
      }
    } else if (status === 'pending' && detail.session.actionType === 'redirect_url') {
      const url = String(rawAction.url ?? '').trim();
      paymentAction = url
        ? {
            type: 'redirect_url',
            url,
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
        type: detail.app.type,
      },
      product: {
        code: detail.app.code,
        name: detail.app.name,
      },
      plan: {
        code: detail.plan.code,
        name: detail.plan.name,
        interval: detail.plan.interval,
      },
      order: {
        orderNo: detail.order.orderNo,
        subject: detail.order.subject,
        amount: detail.order.amount,
        amountYuan: (detail.order.amount / 100).toFixed(2),
        currency: detail.order.currency,
      },
      paymentAction,
      successUrl: detail.session.successUrl,
      cancelUrl: detail.session.cancelUrl,
      expiresAt: detail.session.expiresAt,
      completedAt: detail.session.completedAt,
    };
  }

  async getSessionStatus(sessionCode: string) {
    const detail = await this.maybeAutoReconcileStatus(await this.loadSessionDetail(sessionCode));
    const status = this.resolveEffectiveStatus(detail.session, detail.order.status);

    return {
      sessionCode: detail.session.sessionCode,
      status,
      orderNo: detail.order.orderNo,
      paidAt: detail.order.paidAt,
      completedAt: detail.session.completedAt ?? detail.order.paidAt ?? null,
      expiresAt: detail.session.expiresAt,
    };
  }

  async reconcileSession(sessionCode: string) {
    const detail = await this.loadSessionDetail(sessionCode);
    const reconciliation =
      detail.order.status === 'paid'
        ? {
            changed: false,
            reconciliation: {
              status: 'paid' as const,
              source: 'current_state' as const,
              providerOrderId: detail.order.providerOrderId ?? null,
              paidAt: detail.order.paidAt ?? null,
              reason: 'Order already marked as paid',
            },
          }
        : await new BillingService(this.db, this.env).syncOrderStatusByOrderNo(
            detail.order.orderNo,
          );
    const status = await this.getSessionStatus(sessionCode);

    return {
      ...status,
      changed: reconciliation.changed,
      reconciliation: reconciliation.reconciliation,
    };
  }
}
