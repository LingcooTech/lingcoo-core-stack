import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { HostingServiceSchema, type HostingServiceCommand } from '@lingcoo/contracts';
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
  constructor(
    private readonly db: DbExecutor,
    private readonly clock = () => new Date(),
  ) {}

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
