import { randomBytes } from 'node:crypto';

import type { DbClient } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { hashPassword } from '../../lib/security';
import { AppRepository } from '../app/repository';
import { AppService } from '../app/service';
import { AuthRepository } from '../auth/repository';
import { BillingRepository } from '../billing/repository';
import { BillingService } from '../billing/service';
import { CheckoutRepository } from '../checkout/repository';
import { EventRepository } from '../event/repository';
import { EventService } from '../event/service';
import { InstallRepository } from '../install/repository';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';

type OrderRecord = Awaited<ReturnType<BillingRepository['listRecentOrders']>>[number];
type PriceRecord = Awaited<ReturnType<LicenseRepository['listPrices']>>[number];
type ProductRecord = Awaited<ReturnType<LicenseRepository['listProducts']>>[number];
type AuthorizationTemplateRecord = Awaited<ReturnType<LicenseRepository['listAuthorizationTemplates']>>[number];

export class AdminService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private normalizeRecordMeta(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private readProductType(product: ProductRecord) {
    const meta = this.normalizeRecordMeta(product.meta);
    const explicitType = meta.productType ?? meta.legacyType;
    if (explicitType === 'chrome_extension' || explicitType === 'web_app' || explicitType === 'service') {
      return explicitType;
    }

    return product.deliveryMode === 'direct_access' ? 'web_app' : 'service';
  }

  private readAuthorizationKind(template: AuthorizationTemplateRecord) {
    const meta = this.normalizeRecordMeta(template.meta);
    const kind = meta.kind;
    return typeof kind === 'string' && kind.trim() ? kind.trim() : 'tier';
  }

  private toProductSummary(product: ProductRecord) {
    return {
      ...product,
      type: this.readProductType(product)
    };
  }

  private toPriceSummary(price: PriceRecord, product?: ProductRecord | null, template?: AuthorizationTemplateRecord | null) {
    return {
      ...price,
      interval: price.billingType === 'one_time' ? 'one_time' : price.billingInterval,
      priceAmount: price.amount,
      productId: product?.id ?? price.productId,
      productCode: product?.code,
      productName: product?.name,
      authorizationTemplateCode: template?.code,
      authorizationTemplateName: template?.name
    };
  }

  private toAuthorizationTemplateSummary(template: AuthorizationTemplateRecord, product?: ProductRecord | null) {
    return {
      id: template.id,
      code: template.code,
      name: template.name,
      kind: this.readAuthorizationKind(template),
      productId: template.productId,
      productCode: product?.code,
      productName: product?.name,
      status: template.status,
      description: template.description,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };
  }

  private async hydrateOrderRows(orders: OrderRecord[]) {
    if (orders.length === 0) {
      return [];
    }

    const userIds = [...new Set(orders.map((item) => item.userId))];
    const productIds = [...new Set(orders.map((item) => item.productId))];
    const priceIds = [...new Set(orders.map((item) => item.priceId))];
    const appIds = [...new Set(orders.map((item) => item.appId))];
    const sessions = await new CheckoutRepository(this.db).listSessionsByOrderIds(orders.map((item) => item.id));

    const [users, products, prices, apps] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new LicenseRepository(this.db).listProductsByIds(productIds),
      new LicenseRepository(this.db).listPricesByIds(priceIds),
      new AppRepository(this.db).listAppsByIds(appIds)
    ]);
    const templates = await new LicenseRepository(this.db).listAuthorizationTemplatesByIds([
      ...new Set(prices.map((item) => item.authorizationTemplateId))
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));
    const priceMap = new Map(prices.map((item) => [item.id, item]));
    const templateMap = new Map(templates.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const sessionMap = new Map(sessions.map((item) => [item.orderId, item]));

    return orders.map((order) => {
      const user = userMap.get(order.userId) ?? null;
      const product = productMap.get(order.productId) ?? null;
      const price = priceMap.get(order.priceId) ?? null;
      const authorizationTemplate = price ? templateMap.get(price.authorizationTemplateId) ?? null : null;
      const app = appMap.get(order.appId) ?? null;
      const session = sessionMap.get(order.id) ?? null;

      return {
        ...order,
        user: user
          ? {
              id: user.id,
              email: user.email,
              displayName: user.displayName
            }
          : null,
        product: product ? this.toProductSummary(product) : null,
        price: price ? this.toPriceSummary(price, product, authorizationTemplate) : null,
        checkoutSession: session
          ? {
              id: session.id,
              sessionCode: session.sessionCode,
              status: session.status,
              provider: session.provider,
              actionType: session.actionType,
              actionPayload: session.actionPayload,
              successUrl: session.successUrl,
              cancelUrl: session.cancelUrl,
              expiresAt: session.expiresAt,
              completedAt: session.completedAt,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt
            }
          : null,
        app: app
          ? {
              id: app.id,
              code: app.code,
              name: app.name,
              type: app.type
            }
          : null
      };
    });
  }

  async listOrders(limit = 50) {
    const orders = await new BillingRepository(this.db).listRecentOrders(limit);
    return {
      items: await this.hydrateOrderRows(orders)
    };
  }

  async getOrderDetail(orderNo: string) {
    const order = await new BillingRepository(this.db).findOrderByOrderNo(orderNo);
    if (!order) {
      throw httpError(404, 'Order not found');
    }

    const [item] = await this.hydrateOrderRows([order]);
    const [paymentAttempts, grants, events, prices] = await Promise.all([
      new CheckoutRepository(this.db).listPaymentAttemptsByOrderIds([order.id]),
      new LicenseRepository(this.db).listAuthorizationGrantsBySource('order', order.id),
      new EventRepository(this.db).listRecentEventsByOrderNo(orderNo, 20),
      new LicenseRepository(this.db).listPricesByIds([order.priceId])
    ]);
    const templateIds = [...new Set(grants.map((grant) => grant.authorizationTemplateId))];
    const templates = await new LicenseRepository(this.db).listAuthorizationTemplatesByIds(templateIds);
    const templateMap = new Map(templates.map((item) => [item.id, item]));
    const price = prices[0] ?? null;

    return {
      item,
      paymentAttempts,
      authorizationGrants: grants.map((grant) => {
        const template = templateMap.get(grant.authorizationTemplateId) ?? null;
        return {
          ...grant,
          authorizationTemplate: template ?? null,
          price: price ? this.toPriceSummary(price, item.product, template) : null
        };
      }),
      events
    };
  }

  async reconcileOrder(orderNo: string) {
    return new BillingService(this.db, this.env).syncOrderStatusByOrderNo(orderNo);
  }

  async listInstalls(limit = 50) {
    const installs = await new InstallRepository(this.db).listRecentInstalls(limit);
    const userIds = [...new Set(installs.map((item) => item.userId).filter((item): item is string => Boolean(item)))];
    const appIds = [...new Set(installs.map((item) => item.appId).filter((item): item is string => Boolean(item)))];
    const productIds = [...new Set(installs.map((item) => item.productId))];

    const [users, apps, products] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new AppRepository(this.db).listAppsByIds(appIds),
      new LicenseRepository(this.db).listProductsByIds(productIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));

    return {
      items: installs.map((install) => {
        const user = install.userId ? userMap.get(install.userId) ?? null : null;
        const app = install.appId ? appMap.get(install.appId) ?? null : null;
        const product = productMap.get(install.productId) ?? null;

        return {
          ...install,
          extensionInstallId: install.instanceCode,
          chromeProfileHint: install.profileHint,
          appVersion: install.clientVersion,
          user: user
            ? {
                id: user.id,
                email: user.email,
                displayName: user.displayName
              }
            : null,
          app: app
            ? {
                id: app.id,
                code: app.code,
                name: app.name,
                type: app.type
              }
            : null,
          product: product ? this.toProductSummary(product) : null
        };
      })
    };
  }

  async listAuthorizationGrants(limit = 50) {
    const grants = await new LicenseRepository(this.db).listRecentAuthorizationGrants(limit);
    const userIds = [...new Set(grants.map((item) => item.userId))];
    const productIds = [...new Set(grants.map((item) => item.productId))];
    const templateIds = [...new Set(grants.map((item) => item.authorizationTemplateId))];
    const priceIds = [...new Set(grants.map((item) => item.priceId).filter((item): item is string => Boolean(item)))];
    const orderIds = [
      ...new Set(
        grants
          .filter((item) => item.sourceType === 'order' && item.sourceId)
          .map((item) => item.sourceId as string)
      )
    ];

    const [users, products, templates, prices, orders] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new LicenseRepository(this.db).listProductsByIds(productIds),
      new LicenseRepository(this.db).listAuthorizationTemplatesByIds(templateIds),
      new LicenseRepository(this.db).listPricesByIds(priceIds),
      new BillingRepository(this.db).listOrdersByIds(orderIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));
    const templateMap = new Map(templates.map((item) => [item.id, item]));
    const priceMap = new Map(prices.map((item) => [item.id, item]));
    const orderMap = new Map(orders.map((item) => [item.id, item]));

    return {
      items: grants.map((grant) => {
        const user = userMap.get(grant.userId) ?? null;
        const product = productMap.get(grant.productId) ?? null;
        const template = templateMap.get(grant.authorizationTemplateId) ?? null;
        const price = grant.priceId ? priceMap.get(grant.priceId) ?? null : null;
        const sourceOrder =
          grant.sourceType === 'order' && grant.sourceId
            ? orderMap.get(grant.sourceId) ?? null
            : null;

        return {
          ...grant,
          user: user
            ? {
                id: user.id,
                email: user.email,
                displayName: user.displayName
              }
            : null,
          product: product ? this.toProductSummary(product) : null,
          price: price ? this.toPriceSummary(price, product, template) : null,
          authorizationTemplate: template ?? null,
          sourceOrder: sourceOrder
            ? {
                id: sourceOrder.id,
                orderNo: sourceOrder.orderNo,
                status: sourceOrder.status
              }
            : null
        };
      })
    };
  }

  async upsertProduct(
    productCode: string,
    input: {
      name: string;
      tagline?: string;
      description?: string;
      content?: string;
      iconUrl?: string;
      coverUrl?: string;
      screenshots?: unknown[];
      highlights?: unknown[];
      faq?: unknown[];
      links?: unknown[];
      category?: string;
      deliveryMode?: 'direct_access' | 'one_click_deploy';
      sortOrder?: number;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      type?: 'chrome_extension' | 'web_app' | 'service';
      meta?: Record<string, unknown>;
    },
    actorUserId: string
  ) {
    const product = await this.db.transaction(async (tx) => {
      const repository = new LicenseRepository(tx as DbClient);
      const existing = await repository.getProductByCode(productCode);
      const existingMeta = existing ? this.normalizeRecordMeta(existing.meta) : {};
      const nextMeta = {
        ...existingMeta,
        ...(input.meta ?? {}),
        ...(input.type ? { productType: input.type } : {})
      };

      const saved = await repository.upsertProduct({
        code: productCode,
        name: input.name.trim(),
        tagline: input.tagline?.trim() || null,
        description: input.description?.trim() || null,
        content: input.content?.trim() || null,
        iconUrl: input.iconUrl?.trim() || null,
        coverUrl: input.coverUrl?.trim() || null,
        screenshots: input.screenshots ?? [],
        highlights: input.highlights ?? [],
        faq: input.faq ?? [],
        links: input.links ?? [],
        category: input.category?.trim() || null,
        deliveryMode: input.deliveryMode ?? existing?.deliveryMode ?? 'direct_access',
        sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
        status: input.status,
        meta: nextMeta
      });

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        productId: saved.id,
        eventName: 'admin.product_upserted',
        properties: {
          productCode,
          status: input.status,
          deliveryMode: saved.deliveryMode,
          productType: this.readProductType(saved)
        }
      });

      return saved;
    });

    return this.toProductSummary(product);
  }

  async upsertPrice(
    priceCode: string,
    input: {
      productCode: string;
      authorizationTemplateCode: string;
      name: string;
      billingProvider: string;
      billingPriceId?: string;
      billingType: 'one_time' | 'recurring';
      billingInterval?: 'month' | 'year';
      amount: number;
      currency: string;
      grantStrategy: 'lifetime' | 'fixed_duration' | 'subscription_period';
      grantDurationDays?: number;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      meta?: Record<string, unknown>;
    },
    actorUserId: string
  ) {
    const result = await this.db.transaction(async (tx) => {
      const repository = new LicenseRepository(tx as DbClient);
      const product = await repository.getProductByCode(input.productCode);
      if (!product) {
        throw httpError(404, 'Product not found');
      }

      const authorizationTemplate = await repository.getAuthorizationTemplateByCode(input.authorizationTemplateCode);
      if (!authorizationTemplate || authorizationTemplate.productId !== product.id) {
        throw httpError(422, 'Authorization template does not belong to the selected product');
      }

      const price = await repository.upsertPrice({
        productId: product.id,
        authorizationTemplateId: authorizationTemplate.id,
        code: priceCode,
        name: input.name.trim(),
        billingProvider: input.billingProvider.trim() || 'self_hosted',
        billingPriceId: input.billingPriceId?.trim() || null,
        billingType: input.billingType,
        billingInterval: input.billingType === 'one_time' ? null : (input.billingInterval ?? null),
        amount: input.amount,
        currency: input.currency.trim().toUpperCase() || 'CNY',
        grantStrategy: input.grantStrategy,
        grantDurationDays: input.grantDurationDays ?? null,
        status: input.status,
        meta: input.meta ?? {}
      });

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        productId: product.id,
        eventName: 'admin.price_upserted',
        properties: {
          productCode: product.code,
          priceCode,
          billingType: input.billingType,
          billingInterval: input.billingInterval ?? null,
          amount: input.amount,
          authorizationTemplateCode: authorizationTemplate.code
        }
      });

      return {
        product,
        price,
        authorizationTemplate
      };
    });

    return {
      price: this.toPriceSummary(result.price, result.product, result.authorizationTemplate),
      product: this.toProductSummary(result.product),
      authorizationTemplate: this.toAuthorizationTemplateSummary(result.authorizationTemplate, result.product)
    };
  }

  async upsertAuthorizationTemplate(
    authorizationTemplateCode: string,
    input: {
      productCode: string;
      name: string;
      description?: string;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      kind?: string;
      meta?: Record<string, unknown>;
    },
    actorUserId: string
  ) {
    const result = await this.db.transaction(async (tx) => {
      const repository = new LicenseRepository(tx as DbClient);
      const product = await repository.getProductByCode(input.productCode);
      if (!product) {
        throw httpError(404, 'Product not found');
      }

      const authorizationTemplate = await repository.upsertAuthorizationTemplate({
        productId: product.id,
        code: authorizationTemplateCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: input.status,
        meta: {
          ...(input.meta ?? {}),
          ...(input.kind ? { kind: input.kind } : {})
        }
      });

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        productId: product.id,
        eventName: 'admin.authorization_template_upserted',
        properties: {
          productCode: product.code,
          authorizationTemplateCode,
          status: authorizationTemplate.status
        }
      });

      return { product, authorizationTemplate };
    });

    return {
      authorizationTemplate: this.toAuthorizationTemplateSummary(result.authorizationTemplate, result.product),
      product: this.toProductSummary(result.product)
    };
  }

  async listEvents(limit = 50) {
    const events = await new EventRepository(this.db).listRecentEvents(limit);
    const userIds = [...new Set(events.map((item) => item.userId).filter((item): item is string => Boolean(item)))];
    const installIds = [...new Set(events.map((item) => item.installId).filter((item): item is string => Boolean(item)))];
    const installs = await new InstallRepository(this.db).listInstallsByIds(installIds);
    const appIds = [...new Set(installs.map((item) => item.appId).filter((item): item is string => Boolean(item)))];
    const productIds = [
      ...new Set(
        events
          .map((item) => item.productId)
          .concat(installs.map((item) => item.productId))
          .filter((item): item is string => Boolean(item))
      )
    ];

    const [users, apps, products] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new AppRepository(this.db).listAppsByIds(appIds),
      new LicenseRepository(this.db).listProductsByIds(productIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const installMap = new Map(installs.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));

    return {
      items: events.map((event) => {
        const install = event.installId ? installMap.get(event.installId) ?? null : null;
        const app = install?.appId ? appMap.get(install.appId) ?? null : null;
        const product = productMap.get(event.productId ?? install?.productId ?? '') ?? null;
        const user = event.userId ? userMap.get(event.userId) ?? null : null;

        return {
          ...event,
          createdAt: event.eventTime,
          user: user
            ? {
                id: user.id,
                email: user.email,
                displayName: user.displayName
              }
            : null,
          install: install
            ? {
                id: install.id,
                extensionInstallId: install.instanceCode,
                status: install.status
              }
            : null,
          app: app
            ? {
                id: app.id,
                code: app.code,
                name: app.name,
                type: app.type
              }
            : null,
          product: product ? this.toProductSummary(product) : null
        };
      })
    };
  }

  async listBillingWebhookEvents(limit = 50) {
    return {
      items: await new BillingRepository(this.db).listRecentWebhookEvents(limit)
    };
  }

  async grantAuthorization(
    input: {
      userEmail: string;
      authorizationTemplateCode: string;
      expiresAt?: string;
      reason?: string;
    },
    actorUserId: string
  ) {
    const user = await new AuthRepository(this.db).findUserByEmail(input.userEmail);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const result = await this.db.transaction(async (tx) => {
      const txDb = tx as DbClient;
      const grant = await new LicenseService(txDb).grantManualAuthorization({
        userId: user.id,
        authorizationTemplateCode: input.authorizationTemplateCode,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        reason: input.reason
      });

      await new EventService(txDb).capture({
        userId: user.id,
        productId: grant.product.id,
        eventName: 'admin.authorization_grants_created',
        properties: {
          actorUserId,
          authorizationTemplateCode: grant.authorizationTemplate.code,
          reason: input.reason ?? null,
          expiresAt: input.expiresAt ?? null,
          grantCount: grant.grants.length
        }
      });

      return grant;
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      authorizationTemplate: this.toAuthorizationTemplateSummary(result.authorizationTemplate, result.product),
      product: this.toProductSummary(result.product),
      sourceId: result.grants[0]?.sourceId ?? null,
      expiresAt: result.grants[0]?.expiresAt ?? null,
      grantCount: result.grants.length
    };
  }

  async revokeAuthorization(grantId: string, actorUserId: string) {
    const repository = new LicenseRepository(this.db);
    const grant = await repository.findAuthorizationGrantById(grantId);
    if (!grant) {
      throw httpError(404, 'Authorization grant not found');
    }

    const revoked = await this.db.transaction(async (tx) => {
      const txRepository = new LicenseRepository(tx as DbClient);
      const items =
        grant.sourceId && grant.sourceType
          ? await txRepository.revokeAuthorizationGrantsBySource(grant.sourceType, grant.sourceId)
          : await (async () => {
              const row = await txRepository.revokeAuthorizationGrant(grant.id);
              return row ? [row] : [];
            })();

      await new EventService(tx as DbClient).capture({
        userId: grant.userId,
        productId: grant.productId,
        eventName: 'admin.authorization_grants_revoked',
        properties: {
          actorUserId,
          sourceType: grant.sourceType,
          sourceId: grant.sourceId ?? null,
          grantId: grant.id,
          revokedCount: items.length
        }
      });

      return items;
    });

    return {
      grantId: grant.id,
      sourceType: grant.sourceType,
      sourceId: grant.sourceId,
      revokedCount: revoked.length,
      userId: grant.userId,
      productId: grant.productId
    };
  }

  async listUsers(query: { limit: number; offset: number; search?: string; role?: 'user' | 'admin'; status?: 'active' | 'suspended' }) {
    const result = await new AuthRepository(this.db).listUsers(query);
    return {
      items: result.items,
      total: result.total,
      limit: query.limit,
      offset: query.offset
    };
  }

  async getUser(userId: string) {
    const user = await new AuthRepository(this.db).findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  async updateUser(
    userId: string,
    input: { displayName?: string; role?: 'user' | 'admin'; status?: 'active' | 'suspended' },
    actorUserId: string
  ) {
    if (userId === actorUserId && input.role && input.role !== 'admin') {
      throw httpError(400, 'Cannot demote your own admin role');
    }

    if (userId === actorUserId && input.status === 'suspended') {
      throw httpError(400, 'Cannot suspend your own account');
    }

    const repository = new AuthRepository(this.db);
    const existing = await repository.findUserById(userId);
    if (!existing) {
      throw httpError(404, 'User not found');
    }

    const updated = await repository.updateUser(userId, input);
    await new EventService(this.db).capture({
      userId: actorUserId,
      eventName: 'admin.user_updated',
      properties: {
        targetUserId: userId,
        changes: input
      }
    });

    return updated;
  }

  async suspendUser(userId: string, actorUserId: string) {
    return this.updateUser(userId, { status: 'suspended' }, actorUserId);
  }

  async activateUser(userId: string, actorUserId: string) {
    return this.updateUser(userId, { status: 'active' }, actorUserId);
  }

  async resetUserPassword(userId: string, actorUserId: string) {
    const repository = new AuthRepository(this.db);
    const user = await repository.findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const temporaryPassword = randomBytes(9).toString('base64url').slice(0, 12);
    const passwordHash = hashPassword(temporaryPassword);
    await repository.updatePasswordCredential(userId, passwordHash);

    await new EventService(this.db).capture({
      userId: actorUserId,
      eventName: 'admin.user_password_reset',
      properties: {
        targetUserId: userId
      }
    });

    return {
      userId: user.id,
      email: user.email,
      temporaryPassword
    };
  }
}
