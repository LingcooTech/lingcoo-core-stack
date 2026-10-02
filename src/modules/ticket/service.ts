import { queryBatch } from '../../db/query-batch';
import { pickTicketDependencies, type TicketDependencies } from './dependencies';
import { randomUUID } from 'node:crypto';

import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { canAccessAdminConsole, normalizeRole } from '../../lib/rbac';
import { createAppAccess } from '../app/public';
import { createAuthAccess } from '../auth/public';

import { TicketRepository } from './repository';

type SupportTicketStatus = 'waiting_staff' | 'waiting_user' | 'resolved' | 'closed';
type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type SupportTicketCategory =
  | 'account'
  | 'billing'
  | 'access'
  | 'install'
  | 'deployment'
  | 'bug'
  | 'feature'
  | 'other';

type TicketRecord = NonNullable<Awaited<ReturnType<TicketRepository['findTicketByTicketNo']>>>;

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readDeploymentDomainValues(meta: unknown) {
  const raw = normalizeRecord(normalizeRecord(meta).deliveryDomains);
  const values = normalizeRecord(raw.values);
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, normalizeString(value)] as const)
      .filter(([, value]) => value.length > 0),
  );
}

function createTicketNo(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `TK-${year}${month}${day}-${suffix}`;
}

function formatSystemStatusMessage(status: SupportTicketStatus) {
  switch (status) {
    case 'waiting_staff':
      return '工单状态已更新为待处理。';
    case 'waiting_user':
      return '工单状态已更新为等待你的回复。';
    case 'resolved':
      return '工单已标记为已解决。';
    case 'closed':
    default:
      return '工单已关闭。';
  }
}

export class TicketService {
  private readonly repository: TicketRepository;

  private readonly capabilities: TicketDependencies;
  constructor(
    capabilities: TicketDependencies,
    private readonly db: DbExecutor,
  ) {
    this.capabilities = pickTicketDependencies(capabilities);
    this.repository = new TicketRepository(db);
  }

  private async loadTicketOrThrow(ticketNo: string) {
    const ticket = await this.repository.findTicketByTicketNo(ticketNo);
    if (!ticket) {
      throw httpError(404, 'Ticket not found');
    }
    return ticket;
  }

  private async ensureTicketOwner(ticketNo: string, userId: string) {
    const ticket = await this.loadTicketOrThrow(ticketNo);
    if (ticket.userId !== userId) {
      throw httpError(403, 'You can only access your own tickets');
    }
    return ticket;
  }

  private async hydrateTickets(tickets: TicketRecord[]) {
    const userIds = [...new Set(tickets.map((ticket) => ticket.userId))];
    const assigneeIds = [
      ...new Set(
        tickets
          .map((ticket) => ticket.assignedAdminUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const appIds = [
      ...new Set(
        tickets.map((ticket) => ticket.appId).filter((value): value is string => Boolean(value)),
      ),
    ];
    const orderIds = [
      ...new Set(
        tickets.map((ticket) => ticket.orderId).filter((value): value is string => Boolean(value)),
      ),
    ];
    const installIds = [
      ...new Set(
        tickets
          .map((ticket) => ticket.installId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const deploymentIds = [
      ...new Set(
        tickets
          .map((ticket) => ticket.deploymentId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const [users, apps, orders, installs, deployments, messageCounts] = await queryBatch(this.db, [
      () => createAuthAccess(this.db).listUsersByIds([...new Set([...userIds, ...assigneeIds])]),
      () => createAppAccess(this.db).listAppsByIds(appIds),
      () => this.capabilities.createBillingAccess(this.db).listOrdersByIds(orderIds),
      () => this.capabilities.createInstallAccess(this.db).listInstallsByIds(installIds),
      () => this.capabilities.createDeploymentAccess(this.db).listDeploymentsByIds(deploymentIds),
      () => this.repository.listMessageCountsByTicketIds(tickets.map((ticket) => ticket.id)),
    ]);

    const userMap = new Map(users.map((item) => [item.id, item]));
    const appMap = new Map(apps.map((item) => [item.id, item]));
    const orderMap = new Map(orders.map((item) => [item.id, item]));
    const installMap = new Map(installs.map((item) => [item.id, item]));
    const deploymentMap = new Map(deployments.map((item) => [item.id, item]));
    const messageCountMap = new Map(messageCounts.map((item) => [item.ticketId, item.count]));

    return tickets.map((ticket) => {
      const user = userMap.get(ticket.userId) ?? null;
      const assignee = ticket.assignedAdminUserId
        ? (userMap.get(ticket.assignedAdminUserId) ?? null)
        : null;
      const app = ticket.appId ? (appMap.get(ticket.appId) ?? null) : null;
      const order = ticket.orderId ? (orderMap.get(ticket.orderId) ?? null) : null;
      const install = ticket.installId ? (installMap.get(ticket.installId) ?? null) : null;
      const deployment = ticket.deploymentId
        ? (deploymentMap.get(ticket.deploymentId) ?? null)
        : null;

      return {
        ...ticket,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
        app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
        order: order
          ? {
              id: order.id,
              orderNo: order.orderNo,
              status: order.status,
              subject: order.subject,
              amount: order.amount,
              currency: order.currency,
              createdAt: order.createdAt,
            }
          : null,
        install: install
          ? {
              id: install.id,
              extensionInstallId: install.extensionInstallId,
              status: install.status,
              appVersion: install.appVersion,
              lastSeenAt: install.lastSeenAt,
            }
          : null,
        deployment: deployment
          ? {
              id: deployment.id,
              label: deployment.label,
              environment: deployment.environment,
              status: deployment.status,
              domainValues: readDeploymentDomainValues(deployment.meta),
            }
          : null,
        assignee: assignee
          ? { id: assignee.id, email: assignee.email, displayName: assignee.displayName }
          : null,
        messageCount: messageCountMap.get(ticket.id) ?? 0,
      };
    });
  }

  private async buildTicketDetail(ticket: TicketRecord, options?: { includeInternal?: boolean }) {
    const [hydratedTicket] = await this.hydrateTickets([ticket]);
    const messages = await this.repository.listMessagesByTicketId(ticket.id, {
      includeInternal: options?.includeInternal,
    });
    const authorIds = [
      ...new Set(
        messages
          .map((message) => message.authorUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const authors = await createAuthAccess(this.db).listUsersByIds(authorIds);
    const authorMap = new Map(authors.map((item) => [item.id, item]));

    return {
      ticket: hydratedTicket,
      messages: messages.map((message) => {
        const author = message.authorUserId ? (authorMap.get(message.authorUserId) ?? null) : null;
        return {
          ...message,
          author: author
            ? { id: author.id, email: author.email, displayName: author.displayName }
            : null,
        };
      }),
    };
  }

  private async resolveCreateContext(input: {
    userId: string;
    appCode?: string;
    orderNo?: string;
    extensionInstallId?: string;
    deploymentId?: string;
  }) {
    const appCode = normalizeString(input.appCode);
    const orderNo = normalizeString(input.orderNo);
    const extensionInstallId = normalizeString(input.extensionInstallId);
    const deploymentId = normalizeString(input.deploymentId);

    const [app, order, install, deployment] = await queryBatch(this.db, [
      () => (appCode ? createAppAccess(this.db).findAppByCode(appCode) : Promise.resolve(null)),
      () =>
        orderNo
          ? this.capabilities.createBillingAccess(this.db).findOrderByOrderNo(orderNo)
          : Promise.resolve(null),
      () =>
        extensionInstallId
          ? this.capabilities
              .createInstallAccess(this.db)
              .findInstallByExtensionInstallId(extensionInstallId)
          : Promise.resolve(null),
      () =>
        deploymentId
          ? this.capabilities.createDeploymentAccess(this.db).findDeploymentById(deploymentId)
          : Promise.resolve(null),
    ]);

    if (appCode && !app) {
      throw httpError(404, 'App not found');
    }

    if (orderNo && !order) {
      throw httpError(404, 'Order not found');
    }

    if (extensionInstallId && !install) {
      throw httpError(404, 'Install not found');
    }

    if (deploymentId && !deployment) {
      throw httpError(404, 'Deployment not found');
    }

    if (order && order.userId !== input.userId) {
      throw httpError(403, 'Order does not belong to the current user');
    }

    if (install?.userId && install.userId !== input.userId) {
      throw httpError(403, 'Install does not belong to the current user');
    }

    if (deployment && deployment.userId !== input.userId) {
      throw httpError(403, 'Deployment does not belong to the current user');
    }

    const inferredAppId = order?.appId ?? install?.appId ?? deployment?.appId ?? app?.id ?? null;
    if (app && inferredAppId && app.id !== inferredAppId) {
      throw httpError(400, 'App context does not match the selected order, install or deployment');
    }

    return {
      app:
        app ?? (inferredAppId ? await createAppAccess(this.db).findAppById(inferredAppId) : null),
      order,
      install,
      deployment,
    };
  }

  async listMyTickets(query: {
    userId: string;
    limit: number;
    offset: number;
    search?: string;
    status?: SupportTicketStatus;
    category?: SupportTicketCategory;
    priority?: SupportTicketPriority;
  }) {
    const result = await this.repository.listUserTickets(query);
    return {
      items: await this.hydrateTickets(result.items),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getMyTicket(ticketNo: string, userId: string) {
    const ticket = await this.ensureTicketOwner(ticketNo, userId);
    return this.buildTicketDetail(ticket);
  }

  async createTicket(input: {
    userId: string;
    appCode?: string;
    orderNo?: string;
    extensionInstallId?: string;
    deploymentId?: string;
    category: SupportTicketCategory;
    priority: SupportTicketPriority;
    subject: string;
    body: string;
  }) {
    const context = await this.resolveCreateContext(input);
    const now = this.capabilities.now();
    const ticket = await this.repository.createTicket({
      ticketNo: createTicketNo(now),
      userId: input.userId,
      appId: context.app?.id ?? null,
      orderId: context.order?.id ?? null,
      installId: context.install?.id ?? null,
      deploymentId: context.deployment?.id ?? null,
      category: input.category,
      priority: input.priority,
      status: 'waiting_staff',
      subject: normalizeString(input.subject),
      lastReplyAuthorType: 'user',
      lastActivityAt: now,
    });

    await this.repository.addMessage({
      ticketId: ticket.id,
      authorUserId: input.userId,
      authorType: 'user',
      body: normalizeString(input.body),
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: ticket.appId ?? undefined,
      installId: ticket.installId ?? undefined,
      eventName: 'ticket.created',
      properties: {
        ticketNo: ticket.ticketNo,
        category: ticket.category,
        priority: ticket.priority,
        subject: ticket.subject,
        orderNo: context.order?.orderNo,
        appCode: context.app?.code,
      },
    });

    return this.buildTicketDetail(ticket);
  }

  async replyMyTicket(input: { ticketNo: string; userId: string; body: string }) {
    const ticket = await this.ensureTicketOwner(input.ticketNo, input.userId);

    if (ticket.status === 'closed') {
      throw httpError(409, 'Closed tickets cannot be replied to');
    }

    const now = this.capabilities.now();
    const updated = await this.repository.updateTicket(ticket.id, {
      status: 'waiting_staff',
      lastReplyAuthorType: 'user',
      lastActivityAt: now,
      resolvedAt: null,
      updatedAt: now,
    });

    if (!updated) {
      throw httpError(500, 'Failed to update ticket');
    }

    await this.repository.addMessage({
      ticketId: ticket.id,
      authorUserId: input.userId,
      authorType: 'user',
      body: normalizeString(input.body),
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: ticket.appId ?? undefined,
      installId: ticket.installId ?? undefined,
      eventName: 'ticket.user_replied',
      properties: {
        ticketNo: ticket.ticketNo,
        subject: ticket.subject,
      },
    });

    return this.buildTicketDetail(updated);
  }

  async closeMyTicket(input: { ticketNo: string; userId: string }) {
    const ticket = await this.ensureTicketOwner(input.ticketNo, input.userId);

    if (ticket.status === 'closed') {
      return this.buildTicketDetail(ticket);
    }

    const now = this.capabilities.now();
    const updated = await this.repository.updateTicket(ticket.id, {
      status: 'closed',
      closedAt: now,
      lastActivityAt: now,
      updatedAt: now,
    });

    if (!updated) {
      throw httpError(500, 'Failed to close ticket');
    }

    await this.repository.addMessage({
      ticketId: ticket.id,
      authorType: 'system',
      body: '工单已由用户关闭。',
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: ticket.appId ?? undefined,
      installId: ticket.installId ?? undefined,
      eventName: 'ticket.closed_by_user',
      properties: {
        ticketNo: ticket.ticketNo,
      },
    });

    return this.buildTicketDetail(updated);
  }

  async listAdminTickets(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: SupportTicketStatus;
    category?: SupportTicketCategory;
    priority?: SupportTicketPriority;
  }) {
    const result = await this.repository.listAdminTickets(query);
    return {
      items: await this.hydrateTickets(result.items),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listRecentTicketsByUserId(userId: string, limit = 10) {
    const tickets = await this.repository.listRecentTicketsByUserId(userId, limit);
    return this.hydrateTickets(tickets);
  }

  async getAdminTicket(ticketNo: string) {
    const ticket = await this.loadTicketOrThrow(ticketNo);
    return this.buildTicketDetail(ticket, { includeInternal: true });
  }

  async replyAdminTicket(input: {
    ticketNo: string;
    actorUserId: string;
    body: string;
    isInternal?: boolean;
  }) {
    const ticket = await this.loadTicketOrThrow(input.ticketNo);
    const now = this.capabilities.now();
    const isInternal = Boolean(input.isInternal);

    const updated = isInternal
      ? ticket
      : await this.repository.updateTicket(ticket.id, {
          status: 'waiting_user',
          lastReplyAuthorType: 'admin',
          lastActivityAt: now,
          firstRespondedAt: ticket.firstRespondedAt ?? now,
          resolvedAt: null,
          closedAt: null,
          updatedAt: now,
        });

    if (!updated) {
      throw httpError(500, 'Failed to update ticket');
    }

    await this.repository.addMessage({
      ticketId: ticket.id,
      authorUserId: input.actorUserId,
      authorType: 'admin',
      isInternal,
      body: normalizeString(input.body),
    });

    if (!isInternal) {
      await this.capabilities.createEventService(this.db).capture({
        userId: ticket.userId,
        appId: ticket.appId ?? undefined,
        installId: ticket.installId ?? undefined,
        eventName: 'ticket.admin_replied',
        properties: {
          ticketNo: ticket.ticketNo,
          subject: ticket.subject,
          actorUserId: input.actorUserId,
        },
      });
    }

    return this.buildTicketDetail(updated, { includeInternal: true });
  }

  async assignTicket(input: {
    ticketNo: string;
    actorUserId: string;
    assignedAdminUserId: string | null;
  }) {
    const ticket = await this.loadTicketOrThrow(input.ticketNo);
    let assigneeLabel = '未分配';

    if (input.assignedAdminUserId) {
      const assignee = await createAuthAccess(this.db).findUserById(input.assignedAdminUserId);
      if (!assignee || !canAccessAdminConsole(normalizeRole(assignee.role))) {
        throw httpError(422, 'Assigned user must be a backoffice user');
      }
      assigneeLabel = assignee.displayName || assignee.email;
    }

    const updated = await this.repository.updateTicket(ticket.id, {
      assignedAdminUserId: input.assignedAdminUserId,
      updatedAt: this.capabilities.now(),
    });

    if (!updated) {
      throw httpError(500, 'Failed to update ticket assignment');
    }

    await this.repository.addMessage({
      ticketId: ticket.id,
      authorUserId: input.actorUserId,
      authorType: 'system',
      isInternal: true,
      body: input.assignedAdminUserId ? `工单已分配给 ${assigneeLabel}。` : '工单已取消分配。',
    });

    return this.buildTicketDetail(updated, { includeInternal: true });
  }

  async updateAdminTicketStatus(input: {
    ticketNo: string;
    actorUserId: string;
    status: SupportTicketStatus;
  }) {
    const ticket = await this.loadTicketOrThrow(input.ticketNo);

    if (ticket.status === input.status) {
      return this.buildTicketDetail(ticket, { includeInternal: true });
    }

    const now = this.capabilities.now();
    const changes: Parameters<TicketRepository['updateTicket']>[1] = {
      status: input.status,
      lastActivityAt: now,
      updatedAt: now,
    };

    if (input.status === 'waiting_staff' || input.status === 'waiting_user') {
      changes.resolvedAt = null;
      changes.closedAt = null;
    }

    if (input.status === 'resolved') {
      changes.resolvedAt = now;
      changes.closedAt = null;
      changes.firstRespondedAt = ticket.firstRespondedAt ?? now;
    }

    if (input.status === 'closed') {
      changes.closedAt = now;
    }

    const updated = await this.repository.updateTicket(ticket.id, changes);
    if (!updated) {
      throw httpError(500, 'Failed to update ticket status');
    }

    await this.repository.addMessage({
      ticketId: ticket.id,
      authorUserId: input.actorUserId,
      authorType: 'system',
      body: formatSystemStatusMessage(input.status),
    });

    const eventNameByStatus: Partial<Record<SupportTicketStatus, string>> = {
      resolved: 'ticket.resolved',
      closed: 'ticket.closed',
      waiting_staff: 'ticket.reopened_by_admin',
      waiting_user: 'ticket.reopened_by_admin',
    };

    const eventName = eventNameByStatus[input.status];
    if (eventName) {
      await this.capabilities.createEventService(this.db).capture({
        userId: ticket.userId,
        appId: ticket.appId ?? undefined,
        installId: ticket.installId ?? undefined,
        eventName,
        properties: {
          ticketNo: ticket.ticketNo,
          status: input.status,
          actorUserId: input.actorUserId,
        },
      });
    }

    return this.buildTicketDetail(updated, { includeInternal: true });
  }
}
