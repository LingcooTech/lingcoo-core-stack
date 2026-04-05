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
    orders: Array<Awaited<ReturnType<BillingRepository['listOrders']>>['items'][number]>
  ) {
    const userIds = [...new Set(orders.map((item) => item.userId))];
    const appIds = [...new Set(orders.map((item) => item.appId))];
    const planIds = [...new Set(orders.map((item) => item.planId))];
    const sessions = await new CheckoutRepository(this.db).listSessionsByOrderIds(orders.map((item) => item.id));

    const [users, plans, apps] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new LicenseRepository(this.db).listPlansByIds(planIds),
      new AppRepository(this.db).listAppsByIds(appIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const planMap = new Map(plans.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const sessionMap = new Map(sessions.map((item) => [item.orderId, item]));

    return orders.map((order) => {
      const session = sessionMap.get(order.id) ?? null;
      const app = appMap.get(order.appId) ?? null;
      const user = userMap.get(order.userId) ?? null;
      const plan = planMap.get(order.planId) ?? null;

      return {
        ...order,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
        app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
        plan: plan ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval } : null,
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
          : null
      };
    });
  }

  async listOrders(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
    provider?: 'wechat_pay' | 'alipay';
  }) {
    const result = await new BillingRepository(this.db).listOrders(query);
    return {
      items: await this.hydrateOrderRows(result.items),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
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

    // Derive plan info for entitlements
    const planIds = [...new Set(entitlements.map((e) => e.planId))];
    const plans = await new LicenseRepository(this.db).listPlansByIds(planIds);
    const planMap = new Map(plans.map((p) => [p.id, p]));

    return {
      item: hydratedOrder,
      paymentAttempts: attempts,
      entitlements: entitlements.map((entitlement) => {
        const plan = planMap.get(entitlement.planId) ?? null;
        return {
          ...entitlement,
          plan: plan ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval } : null
        };
      }),
      events
    };
  }

  async reconcileOrder(orderNo: string) {
    return new BillingService(this.db, this.env).syncOrderStatusByOrderNo(orderNo);
  }

  async listInstalls(query: {
    limit: number;
    offset: number;
    search?: string;
  }) {
    const result = await new InstallRepository(this.db).listInstalls(query);
    const installs = result.items;
    const userIds = [...new Set(installs.map((item) => item.userId).filter((item): item is string => Boolean(item)))];
    const appIds = [...new Set(installs.map((item) => item.appId))];

    const [users, apps] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new AppRepository(this.db).listAppsByIds(appIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));

    return {
      items: installs.map((install) => {
        const user = install.userId ? userMap.get(install.userId) ?? null : null;
        const app = appMap.get(install.appId) ?? null;
        return {
          ...install,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listEntitlements(query: {
    limit: number;
    offset: number;
    search?: string;
  }) {
    const result = await new LicenseRepository(this.db).listEntitlements(query);
    const entitlements = result.items;
    const userIds = [...new Set(entitlements.map((item) => item.userId))];
    const appIds = [...new Set(entitlements.map((item) => item.appId))];
    const planIds = [...new Set(entitlements.map((item) => item.planId))];
    const orderIds = [
      ...new Set(
        entitlements
          .filter((item) => item.sourceType === 'order' && item.sourceId)
          .map((item) => item.sourceId as string)
      )
    ];

    const [users, apps, plans, orders] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new AppRepository(this.db).listAppsByIds(appIds),
      new LicenseRepository(this.db).listPlansByIds(planIds),
      new BillingRepository(this.db).listOrdersByIds(orderIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const planMap = new Map(plans.map((item) => [item.id, item]));
    const orderMap = new Map(orders.map((item) => [item.id, item]));

    return {
      items: entitlements.map((entitlement) => {
        const user = userMap.get(entitlement.userId) ?? null;
        const app = appMap.get(entitlement.appId) ?? null;
        const plan = planMap.get(entitlement.planId) ?? null;
        const sourceOrder =
          entitlement.sourceType === 'order' && entitlement.sourceId
            ? orderMap.get(entitlement.sourceId) ?? null
            : null;
        return {
          ...entitlement,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
          plan: plan ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval } : null,
          sourceOrder: sourceOrder ? { id: sourceOrder.id, orderNo: sourceOrder.orderNo, status: sourceOrder.status } : null
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listEvents(query: {
    limit: number;
    offset: number;
    search?: string;
  }) {
    const result = await new EventRepository(this.db).listEvents(query);
    const events = result.items;
    const userIds = [...new Set(events.map((item) => item.userId).filter((item): item is string => Boolean(item)))];
    const installIds = [...new Set(events.map((item) => item.installId).filter((item): item is string => Boolean(item)))];
    const installs = await new InstallRepository(this.db).listInstallsByIds(installIds);
    const appIds = [
      ...new Set(
        events.map((item) => item.appId)
          .concat(installs.map((item) => item.appId))
          .filter((item): item is string => Boolean(item))
      )
    ];

    const [users, apps] = await Promise.all([
      new AuthRepository(this.db).listUsersByIds(userIds),
      new AppRepository(this.db).listAppsByIds(appIds)
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const installMap = new Map(installs.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));

    return {
      items: events.map((event) => {
        const install = event.installId ? installMap.get(event.installId) ?? null : null;
        const app = appMap.get(event.appId ?? install?.appId ?? '') ?? null;
        const user = event.userId ? userMap.get(event.userId) ?? null : null;
        return {
          ...event,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          install: install ? { id: install.id, extensionInstallId: install.extensionInstallId, status: install.status } : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listBillingWebhookEvents(query: {
    limit: number;
    offset: number;
    search?: string;
  }) {
    const result = await new BillingRepository(this.db).listWebhookEvents(query);
    return {
      items: result.items,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async grantEntitlement(
    input: { userEmail: string; planCode: string; reason?: string },
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
        appId: grant.app.id,
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
      user: { id: user.id, email: user.email, displayName: user.displayName },
      plan: { id: result.plan.id, code: result.plan.code, name: result.plan.name, interval: result.plan.interval },
      app: { id: result.app.id, code: result.app.code, name: result.app.name },
      granted: result.granted,
      reason: result.reason,
      sourceId
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
        appId: entitlement.appId,
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
      appId: entitlement.appId
    };
  }

  // ─── User Management ────────────────────────────────────────────────────

  async listUsers(query: { limit: number; offset: number; search?: string; role?: 'user' | 'admin'; status?: 'active' | 'suspended' }) {
    const result = await new AuthRepository(this.db).listUsers(query);
    return { items: result.items, total: result.total, limit: query.limit, offset: query.offset };
  }

  async getUser(userId: string) {
    const user = await new AuthRepository(this.db).findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }
    return {
      id: user.id, email: user.email, displayName: user.displayName,
      role: user.role, status: user.status, emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt, updatedAt: user.updatedAt
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
      properties: { targetUserId: userId, changes: input }
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
    await repository.updatePasswordCredential(userId, hashPassword(temporaryPassword));

    await new EventService(this.db).capture({
      userId: actorUserId,
      eventName: 'admin.user_password_reset',
      properties: { targetUserId: userId }
    });

    return { userId: user.id, email: user.email, temporaryPassword };
  }
}
