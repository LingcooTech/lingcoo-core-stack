import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  HostingServiceSchema,
  OrderItemSchema,
  type OrderItem,
  type HostingServiceCommand,
} from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import { deployments, hostingServices, hostingServiceChanges } from '../../db/schema';
import { billingPeriodEnd } from '../../lib/billing-period';
import { AuditLogService } from '../../lib/audit-logs';
import { httpError } from '../../lib/errors';

type ServiceRow = typeof hostingServices.$inferSelect;
export function hostingServiceView(row: ServiceRow, now: Date) {
  const graceEndsAt = row.expiresAt
    ? new Date(row.expiresAt.getTime() + row.graceDays * 86400000)
    : null;
  return HostingServiceSchema.parse({
    ...row,
    state: !row.anchorAt
      ? 'pending_delivery'
      : row.expiresAt!.getTime() > now.getTime()
        ? 'active'
        : graceEndsAt!.getTime() > now.getTime()
          ? 'grace'
          : 'expired',
    anchorAt: row.anchorAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    graceEndsAt: graceEndsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export class HostingServiceTerms {
  async assertSoftwareRefundable(entitlementIds: string[]) {
    if (!entitlementIds.length) return;
    const [row] = await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(
        and(inArray(deployments.entitlementId, entitlementIds), eq(deployments.status, 'active')),
      )
      .limit(1);
    if (row) throw httpError(409, '软件已有有效部署，请先完成服务终止和数据交接');
  }

  constructor(
    private readonly db: DbExecutor,
    private readonly clock = () => new Date(),
  ) {}

  async quoteRenewal(
    deploymentId: string,
    userId: string,
    entitlementId: string,
    interval: string,
    graceDays: number,
    retentionDays: number,
  ) {
    const deployment = await this.deployment(deploymentId, userId);
    const service = await this.find(deploymentId);
    if (
      deployment.status !== 'active' ||
      deployment.entitlementId !== entitlementId ||
      !service ||
      service.source !== 'paid'
    )
      throw httpError(409, '当前部署没有可续费的付费托管服务');
    if (service.graceDays !== graceDays || service.retentionDays !== retentionDays)
      throw httpError(409, '续费套餐的宽限和数据保留政策须与当前服务一致');
    if (service.interval !== interval) throw httpError(409, '续费必须沿用当前月付或年付周期');
    return service;
  }

  async applyPaidRenewal(input: {
    deploymentId: string;
    serviceId: string;
    entitlementId: string;
    userId: string;
    orderId: string;
    item: OrderItem;
  }) {
    await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(eq(deployments.id, input.deploymentId))
      .for('update');
    const [deployment] = await this.db
      .select()
      .from(deployments)
      .where(eq(deployments.id, input.deploymentId));
    const current = await this.find(input.deploymentId);
    if (
      !deployment ||
      deployment.userId !== input.userId ||
      deployment.status !== 'active' ||
      deployment.deploymentMode !== 'managed' ||
      deployment.entitlementId !== input.entitlementId ||
      !current ||
      current.id !== input.serviceId ||
      current.source !== 'paid' ||
      current.interval !== input.item.interval ||
      current.graceDays !== input.item.hostingTerms?.graceDays ||
      current.retentionDays !== input.item.hostingTerms?.retentionDays
    )
      return { status: 'review' as const, reason: '付款后目标实例或服务发生变化，请联系平台处理' };
    const now = this.clock();
    const expired = current.expiresAt && current.expiresAt <= now;
    const anchorAt = expired
      ? deployment.hostingState === 'ready'
        ? now
        : null
      : current.anchorAt;
    const periods = expired ? input.item.quantity : current.periods + input.item.quantity;
    if (periods > 1200)
      return { status: 'review' as const, reason: '累计服务周期超过上限，请联系平台处理' };
    const [saved] = await this.db
      .update(hostingServices)
      .set({
        periods,
        anchorAt,
        expiresAt: anchorAt ? billingPeriodEnd(anchorAt, current.interval, periods) : null,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(eq(hostingServices.id, current.id))
      .returning();
    if (!saved) throw new Error('Missing paid renewal write');
    await this.recordChange(saved, current, now, {
      kind: 'extend',
      actorUserId: input.userId,
      requestKey: input.orderId,
      fingerprint: createHash('sha256').update(JSON.stringify(input.item)).digest('hex'),
      reason: `付费续费订单 ${input.orderId}`,
    });
    return {
      status: 'applied' as const,
      reason: '续费已应用到原托管服务',
      before: hostingServiceView(current, now),
      after: hostingServiceView(saved, now),
    };
  }

  async registerPurchase(
    deploymentId: string,
    actorUserId: string,
    purchase: { id: string; orderId: string; item: OrderItem },
  ) {
    const item = OrderItemSchema.parse(purchase.item);
    if (item.kind !== 'hosting' || !item.hostingTerms || item.interval === 'one_time')
      throw httpError(422, '托管购买快照无效');
    const deployment = await this.deployment(deploymentId, actorUserId);
    const now = this.clock();
    const anchorAt = deployment.hostingState === 'ready' ? now : null;
    const [saved] = await this.db
      .insert(hostingServices)
      .values({
        deploymentId,
        source: 'paid',
        interval: item.interval,
        periods: item.quantity,
        graceDays: item.hostingTerms.graceDays,
        retentionDays: item.hostingTerms.retentionDays,
        anchorAt,
        expiresAt: anchorAt ? billingPeriodEnd(anchorAt, item.interval, item.quantity) : null,
      })
      .returning();
    if (!saved) throw new Error('Missing paid hosting service');
    await this.recordChange(saved, null, now, {
      kind: 'register',
      actorUserId,
      reason: `已支付托管订单 ${purchase.orderId}；资格 ${purchase.id}`,
    });
  }

  private async find(deploymentId: string) {
    const [row] = await this.db
      .select()
      .from(hostingServices)
      .where(eq(hostingServices.deploymentId, deploymentId));
    return row;
  }
  private async deployment(deploymentId: string, ownerId?: string) {
    const [row] = await this.db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.id, deploymentId),
          ownerId ? eq(deployments.userId, ownerId) : undefined,
        ),
      );
    if (!row || row.deploymentMode !== 'managed') throw httpError(404, '未找到托管部署');
    return row;
  }
  async read(deploymentId: string, ownerId?: string) {
    await this.deployment(deploymentId, ownerId);
    const row = await this.find(deploymentId);
    return { service: row ? hostingServiceView(row, this.clock()) : null };
  }
  async adminRead(deploymentId: string) {
    const result = await this.read(deploymentId);
    const changes = await this.db
      .select()
      .from(hostingServiceChanges)
      .where(eq(hostingServiceChanges.deploymentId, deploymentId))
      .orderBy(desc(hostingServiceChanges.version))
      .limit(50);
    return {
      ...result,
      changes: changes.map((c) => ({
        id: c.id,
        kind: c.kind,
        actorUserId: c.actorUserId,
        reason: c.reason,
        version: c.version,
        createdAt: c.createdAt.toISOString(),
        before: c.before ? HostingServiceSchema.parse(c.before) : null,
        after: HostingServiceSchema.parse(c.after),
      })),
    };
  }
  async command(deploymentId: string, actorUserId: string, input: HostingServiceCommand) {
    return this.db.transaction(async (tx) => {
      // A single lock serializes registration, renewal, and successful-delivery activation.
      await tx
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .for('update');
      const service = new HostingServiceTerms(tx, this.clock);
      const deployment = await service.deployment(deploymentId);
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const [previous] = await tx
        .select()
        .from(hostingServiceChanges)
        .where(
          and(
            eq(hostingServiceChanges.deploymentId, deploymentId),
            eq(hostingServiceChanges.requestKey, input.requestKey),
          ),
        );
      if (previous) {
        if (previous.fingerprint !== fingerprint || previous.actorUserId !== actorUserId)
          throw httpError(409, '请求标识已用于其他操作，请刷新后重试');
        return service.adminRead(deploymentId);
      }
      if (deployment.status !== 'active') throw httpError(409, '已停用部署不能登记或延长服务');
      const current = await service.find(deploymentId);
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw httpError(409, '服务记录已变化，请刷新后重试');
      const now = this.clock();
      let saved: ServiceRow | undefined;
      if (input.kind === 'register') {
        if (current) throw httpError(409, '托管服务已登记');
        // Existing delivered pilots start at explicit registration, never infer payment or backdate.
        const anchorAt = deployment.hostingState === 'ready' ? now : null;
        [saved] = await tx
          .insert(hostingServices)
          .values({
            deploymentId,
            source: input.source,
            interval: input.interval,
            periods: input.periods,
            graceDays: input.graceDays,
            retentionDays: input.retentionDays,
            anchorAt,
            expiresAt: anchorAt ? billingPeriodEnd(anchorAt, input.interval, input.periods) : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      } else {
        if (!current) throw httpError(409, '请先登记托管服务');
        // Early extensions preserve the original anchor. Expired terms begin anew only when ready.
        const elapsed = current.expiresAt && current.expiresAt.getTime() <= now.getTime();
        const anchorAt = elapsed
          ? deployment.hostingState === 'ready'
            ? now
            : null
          : current.anchorAt;
        const periods = elapsed ? input.periods : current.periods + input.periods;
        if (periods > 1200) throw httpError(422, '累计周期超过允许范围');
        [saved] = await tx
          .update(hostingServices)
          .set({
            anchorAt,
            periods,
            expiresAt: anchorAt ? billingPeriodEnd(anchorAt, current.interval, periods) : null,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(eq(hostingServices.id, current.id))
          .returning();
      }
      if (!saved) throw new Error('Missing hosting service write result');
      await service.recordChange(saved, current ?? null, now, {
        kind: input.kind,
        actorUserId,
        reason: input.reason,
        requestKey: input.requestKey,
        fingerprint,
      });
      return service.adminRead(deploymentId);
    });
  }

  async activateDelivered(deploymentId: string) {
    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .for('update');
      await new HostingServiceTerms(tx, this.clock).activateLocked(deploymentId);
    });
  }

  private async activateLocked(deploymentId: string) {
    const deployment = await this.deployment(deploymentId);
    if (deployment.status !== 'active' || deployment.hostingState !== 'ready') return;
    const current = await this.find(deploymentId);
    if (!current || current.anchorAt) return;
    const now = this.clock();
    const [saved] = await this.db
      .update(hostingServices)
      .set({
        anchorAt: now,
        expiresAt: billingPeriodEnd(now, current.interval, current.periods),
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(hostingServices.id, current.id), eq(hostingServices.version, current.version)))
      .returning();
    if (!saved) throw httpError(409, '服务记录已变化');
    await this.recordChange(saved, current, now, {
      kind: 'activate',
      actorUserId: null,
      reason: '公网交付验证成功，开始计算托管服务期',
    });
  }

  private async recordChange(
    after: ServiceRow,
    before: ServiceRow | null,
    now: Date,
    change: {
      kind: 'register' | 'extend' | 'activate';
      actorUserId: string | null;
      reason: string;
      requestKey?: string;
      fingerprint?: string;
    },
  ) {
    await this.db.insert(hostingServiceChanges).values({
      ...change,
      deploymentId: after.deploymentId,
      version: after.version,
      before: before ? hostingServiceView(before, now) : null,
      after: hostingServiceView(after, now),
      createdAt: now,
    });
    await new AuditLogService(this.db).record({
      actorType: change.actorUserId ? 'user' : 'system',
      actorUserId: change.actorUserId,
      action: `hosting.service_${change.kind}`,
      resourceType: 'hosting_service',
      resourceId: after.id,
      summary: '托管服务期限变更',
      meta: { deploymentId: after.deploymentId, version: after.version, kind: change.kind },
    });
  }
}
