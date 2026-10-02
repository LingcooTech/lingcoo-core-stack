import { queryBatch } from '../../db/query-batch';
import { pickAdminDependencies, type AdminDependencies } from './dependencies';
import { randomBytes, randomUUID } from 'node:crypto';

import { and, count, eq, isNull, gte, lte, type SQL } from 'drizzle-orm';

import { billingWebhookEvents, events, jobRuns, orders, supportTickets } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { AuditLogService } from '../../lib/audit-logs';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { JobRunService } from '../../lib/job-runs';
import type { AppRole } from '../../lib/rbac';
import { hashPasswordAsync } from '../../lib/security';
import { createAppAccess } from '../app/public';
import { createAuthAccess } from '../auth/public';
import { type BillingRepositoryPort as BillingRepository } from '../billing/public';

import { createEventAccess } from '../event/public';
import { type InstallRepositoryPort as InstallRepository } from '../install/public';
import { type LicenseRepositoryPort as LicenseRepository } from '../license/public';

export class AdminService {
  private readonly capabilities: AdminDependencies;
  constructor(
    capabilities: AdminDependencies,
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {
    this.capabilities = pickAdminDependencies(capabilities);
  }

  private async hydrateOrderRows(
    orders: Array<Awaited<ReturnType<BillingRepository['listOrders']>>['items'][number]>,
  ) {
    const userIds = [...new Set(orders.map((item) => item.userId))];
    const appIds = [...new Set(orders.map((item) => item.appId))];
    const planIds = [...new Set(orders.map((item) => item.planId))];
    const sessions = await this.capabilities
      .createCheckoutAccess(this.db)
      .listSessionsByOrderIds(orders.map((item) => item.id));

    const [users, plans, apps] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () => this.capabilities.createLicenseAccess(this.db).listPlansByIds(planIds),
      () => createAppAccess(this.db).listAppsByIds(appIds),
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
        plan: plan
          ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval }
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
              updatedAt: session.updatedAt,
            }
          : null,
      };
    });
  }

  private async hydrateEntitlementRows(
    entitlements: Awaited<ReturnType<LicenseRepository['listRecentEntitlementsByUserId']>>,
  ) {
    const userIds = [...new Set(entitlements.map((item) => item.userId))];
    const appIds = [...new Set(entitlements.map((item) => item.appId))];
    const planIds = [...new Set(entitlements.map((item) => item.planId))];
    const orderIds = [
      ...new Set(
        entitlements
          .filter((item) => item.sourceType === 'order' && item.sourceId)
          .map((item) => item.sourceId as string),
      ),
    ];

    const [users, apps, plans, orders] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () => createAppAccess(this.db).listAppsByIds(appIds),
      () => this.capabilities.createLicenseAccess(this.db).listPlansByIds(planIds),
      () => this.capabilities.createBillingAccess(this.db).listOrdersByIds(orderIds),
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const planMap = new Map(plans.map((item) => [item.id, item]));
    const orderMap = new Map(orders.map((item) => [item.id, item]));

    return entitlements.map((entitlement) => {
      const user = userMap.get(entitlement.userId) ?? null;
      const app = appMap.get(entitlement.appId) ?? null;
      const plan = planMap.get(entitlement.planId) ?? null;
      const sourceOrder =
        entitlement.sourceType === 'order' && entitlement.sourceId
          ? (orderMap.get(entitlement.sourceId) ?? null)
          : null;
      return {
        ...entitlement,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
        app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
        plan: plan
          ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval }
          : null,
        sourceOrder: sourceOrder
          ? { id: sourceOrder.id, orderNo: sourceOrder.orderNo, status: sourceOrder.status }
          : null,
      };
    });
  }

  private async hydrateInstallRows(
    installs: Awaited<ReturnType<InstallRepository['listRecentInstallsByUserId']>>,
  ) {
    const userIds = [
      ...new Set(
        installs.map((item) => item.userId).filter((item): item is string => Boolean(item)),
      ),
    ];
    const appIds = [...new Set(installs.map((item) => item.appId))];

    const [users, apps] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () => createAppAccess(this.db).listAppsByIds(appIds),
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));

    return installs.map((install) => {
      const user = install.userId ? (userMap.get(install.userId) ?? null) : null;
      const app = appMap.get(install.appId) ?? null;
      return {
        ...install,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
        app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
      };
    });
  }

  async listOrders(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded';
    provider?: 'wechat_pay' | 'alipay';
  }) {
    const result = await this.capabilities.createBillingAccess(this.db).listOrders(query);
    return {
      items: await this.hydrateOrderRows(result.items),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getOrderDetail(orderNo: string) {
    const order = await this.capabilities.createBillingAccess(this.db).findOrderByOrderNo(orderNo);
    if (!order) {
      throw httpError(404, 'Order not found');
    }

    const [hydratedOrder] = await this.hydrateOrderRows([order]);
    const [attempts, entitlements, events] = await queryBatch(this.db, [
      () =>
        this.capabilities.createCheckoutAccess(this.db).listPaymentAttemptsByOrderIds([order.id]),
      () =>
        this.capabilities.createLicenseAccess(this.db).listEntitlementsBySource('order', order.id),
      () => createEventAccess(this.db).listRecentEventsByOrderNo(orderNo, 20),
    ]);

    // Derive plan info for entitlements
    const planIds = [...new Set(entitlements.map((e) => e.planId))];
    const plans = await this.capabilities.createLicenseAccess(this.db).listPlansByIds(planIds);
    const planMap = new Map(plans.map((p) => [p.id, p]));

    return {
      item: hydratedOrder,
      paymentAttempts: attempts,
      entitlements: entitlements.map((entitlement) => {
        const plan = planMap.get(entitlement.planId) ?? null;
        return {
          ...entitlement,
          plan: plan
            ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval }
            : null,
        };
      }),
      events,
    };
  }

  async reconcileOrder(orderNo: string) {
    return this.capabilities
      .createBillingService(this.db, this.env)
      .syncOrderStatusByOrderNo(orderNo);
  }

  async cancelOrder(orderNo: string) {
    return this.capabilities.createBillingService(this.db, this.env).cancelOrderByOrderNo(orderNo);
  }

  async refundOrder(orderNo: string) {
    return this.capabilities.createBillingService(this.db, this.env).refundOrderByOrderNo(orderNo);
  }

  async listInstalls(query: { limit: number; offset: number; search?: string }) {
    const result = await this.capabilities.createInstallAccess(this.db).listInstalls(query);
    const installs = result.items;
    const userIds = [
      ...new Set(
        installs.map((item) => item.userId).filter((item): item is string => Boolean(item)),
      ),
    ];
    const appIds = [...new Set(installs.map((item) => item.appId))];

    const [users, apps] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () => createAppAccess(this.db).listAppsByIds(appIds),
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));

    return {
      items: installs.map((install) => {
        const user = install.userId ? (userMap.get(install.userId) ?? null) : null;
        const app = appMap.get(install.appId) ?? null;
        return {
          ...install,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listEntitlements(query: { limit: number; offset: number; search?: string }) {
    const result = await this.capabilities.createLicenseAccess(this.db).listEntitlements(query);
    const entitlements = result.items;
    const userIds = [...new Set(entitlements.map((item) => item.userId))];
    const appIds = [...new Set(entitlements.map((item) => item.appId))];
    const planIds = [...new Set(entitlements.map((item) => item.planId))];
    const orderIds = [
      ...new Set(
        entitlements
          .filter((item) => item.sourceType === 'order' && item.sourceId)
          .map((item) => item.sourceId as string),
      ),
    ];

    const [users, apps, plans, orders] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () => createAppAccess(this.db).listAppsByIds(appIds),
      () => this.capabilities.createLicenseAccess(this.db).listPlansByIds(planIds),
      () => this.capabilities.createBillingAccess(this.db).listOrdersByIds(orderIds),
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
            ? (orderMap.get(entitlement.sourceId) ?? null)
            : null;
        return {
          ...entitlement,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
          plan: plan
            ? { id: plan.id, code: plan.code, name: plan.name, interval: plan.interval }
            : null,
          sourceOrder: sourceOrder
            ? { id: sourceOrder.id, orderNo: sourceOrder.orderNo, status: sourceOrder.status }
            : null,
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listEvents(query: { limit: number; offset: number; search?: string }) {
    const result = await createEventAccess(this.db).listEvents(query);
    const events = result.items;
    const userIds = [
      ...new Set(events.map((item) => item.userId).filter((item): item is string => Boolean(item))),
    ];
    const installIds = [
      ...new Set(
        events.map((item) => item.installId).filter((item): item is string => Boolean(item)),
      ),
    ];
    const installs = await this.capabilities
      .createInstallAccess(this.db)
      .listInstallsByIds(installIds);
    const appIds = [
      ...new Set(
        events
          .map((item) => item.appId)
          .concat(installs.map((item) => item.appId))
          .filter((item): item is string => Boolean(item)),
      ),
    ];

    const [users, apps] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () => createAppAccess(this.db).listAppsByIds(appIds),
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const installMap = new Map(installs.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));

    return {
      items: events.map((event) => {
        const install = event.installId ? (installMap.get(event.installId) ?? null) : null;
        const app = appMap.get(event.appId ?? install?.appId ?? '') ?? null;
        const user = event.userId ? (userMap.get(event.userId) ?? null) : null;
        return {
          ...event,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          install: install
            ? {
                id: install.id,
                extensionInstallId: install.extensionInstallId,
                status: install.status,
              }
            : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listBillingWebhookEvents(query: { limit: number; offset: number; search?: string }) {
    const result = await this.capabilities.createBillingAccess(this.db).listWebhookEvents(query);
    return {
      items: result.items,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getObservabilitySummary() {
    const now = Date.now();
    const staleJobBefore = new Date(now - this.env.WORKER_STALE_JOB_TIMEOUT_MS);
    const staleWebhookBefore = new Date(now - 10 * 60_000);
    const staleOrderBefore = new Date(now - 30 * 60_000);
    const staleTicketBefore = new Date(now - 12 * 60 * 60_000);
    const recentEventsAfter = new Date(now - 24 * 60 * 60_000);

    const [
      deadJobs,
      failedJobs,
      runningJobs,
      staleRunningJobs,
      pendingJobs,
      stalePendingOrders,
      pendingOrders,
      unprocessedWebhooks,
      staleWebhooks,
      waitingStaffTickets,
      staleWaitingStaffTickets,
      events24h,
    ] = await queryBatch(this.db, [
      () => this.countRows(jobRuns, eq(jobRuns.status, 'dead')),
      () => this.countRows(jobRuns, eq(jobRuns.status, 'failed')),
      () => this.countRows(jobRuns, eq(jobRuns.status, 'running')),
      () =>
        this.countRows(
          jobRuns,
          and(eq(jobRuns.status, 'running'), lte(jobRuns.lockedAt, staleJobBefore)),
        ),
      () => this.countRows(jobRuns, eq(jobRuns.status, 'pending')),
      () =>
        this.countRows(
          orders,
          and(eq(orders.status, 'pending'), lte(orders.createdAt, staleOrderBefore)),
        ),
      () => this.countRows(orders, eq(orders.status, 'pending')),
      () => this.countRows(billingWebhookEvents, isNull(billingWebhookEvents.processedAt)),
      () =>
        this.countRows(
          billingWebhookEvents,
          and(
            isNull(billingWebhookEvents.processedAt),
            lte(billingWebhookEvents.createdAt, staleWebhookBefore),
          ),
        ),
      () => this.countRows(supportTickets, eq(supportTickets.status, 'waiting_staff')),
      () =>
        this.countRows(
          supportTickets,
          and(
            eq(supportTickets.status, 'waiting_staff'),
            lte(supportTickets.lastActivityAt, staleTicketBefore),
          ),
        ),
      () => this.countRows(events, gte(events.eventTime, recentEventsAfter)),
    ]);

    const alerts = [
      deadJobs > 0
        ? {
            id: 'dead-jobs',
            level: 'error' as const,
            title: '存在死信任务',
            description: `${deadJobs} 条任务已耗尽重试次数，需要人工处理或重试。`,
            count: deadJobs,
            href: '/admin/observability',
          }
        : null,
      staleRunningJobs > 0
        ? {
            id: 'stale-running-jobs',
            level: 'error' as const,
            title: '存在卡住的运行中任务',
            description: `${staleRunningJobs} 条任务长时间处于 running 状态，可能存在 worker 异常。`,
            count: staleRunningJobs,
            href: '/admin/observability',
          }
        : null,
      staleWebhooks > 0
        ? {
            id: 'stale-webhooks',
            level: 'warning' as const,
            title: '支付回调堆积',
            description: `${staleWebhooks} 条支付回调超过 10 分钟仍未处理。`,
            count: staleWebhooks,
            href: '/admin/observability',
          }
        : null,
      stalePendingOrders > 0
        ? {
            id: 'stale-pending-orders',
            level: 'warning' as const,
            title: '存在长时间待支付订单',
            description: `${stalePendingOrders} 笔订单超过 30 分钟仍为 pending，建议排查并补单。`,
            count: stalePendingOrders,
            href: '/admin/orders',
          }
        : null,
      staleWaitingStaffTickets > 0
        ? {
            id: 'stale-waiting-staff-tickets',
            level: 'warning' as const,
            title: '工单待处理超时',
            description: `${staleWaitingStaffTickets} 张工单超过 12 小时未获客服处理。`,
            count: staleWaitingStaffTickets,
            href: '/admin/tickets',
          }
        : null,
      failedJobs > 0
        ? {
            id: 'failed-jobs',
            level: 'info' as const,
            title: '存在待重试失败任务',
            description: `${failedJobs} 条任务失败后仍可重试。`,
            count: failedJobs,
            href: '/admin/observability',
          }
        : null,
    ].filter(Boolean);

    return {
      metrics: {
        deadJobs,
        failedJobs,
        runningJobs,
        pendingJobs,
        pendingOrders,
        stalePendingOrders,
        unprocessedWebhooks,
        waitingStaffTickets,
        events24h,
      },
      alerts,
    };
  }

  private async countRows(
    table:
      | typeof jobRuns
      | typeof orders
      | typeof billingWebhookEvents
      | typeof supportTickets
      | typeof events,
    where: SQL<unknown> | undefined,
  ) {
    const [result] = await this.db.select({ count: count() }).from(table).where(where);
    return Number(result?.count ?? 0);
  }

  async listJobRuns(query: { limit: number; offset: number; search?: string }) {
    const result = await new JobRunService(this.db, this.env).listJobs(query);
    return {
      items: result.items,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async retryJobRun(jobId: string) {
    const job = await new JobRunService(this.db, this.env).retry(jobId);
    if (!job) {
      throw httpError(404, 'Job not found');
    }
    return {
      id: job.id,
      kind: job.kind,
      queue: job.queue,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    };
  }

  async listAuditLogs(query: { limit: number; offset: number; search?: string }) {
    const result = await new AuditLogService(this.db).list(query);
    return {
      items: result.items,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async grantEntitlement(
    input: { userEmail: string; planCode: string; reason?: string },
    actorUserId: string,
  ) {
    const user = await createAuthAccess(this.db).findUserByEmail(input.userEmail);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const checkoutPlan = await this.capabilities
      .createLicenseService(this.db)
      .getPlanForCheckout(input.planCode);
    const sourceId = randomUUID();
    const result = await this.db.transaction(async (tx) => {
      const txDb = tx;
      const grant = await this.capabilities.createLicenseService(txDb).grantEntitlementsForPlan({
        userId: user.id,
        planId: checkoutPlan.plan.id,
        sourceType: 'grant',
        sourceId,
      });

      await this.capabilities.createEventService(txDb).capture({
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
          grantReason: grant.reason,
        },
      });

      return grant;
    });

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      plan: {
        id: result.plan.id,
        code: result.plan.code,
        name: result.plan.name,
        interval: result.plan.interval,
      },
      app: { id: result.app.id, code: result.app.code, name: result.app.name },
      granted: result.granted,
      reason: result.reason,
      sourceId,
    };
  }

  async revokeEntitlement(entitlementId: string, actorUserId: string) {
    const repository = this.capabilities.createLicenseAccess(this.db);
    const entitlement = await repository.findEntitlementById(entitlementId);
    if (!entitlement) {
      throw httpError(404, 'Entitlement not found');
    }
    const plan = await repository.getPlanById(entitlement.planId);

    const revoked = await this.db.transaction(async (tx) => {
      const txDb = tx;
      const txRepository = this.capabilities.createLicenseAccess(txDb);
      const changed =
        entitlement.sourceId && entitlement.sourceType
          ? await txRepository.cancelEntitlementsBySource(
              entitlement.sourceType,
              entitlement.sourceId,
            )
          : (() => {
              const row = txRepository.cancelEntitlementById(entitlement.id);
              return row.then((item) => (item ? [item] : []));
            })();
      const items = await changed;

      await this.capabilities.createEventService(txDb).capture({
        userId: entitlement.userId,
        appId: entitlement.appId,
        eventName: 'admin.entitlements_revoked',
        properties: {
          actorUserId,
          sourceType: entitlement.sourceType,
          sourceId: entitlement.sourceId ?? null,
          entitlementId: entitlement.id,
          planCode: plan?.code ?? null,
          revokedCount: items.length,
        },
      });

      return items;
    });

    return {
      entitlementId: entitlement.id,
      sourceType: entitlement.sourceType,
      sourceId: entitlement.sourceId,
      revokedCount: revoked.length,
      userId: entitlement.userId,
      appId: entitlement.appId,
    };
  }

  // ─── User Management ────────────────────────────────────────────────────

  async listUsers(query: {
    limit: number;
    offset: number;
    search?: string;
    role?: AppRole;
    status?: 'active' | 'suspended';
  }) {
    const result = await createAuthAccess(this.db).listUsers(query);
    return { items: result.items, total: result.total, limit: query.limit, offset: query.offset };
  }

  async getUser(userId: string) {
    const user = await createAuthAccess(this.db).findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const [orders, entitlements, installs, auditLogs, recentEvents, tickets] = await queryBatch(
      this.db,
      [
        () => this.capabilities.createBillingAccess(this.db).listRecentOrdersByUserId(userId, 10),
        () =>
          this.capabilities.createLicenseAccess(this.db).listRecentEntitlementsByUserId(userId, 10),
        () => this.capabilities.createInstallAccess(this.db).listRecentInstallsByUserId(userId, 10),
        () => new AuditLogService(this.db).listRecentForUser(userId, 10),
        () => createEventAccess(this.db).listRecentEventsByUserId(userId, 10),
        () => this.capabilities.createTicketService(this.db).listRecentTicketsByUserId(userId, 10),
      ],
    );
    const [hydratedOrders, hydratedEntitlements, hydratedInstalls] = await queryBatch(this.db, [
      () => this.hydrateOrderRows(orders),
      () => this.hydrateEntitlementRows(entitlements),
      () => this.hydrateInstallRows(installs),
    ]);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      activity: {
        summary: {
          recentOrders: hydratedOrders.length,
          activeEntitlements: hydratedEntitlements.filter((item) => item.status === 'active')
            .length,
          installs: hydratedInstalls.length,
          auditLogs: auditLogs.length,
          events: recentEvents.length,
          tickets: tickets.length,
        },
        orders: hydratedOrders,
        entitlements: hydratedEntitlements,
        installs: hydratedInstalls,
        auditLogs,
        events: recentEvents,
        tickets,
      },
    };
  }

  async updateUser(
    userId: string,
    input: { displayName?: string; role?: AppRole; status?: 'active' | 'suspended' },
    actorUserId: string,
  ) {
    if (userId === actorUserId && input.role) {
      throw httpError(400, 'Cannot change your own role');
    }
    if (userId === actorUserId && input.status === 'suspended') {
      throw httpError(400, 'Cannot suspend your own account');
    }

    const repository = createAuthAccess(this.db);
    const existing = await repository.findUserById(userId);
    if (!existing) {
      throw httpError(404, 'User not found');
    }

    const updated = await repository.updateUser(userId, input);
    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      eventName: 'admin.user_updated',
      properties: { targetUserId: userId, changes: input },
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
    const repository = createAuthAccess(this.db);
    const user = await repository.findUserById(userId);
    if (!user) {
      throw httpError(404, 'User not found');
    }

    const temporaryPassword = randomBytes(9).toString('base64url').slice(0, 12);
    await repository.updatePasswordCredential(userId, await hashPasswordAsync(temporaryPassword));

    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      eventName: 'admin.user_password_reset',
      properties: { targetUserId: userId },
    });

    return { userId: user.id, email: user.email, temporaryPassword };
  }
}
