import { randomBytes, randomUUID } from 'node:crypto';

import type { DbClient } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { hashPassword } from '../../lib/security';
import { AppRepository } from '../app/repository';
import { AuthRepository } from '../auth/repository';
import { BillingRepository } from '../billing/repository';
import { BillingService } from '../billing/service';
import { CheckoutRepository } from '../checkout/repository';
import { EventService } from '../event/service';
import { EventRepository } from '../event/repository';
import { InstallRepository } from '../install/repository';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';

export class AdminService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private async hydrateOrderRows(
    orders: Array<Awaited<ReturnType<BillingRepository['listRecentOrders']>>[number]>
  ) {
    const userIds = [...new Set(orders.map((item) => item.userId))];
    const productIds = [...new Set(orders.map((item) => item.productId))];
    const planIds = [...new Set(orders.map((item) => item.planId))];
    const sessions = await new CheckoutRepository(this.db).listSessionsByOrderIds(orders.map((item) => item.id));
    const appIds = [...new Set(sessions.map((item) => item.appId))];

    const [users, products, plans, apps] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new LicenseRepository(this.db).listProductsByIds(productIds),
      new LicenseRepository(this.db).listPlansByIds(planIds),
      new AppRepository(this.db).listAppsByIds(appIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));
    const planMap = new Map(plans.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const sessionMap = new Map(sessions.map((item) => [item.orderId, item]));

    return orders.map((order) => {
      const session = sessionMap.get(order.id) ?? null;
      const app = session ? appMap.get(session.appId) ?? null : null;
      const user = userMap.get(order.userId) ?? null;
      const product = productMap.get(order.productId) ?? null;
      const plan = planMap.get(order.planId) ?? null;

      return {
        ...order,
        user: user
          ? {
              id: user.id,
              email: user.email,
              displayName: user.displayName
            }
          : null,
        product: product
          ? {
              id: product.id,
              code: product.code,
              name: product.name
            }
          : null,
        plan: plan
          ? {
              id: plan.id,
              code: plan.code,
              name: plan.name,
              interval: plan.interval
            }
          : null,
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
    const repository = new BillingRepository(this.db);
    const orders = await repository.listRecentOrders(limit);

    return {
      items: await this.hydrateOrderRows(orders)
    };
  }

  async getOrderDetail(orderNo: string) {
    const order = await new BillingRepository(this.db).findOrderByOrderNo(orderNo);

    if (!order) {
      throw httpError(404, 'Order not found');
    }

    const [hydratedOrder] = await this.hydrateOrderRows([order]);
    const [attempts, entitlements, events] = await Promise.all([
      new CheckoutRepository(this.db).listPaymentAttemptsByOrderIds([order.id]),
      new LicenseRepository(this.db).listEntitlementsBySource('order', order.id),
      new EventRepository(this.db).listRecentEventsByOrderNo(orderNo, 20)
    ]);
    const featureIds = [...new Set(entitlements.map((item) => item.featureId))];
    const features = await new LicenseRepository(this.db).listFeaturesByIds(featureIds);
    const featureMap = new Map(features.map((item) => [item.id, item]));

    return {
      item: hydratedOrder,
      paymentAttempts: attempts,
      entitlements: entitlements.map((entitlement) => {
        const feature = featureMap.get(entitlement.featureId) ?? null;

        return {
          ...entitlement,
          feature: feature
            ? {
                id: feature.id,
                code: feature.code,
                name: feature.name,
                kind: feature.kind
              }
            : null
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
          product: product
            ? {
                id: product.id,
                code: product.code,
                name: product.name
              }
            : null
        };
      })
    };
  }

  async listEntitlements(limit = 50) {
    const entitlements = await new LicenseRepository(this.db).listRecentEntitlements(limit);
    const userIds = [...new Set(entitlements.map((item) => item.userId))];
    const productIds = [...new Set(entitlements.map((item) => item.productId))];
    const featureIds = [...new Set(entitlements.map((item) => item.featureId))];
    const orderIds = [
      ...new Set(
        entitlements
          .filter((item) => item.sourceType === 'order' && item.sourceId)
          .map((item) => item.sourceId as string)
      )
    ];

    const [users, products, features, orders] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new LicenseRepository(this.db).listProductsByIds(productIds),
      new LicenseRepository(this.db).listFeaturesByIds(featureIds),
      new BillingRepository(this.db).listOrdersByIds(orderIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));
    const featureMap = new Map(features.map((item) => [item.id, item]));
    const orderMap = new Map(orders.map((item) => [item.id, item]));

    return {
      items: entitlements.map((entitlement) => {
        const user = userMap.get(entitlement.userId) ?? null;
        const product = productMap.get(entitlement.productId) ?? null;
        const feature = featureMap.get(entitlement.featureId) ?? null;
        const sourceOrder =
          entitlement.sourceType === 'order' && entitlement.sourceId
            ? orderMap.get(entitlement.sourceId) ?? null
            : null;

        return {
          ...entitlement,
          user: user
            ? {
                id: user.id,
                email: user.email,
                displayName: user.displayName
              }
            : null,
          product: product
            ? {
                id: product.id,
                code: product.code,
                name: product.name
              }
            : null,
          feature: feature
            ? {
                id: feature.id,
                code: feature.code,
                name: feature.name,
                kind: feature.kind
              }
            : null,
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

  async upsertCatalogBundle(
    productCode: string,
    input: {
      name: string;
      type: 'chrome_extension' | 'web_app' | 'service';
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      features: Array<{
        code: string;
        name: string;
        kind: string;
        status: 'active' | 'inactive' | 'cancelled' | 'expired';
      }>;
      plans: Array<{
        code: string;
        name: string;
        billingPriceId?: string;
        priceAmount: number;
        currency: string;
        interval: 'month' | 'year' | 'one_time';
        status: 'active' | 'inactive' | 'cancelled' | 'expired';
        featureCodes: string[];
        meta?: Record<string, unknown>;
      }>;
    },
    actorUserId: string
  ) {
    const normalizedFeatures = [
      ...new Map(
        input.features.map((feature) => [
          feature.code.trim(),
          {
            code: feature.code.trim(),
            name: feature.name.trim(),
            kind: feature.kind.trim() || 'boolean',
            status: feature.status
          }
        ])
      ).values()
    ].filter((feature) => feature.code && feature.name);

    const normalizedPlans = [
      ...new Map(
        input.plans.map((plan) => [
          plan.code.trim(),
          {
            code: plan.code.trim(),
            name: plan.name.trim(),
            billingPriceId: plan.billingPriceId?.trim() || null,
            priceAmount: plan.priceAmount,
            currency: plan.currency.trim().toUpperCase() || 'CNY',
            interval: plan.interval,
            status: plan.status,
            featureCodes: [...new Set(plan.featureCodes.map((code) => code.trim()).filter(Boolean))],
            meta: plan.meta ?? {}
          }
        ])
      ).values()
    ].filter((plan) => plan.code && plan.name);

    if (normalizedFeatures.length === 0) {
      throw httpError(422, 'At least one feature is required');
    }

    if (normalizedPlans.length === 0) {
      throw httpError(422, 'At least one plan is required');
    }

    const declaredFeatureCodes = new Set(normalizedFeatures.map((feature) => feature.code));
    const missingFeatureRefs = normalizedPlans.flatMap((plan) =>
      plan.featureCodes.filter((featureCode) => !declaredFeatureCodes.has(featureCode)).map((featureCode) => `${plan.code}:${featureCode}`)
    );

    if (missingFeatureRefs.length > 0) {
      throw httpError(422, `Unknown feature references: ${missingFeatureRefs.join(', ')}`);
    }

    const result = await this.db.transaction(async (tx) => {
      const licenseRepository = new LicenseRepository(tx as DbClient);
      const product = await licenseRepository.upsertProduct({
        code: productCode,
        name: input.name,
        type: input.type,
        status: input.status
      });

      const features = [];
      for (const featureInput of normalizedFeatures) {
        features.push(
          await licenseRepository.upsertFeature({
            productId: product.id,
            code: featureInput.code,
            name: featureInput.name,
            kind: featureInput.kind,
            status: featureInput.status
          })
        );
      }

      const featureMap = new Map(features.map((feature) => [feature.code, feature]));
      const plans = [];
      const planFeatureMappings = [];

      for (const planInput of normalizedPlans) {
        const plan = await licenseRepository.upsertPlan({
          productId: product.id,
          code: planInput.code,
          name: planInput.name,
          billingProvider: 'self_hosted',
          billingPriceId: planInput.billingPriceId,
          priceAmount: planInput.priceAmount,
          currency: planInput.currency,
          interval: planInput.interval,
          meta: planInput.meta,
          status: planInput.status
        });
        plans.push(plan);

        const featureIds = planInput.featureCodes
          .map((featureCode) => featureMap.get(featureCode)?.id ?? null)
          .filter((featureId): featureId is string => Boolean(featureId));

        const mappings = await licenseRepository.replacePlanFeatureMappings(plan.id, featureIds);
        planFeatureMappings.push(...mappings);
      }

      await licenseRepository.deactivateFeaturesByProductExceptCodes(
        product.id,
        normalizedFeatures.map((feature) => feature.code)
      );
      await licenseRepository.deactivatePlansByProductExceptCodes(
        product.id,
        normalizedPlans.map((plan) => plan.code)
      );

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        eventName: 'catalog.bundle_upserted',
        properties: {
          productCode,
          featureCodes: normalizedFeatures.map((feature) => feature.code),
          planCodes: normalizedPlans.map((plan) => plan.code)
        }
      });

      return {
        product,
        features,
        plans,
        planFeatures: planFeatureMappings
      };
    });

    return result;
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
                extensionInstallId: install.extensionInstallId,
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
          product: product
            ? {
                id: product.id,
                code: product.code,
                name: product.name
              }
            : null
        };
      })
    };
  }

  async listBillingWebhookEvents(limit = 50) {
    return {
      items: await new BillingRepository(this.db).listRecentWebhookEvents(limit)
    };
  }

  async grantEntitlement(
    input: {
      userEmail: string;
      planCode: string;
      reason?: string;
    },
    actorUserId: string
  ) {
    const user = await new AuthRepository(this.db).findUserByEmail(input.userEmail);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const checkoutPlan = await new LicenseService(this.db).getPlanForCheckout(input.planCode);
    const sourceId = randomUUID();
    const result = await this.db.transaction(async (tx) => {
      const txDb = tx as DbClient;
      const grant = await new LicenseService(txDb).grantEntitlementsForPlan({
        userId: user.id,
        planId: checkoutPlan.plan.id,
        sourceType: 'grant',
        sourceId
      });

      await new EventService(txDb).capture({
        userId: user.id,
        productId: grant.product.id,
        eventName: 'admin.entitlements_granted',
        properties: {
          actorUserId,
          planId: grant.plan.id,
          planCode: grant.plan.code,
          sourceId,
          reason: input.reason ?? null,
          granted: grant.granted,
          grantReason: grant.reason
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
      plan: {
        id: result.plan.id,
        code: result.plan.code,
        name: result.plan.name,
        interval: result.plan.interval
      },
      product: {
        id: result.product.id,
        code: result.product.code,
        name: result.product.name
      },
      granted: result.granted,
      reason: result.reason,
      sourceId,
      entitlementCount: result.entitlements.length
    };
  }

  async revokeEntitlement(entitlementId: string, actorUserId: string) {
    const repository = new LicenseRepository(this.db);
    const entitlement = await repository.findEntitlementById(entitlementId);

    if (!entitlement) {
      throw httpError(404, 'Entitlement not found');
    }

    const revoked = await this.db.transaction(async (tx) => {
      const txDb = tx as DbClient;
      const txRepository = new LicenseRepository(txDb);
      const changed =
        entitlement.sourceId && entitlement.sourceType
          ? await txRepository.cancelEntitlementsBySource(entitlement.sourceType, entitlement.sourceId)
          : (() => {
              const row = txRepository.cancelEntitlementById(entitlement.id);
              return row.then((item) => (item ? [item] : []));
            })();

      const items = await changed;

      await new EventService(txDb).capture({
        userId: entitlement.userId,
        productId: entitlement.productId,
        eventName: 'admin.entitlements_revoked',
        properties: {
          actorUserId,
          sourceType: entitlement.sourceType,
          sourceId: entitlement.sourceId ?? null,
          entitlementId: entitlement.id,
          revokedCount: items.length
        }
      });

      return items;
    });

    return {
      entitlementId: entitlement.id,
      sourceType: entitlement.sourceType,
      sourceId: entitlement.sourceId,
      revokedCount: revoked.length,
      userId: entitlement.userId,
      productId: entitlement.productId
    };
  }

  // ─── User Management ────────────────────────────────────────────────────

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
    // Prevent self-demotion
    if (userId === actorUserId && input.role && input.role !== 'admin') {
      throw httpError(400, 'Cannot demote your own admin role');
    }

    // Prevent self-suspension
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
