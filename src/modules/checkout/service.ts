import { HostingCheckoutSelection } from '../billing/public';
import type { OrderItem } from '@lingcoo/contracts';
import { queryBatch } from '../../db/query-batch';
import { pickCheckoutDependencies, type CheckoutDependencies } from './dependencies';
import QRCode from 'qrcode';

import type { DbExecutor } from '../../db/types';
import {
  createCheckoutSessionCode,
  normalizePreparedPaymentToCheckoutAction,
} from '../../lib/checkout';
import { normalizeDeploymentPolicy } from '../../lib/deployment-policy';
import { type AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { canAccessAdminConsole, normalizeRole } from '../../lib/rbac';

import { createAppAccess } from '../app/public';
import { CheckoutRepository } from './repository';

type SessionRecord = NonNullable<Awaited<ReturnType<CheckoutRepository['findSessionByCode']>>>;
const AUTO_RECONCILE_STATUS_COOLDOWN_MS = 5_000;

function normalizeMeta(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export class CheckoutService {
  private readonly capabilities: CheckoutDependencies;
  constructor(
    capabilities: CheckoutDependencies,
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {
    this.capabilities = pickCheckoutDependencies(capabilities);
  }

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

    const providers = await this.capabilities
      .createBillingService(this.db, this.env)
      .listProviders();
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

    const [order, app, plan] = await queryBatch(this.db, [
      () => this.capabilities.createBillingAccess(this.db).findOrderById(session.orderId),
      () => createAppAccess(this.db).findAppById(session.appId),
      () => this.capabilities.createLicenseAccess(this.db).getPlanById(session.planId),
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
    const attemptedAt = this.capabilities.now().toISOString();

    await new CheckoutRepository(this.db).updateSessionMeta(detail.session.id, {
      ...sessionMeta,
      lastStatusReconcileAt: attemptedAt,
    });

    try {
      await this.capabilities
        .createBillingService(this.db, this.env)
        .syncOrderStatusByOrderNo(detail.order.orderNo);
      return this.loadSessionDetail(detail.session.sessionCode);
    } catch {
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
      items: OrderItem[];
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
      app: {
        code: input.app.code,
        name: input.order.items[0]?.appName ?? input.app.name,
        type: input.app.type,
      },
      product: { code: input.app.code, name: input.order.items[0]?.appName ?? input.app.name },
      plan: {
        code: input.plan.code,
        name:
          (input.order.items.find((i) => i.kind === 'software') ?? input.order.items[0])?.title ??
          input.plan.name,
        interval:
          (input.order.items.find((i) => i.kind === 'software') ?? input.order.items[0])
            ?.interval ?? input.plan.interval,
        priceAmount:
          (input.order.items.find((i) => i.kind === 'software') ?? input.order.items[0])?.amount ??
          input.order.amount,
        currency: input.order.currency,
      },
      order: {
        id: input.order.id,
        items: input.order.items,
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
    hosting?: { offerId: string; version: number };
    hostingOnly?: { entitlementId: string; deploymentId?: string };
    providerPreference?: 'wechat_pay' | 'alipay';
    successUrl?: string;
    cancelUrl?: string;
    clientIp?: string;
    commandId?: string;
  }) {
    const appService = this.capabilities.createAppService(this.db);
    const licenseService = this.capabilities.createLicenseService(this.db);
    const selection = input.hostingOnly
      ? await new HostingCheckoutSelection(
          this.db,
          this.capabilities.createHostingTerms,
          this.capabilities.now,
        ).resolve({
          ...input,
          hostingOnly: input.hostingOnly,
        })
      : await appService.resolveCheckoutOffer(input.appCode, {
          planCode: input.planCode,
          offerCode: input.offerCode,
        });
    const { app, plan, offer } = selection;

    const deploymentPolicy = normalizeDeploymentPolicy(normalizeMeta(plan.meta).deploymentPolicy);

    if (
      !input.hostingOnly &&
      plan.interval === 'one_time' &&
      !deploymentPolicy.allowMultiplePurchases
    ) {
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
      input.hosting ||
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
      const existingOrder = await this.capabilities
        .createBillingAccess(this.db)
        .findOrderById(reusableSession.orderId);
      const savedItem = existingOrder?.items[0];
      if (
        existingOrder?.status === 'pending' &&
        existingOrder.items.length === 1 &&
        savedItem?.kind === 'software' &&
        savedItem.productId === plan.id &&
        savedItem.amount === offer.priceAmount &&
        savedItem.currency === offer.currency &&
        savedItem.title === offer.title &&
        savedItem.interval === plan.interval &&
        savedItem.appName === app.name
      ) {
        await this.capabilities.createEventService(this.db).capture({
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

    const billingResult = await this.capabilities
      .createBillingService(this.db, this.env)
      .createOrder({
        userId: input.userId,
        appCode: input.appCode,
        planCode: input.planCode,
        offerCode: input.offerCode,
        hosting: input.hosting,
        hostingOnly: input.hostingOnly,
        provider,
        clientIp: input.clientIp,
        commandId: input.commandId,
      });
    const action = normalizePreparedPaymentToCheckoutAction(billingResult.payment);
    const sessionCode = createCheckoutSessionCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const session = await this.db.transaction(async (tx) => {
      const repository = new CheckoutRepository(tx);
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
          commandId: input.commandId ?? null,
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

      await this.capabilities.createEventService(tx).capture({
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
        name: detail.order.items[0]?.appName ?? detail.app.name,
        type: detail.app.type,
      },
      product: {
        code: detail.app.code,
        name: detail.order.items[0]?.appName ?? detail.app.name,
      },
      plan: {
        code: detail.plan.code,
        name:
          (detail.order.items.find((i) => i.kind === 'software') ?? detail.order.items[0])?.title ??
          detail.plan.name,
        interval:
          (detail.order.items.find((i) => i.kind === 'software') ?? detail.order.items[0])
            ?.interval ?? detail.plan.interval,
        priceAmount:
          (detail.order.items.find((i) => i.kind === 'software') ?? detail.order.items[0])
            ?.amount ?? detail.order.amount,
        currency: detail.order.currency,
      },
      order: {
        items: detail.order.items,
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
        name: detail.order.items[0]?.appName ?? detail.app.name,
        type: detail.app.type,
      },
      product: {
        code: detail.app.code,
        name: detail.order.items[0]?.appName ?? detail.app.name,
      },
      plan: {
        code: detail.plan.code,
        name:
          (detail.order.items.find((i) => i.kind === 'software') ?? detail.order.items[0])?.title ??
          detail.plan.name,
        interval:
          (detail.order.items.find((i) => i.kind === 'software') ?? detail.order.items[0])
            ?.interval ?? detail.plan.interval,
      },
      order: {
        items: detail.order.items,
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
        : await this.capabilities
            .createBillingService(this.db, this.env)
            .syncOrderStatusByOrderNo(detail.order.orderNo);
    const status = await this.getSessionStatus(sessionCode);

    return {
      ...status,
      changed: reconciliation.changed,
      reconciliation: reconciliation.reconciliation,
    };
  }
}
