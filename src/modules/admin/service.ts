import type { DbClient } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { AppRepository } from '../app/repository';
import { AuthRepository } from '../auth/repository';
import { BillingRepository } from '../billing/repository';
import { BillingService } from '../billing/service';
import { CheckoutRepository } from '../checkout/repository';
import { InstallRepository } from '../install/repository';
import { LicenseRepository } from '../license/repository';

export class AdminService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  async listOrders(limit = 50) {
    const repository = new BillingRepository(this.db);
    const orders = await repository.listRecentOrders(limit);
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

    return {
      items: orders.map((order) => {
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
                expiresAt: session.expiresAt,
                completedAt: session.completedAt
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
      })
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
}
