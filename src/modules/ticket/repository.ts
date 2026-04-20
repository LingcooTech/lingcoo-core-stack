import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import {
  apps,
  deployments,
  orders,
  supportTicketMessages,
  supportTickets,
  users,
  installs
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';

type SupportTicketStatus = 'waiting_staff' | 'waiting_user' | 'resolved' | 'closed';
type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type SupportTicketMessageAuthorType = 'user' | 'admin' | 'system';

export class TicketRepository {
  constructor(private readonly db: DbExecutor) {}

  async createTicket(input: {
    ticketNo: string;
    userId: string;
    appId?: string | null;
    orderId?: string | null;
    installId?: string | null;
    deploymentId?: string | null;
    category: 'account' | 'billing' | 'access' | 'install' | 'deployment' | 'bug' | 'feature' | 'other';
    priority: SupportTicketPriority;
    status: SupportTicketStatus;
    subject: string;
    assignedAdminUserId?: string | null;
    lastReplyAuthorType: SupportTicketMessageAuthorType;
    lastActivityAt?: Date;
    firstRespondedAt?: Date | null;
    resolvedAt?: Date | null;
    closedAt?: Date | null;
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [ticket] = await this.db
      .insert(supportTickets)
      .values({
        ticketNo: input.ticketNo,
        userId: input.userId,
        appId: input.appId ?? null,
        orderId: input.orderId ?? null,
        installId: input.installId ?? null,
        deploymentId: input.deploymentId ?? null,
        category: input.category,
        priority: input.priority,
        status: input.status,
        subject: input.subject,
        assignedAdminUserId: input.assignedAdminUserId ?? null,
        lastReplyAuthorType: input.lastReplyAuthorType,
        lastActivityAt: input.lastActivityAt ?? now,
        firstRespondedAt: input.firstRespondedAt ?? null,
        resolvedAt: input.resolvedAt ?? null,
        closedAt: input.closedAt ?? null,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return ticket;
  }

  async findTicketByTicketNo(ticketNo: string) {
    const [ticket] = await this.db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.ticketNo, ticketNo))
      .limit(1);

    return ticket ?? null;
  }

  async updateTicket(
    ticketId: string,
    input: Partial<{
      appId: string | null;
      orderId: string | null;
      installId: string | null;
      deploymentId: string | null;
      category: 'account' | 'billing' | 'access' | 'install' | 'deployment' | 'bug' | 'feature' | 'other';
      priority: SupportTicketPriority;
      status: SupportTicketStatus;
      subject: string;
      assignedAdminUserId: string | null;
      lastReplyAuthorType: SupportTicketMessageAuthorType;
      lastActivityAt: Date;
      firstRespondedAt: Date | null;
      resolvedAt: Date | null;
      closedAt: Date | null;
      meta: Record<string, unknown>;
      updatedAt: Date;
    }>
  ) {
    const changes: Record<string, unknown> = {
      updatedAt: input.updatedAt ?? new Date()
    };

    if (typeof input.appId !== 'undefined') changes.appId = input.appId;
    if (typeof input.orderId !== 'undefined') changes.orderId = input.orderId;
    if (typeof input.installId !== 'undefined') changes.installId = input.installId;
    if (typeof input.deploymentId !== 'undefined') changes.deploymentId = input.deploymentId;
    if (typeof input.category !== 'undefined') changes.category = input.category;
    if (typeof input.priority !== 'undefined') changes.priority = input.priority;
    if (typeof input.status !== 'undefined') changes.status = input.status;
    if (typeof input.subject !== 'undefined') changes.subject = input.subject;
    if (typeof input.assignedAdminUserId !== 'undefined') changes.assignedAdminUserId = input.assignedAdminUserId;
    if (typeof input.lastReplyAuthorType !== 'undefined') changes.lastReplyAuthorType = input.lastReplyAuthorType;
    if (typeof input.lastActivityAt !== 'undefined') changes.lastActivityAt = input.lastActivityAt;
    if (typeof input.firstRespondedAt !== 'undefined') changes.firstRespondedAt = input.firstRespondedAt;
    if (typeof input.resolvedAt !== 'undefined') changes.resolvedAt = input.resolvedAt;
    if (typeof input.closedAt !== 'undefined') changes.closedAt = input.closedAt;
    if (typeof input.meta !== 'undefined') changes.meta = input.meta;

    const [ticket] = await this.db
      .update(supportTickets)
      .set(changes)
      .where(eq(supportTickets.id, ticketId))
      .returning();

    return ticket ?? null;
  }

  async addMessage(input: {
    ticketId: string;
    authorUserId?: string | null;
    authorType: SupportTicketMessageAuthorType;
    isInternal?: boolean;
    body: string;
    meta?: Record<string, unknown>;
  }) {
    const [message] = await this.db
      .insert(supportTicketMessages)
      .values({
        ticketId: input.ticketId,
        authorUserId: input.authorUserId ?? null,
        authorType: input.authorType,
        isInternal: input.isInternal ?? false,
        body: input.body,
        meta: input.meta ?? {},
        createdAt: new Date()
      })
      .returning();

    return message;
  }

  async listMessagesByTicketId(ticketId: string, options?: { includeInternal?: boolean }) {
    const conditions: SQL[] = [eq(supportTicketMessages.ticketId, ticketId)];

    if (!options?.includeInternal) {
      conditions.push(eq(supportTicketMessages.isInternal, false));
    }

    return this.db
      .select()
      .from(supportTicketMessages)
      .where(and(...conditions))
      .orderBy(asc(supportTicketMessages.createdAt));
  }

  async listMessageCountsByTicketIds(ticketIds: string[]) {
    if (ticketIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        ticketId: supportTicketMessages.ticketId,
        count: sql<number>`count(*)::int`
      })
      .from(supportTicketMessages)
      .where(inArray(supportTicketMessages.ticketId, ticketIds))
      .groupBy(supportTicketMessages.ticketId);
  }

  async listUserTickets(query: {
    userId: string;
    limit: number;
    offset: number;
    search?: string;
    status?: SupportTicketStatus;
    category?: 'account' | 'billing' | 'access' | 'install' | 'deployment' | 'bug' | 'feature' | 'other';
    priority?: SupportTicketPriority;
  }) {
    const conditions: SQL[] = [eq(supportTickets.userId, query.userId)];

    if (query.status) {
      conditions.push(eq(supportTickets.status, query.status));
    }

    if (query.category) {
      conditions.push(eq(supportTickets.category, query.category));
    }

    if (query.priority) {
      conditions.push(eq(supportTickets.priority, query.priority));
    }

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(supportTickets.ticketNo, pattern),
          ilike(supportTickets.subject, pattern),
          ilike(apps.code, pattern),
          ilike(apps.name, pattern),
          ilike(orders.orderNo, pattern),
          ilike(installs.extensionInstallId, pattern),
          ilike(deployments.label, pattern),
          ilike(deployments.primaryDomain, pattern),
          ilike(deployments.adminDomain, pattern)
        )!
      );
    }

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ item: supportTickets })
        .from(supportTickets)
        .leftJoin(apps, eq(supportTickets.appId, apps.id))
        .leftJoin(orders, eq(supportTickets.orderId, orders.id))
        .leftJoin(installs, eq(supportTickets.installId, installs.id))
        .leftJoin(deployments, eq(supportTickets.deploymentId, deployments.id))
        .where(where)
        .orderBy(desc(supportTickets.lastActivityAt), desc(supportTickets.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTickets)
        .leftJoin(apps, eq(supportTickets.appId, apps.id))
        .leftJoin(orders, eq(supportTickets.orderId, orders.id))
        .leftJoin(installs, eq(supportTickets.installId, installs.id))
        .leftJoin(deployments, eq(supportTickets.deploymentId, deployments.id))
        .where(where)
    ]);

    return {
      items: rows.map((row) => row.item),
      total: countResult[0]?.count ?? 0
    };
  }

  async listAdminTickets(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: SupportTicketStatus;
    category?: 'account' | 'billing' | 'access' | 'install' | 'deployment' | 'bug' | 'feature' | 'other';
    priority?: SupportTicketPriority;
  }) {
    const conditions: SQL[] = [];

    if (query.status) {
      conditions.push(eq(supportTickets.status, query.status));
    }

    if (query.category) {
      conditions.push(eq(supportTickets.category, query.category));
    }

    if (query.priority) {
      conditions.push(eq(supportTickets.priority, query.priority));
    }

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(supportTickets.ticketNo, pattern),
          ilike(supportTickets.subject, pattern),
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
          ilike(apps.code, pattern),
          ilike(apps.name, pattern),
          ilike(orders.orderNo, pattern),
          ilike(installs.extensionInstallId, pattern),
          ilike(deployments.label, pattern),
          ilike(deployments.primaryDomain, pattern),
          ilike(deployments.adminDomain, pattern)
        )!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ item: supportTickets })
        .from(supportTickets)
        .leftJoin(users, eq(supportTickets.userId, users.id))
        .leftJoin(apps, eq(supportTickets.appId, apps.id))
        .leftJoin(orders, eq(supportTickets.orderId, orders.id))
        .leftJoin(installs, eq(supportTickets.installId, installs.id))
        .leftJoin(deployments, eq(supportTickets.deploymentId, deployments.id))
        .where(where)
        .orderBy(desc(supportTickets.lastActivityAt), desc(supportTickets.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportTickets)
        .leftJoin(users, eq(supportTickets.userId, users.id))
        .leftJoin(apps, eq(supportTickets.appId, apps.id))
        .leftJoin(orders, eq(supportTickets.orderId, orders.id))
        .leftJoin(installs, eq(supportTickets.installId, installs.id))
        .leftJoin(deployments, eq(supportTickets.deploymentId, deployments.id))
        .where(where)
    ]);

    return {
      items: rows.map((row) => row.item),
      total: countResult[0]?.count ?? 0
    };
  }
}
