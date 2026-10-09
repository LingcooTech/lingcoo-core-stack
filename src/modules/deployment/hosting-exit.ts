import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  HostingExitSchema,
  hostingExitEvidenceSchema,
  hostingNodeReportSchema,
  type HostingExitCommand,
  type HostingExitEvidence,
} from '@lingcoo/contracts';
import {
  deployments,
  hostingExits,
  hostingExitEvents,
  hostingOperations,
  hostingNodes,
  hostingServices,
  deploymentTokens,
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { HostingRepository, HOSTING_REPORT_MAX_AGE_MS } from './hosting';

export class HostingExitService {
  constructor(
    private readonly db: DbExecutor,
    private readonly now = () => new Date(),
  ) {}
  private async deployment(id: string, owner?: string) {
    const [row] = await this.db
      .select()
      .from(deployments)
      .where(and(eq(deployments.id, id), owner ? eq(deployments.userId, owner) : undefined));
    if (!row || row.deploymentMode !== 'managed') throw httpError(404, '未找到托管实例');
    return row;
  }
  async read(id: string, owner?: string) {
    await this.deployment(id, owner);
    const [row] = await this.db
      .select()
      .from(hostingExits)
      .where(eq(hostingExits.deploymentId, id));
    const events = await this.db
      .select()
      .from(hostingExitEvents)
      .where(eq(hostingExitEvents.deploymentId, id))
      .orderBy(asc(hostingExitEvents.createdAt));
    return {
      exit: row
        ? HostingExitSchema.parse({
            ...row,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            retainUntil: row.retainUntil?.toISOString() ?? null,
          })
        : null,
      events: events.map((e) => ({
        kind: e.kind,
        actorUserId: e.actorUserId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
  async command(id: string, actor: string, input: HostingExitCommand, admin = false) {
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      await tx
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.id, id))
        .for('update');
      const service = new HostingExitService(tx, this.now);
      const d = await service.deployment(id, admin ? undefined : actor);
      if (!admin && ['start', 'handover'].includes(input.kind))
        throw httpError(403, '仅运维人员可执行此操作');
      if (input.kind === 'acknowledge' && actor !== d.userId)
        throw httpError(403, '仅实例所属客户可确认数据交接');
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const [prior] = await tx
        .select()
        .from(hostingExitEvents)
        .where(eq(hostingExitEvents.requestKey, input.requestKey));
      if (prior) {
        if (
          prior.deploymentId !== id ||
          prior.actorUserId !== actor ||
          prior.fingerprint !== fingerprint
        )
          throw httpError(409, '请求标识已用于其他操作');
        return service.read(id);
      }
      const [current] = await tx
        .select()
        .from(hostingExits)
        .where(eq(hostingExits.deploymentId, id));
      const now = this.now();
      if (input.kind === 'request') {
        if (current) throw httpError(409, '实例已有退出流程，请查看当前进度');
        if (d.status !== 'active' || d.hostingState !== 'ready' || !d.hostingNodeId)
          throw httpError(409, '仅已交付的托管实例可以申请退出');
        const [active] = await tx
          .select({ id: hostingOperations.id })
          .from(hostingOperations)
          .where(
            and(
              eq(hostingOperations.deploymentId, id),
              inArray(hostingOperations.state, ['pending', 'running']),
            ),
          );
        if (active) throw httpError(409, '请等待当前运维任务完成');
        await tx.insert(hostingExits).values({
          deploymentId: id,
          state: 'requested',
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        });
        await tx
          .update(deployments)
          .set({ hostingState: 'exit_requested', updatedAt: now })
          .where(eq(deployments.id, id));
      } else {
        if (!current || current.version !== input.expectedVersion)
          throw httpError(409, '退出记录已变化，请刷新');
        if (input.kind === 'start') {
          if (current.state !== 'requested' || !d.hostingNodeId)
            throw httpError(409, '退出流程已执行');
          const [terms] = await tx
            .select()
            .from(hostingServices)
            .where(eq(hostingServices.deploymentId, id));
          if (terms && input.retentionDays < terms.retentionDays)
            throw httpError(409, '保留期不得短于购买时约定的期限');
          const [node] = await tx
            .select()
            .from(hostingNodes)
            .where(eq(hostingNodes.id, d.hostingNodeId));
          const report = hostingNodeReportSchema.safeParse(node?.report);
          const age = node?.lastReportedAt
            ? now.getTime() - node.lastReportedAt.getTime()
            : Infinity;
          if (
            !report.success ||
            !report.data.supportedOperations?.includes('retire') ||
            !report.data.canDeploy ||
            !report.data.dockerReady ||
            age < 0 ||
            age > HOSTING_REPORT_MAX_AGE_MS
          )
            throw httpError(409, '节点未就绪或未安装安全退出执行器');
          const [op] = await tx
            .insert(hostingOperations)
            .values({
              deploymentId: id,
              nodeId: d.hostingNodeId,
              kind: 'retire',
              requestKey: input.requestKey,
              requestedBy: actor,
              createdAt: now,
            })
            .returning();
          await tx
            .update(hostingExits)
            .set({
              state: 'stopping',
              version: current.version + 1,
              retentionDays: input.retentionDays,
              operationId: op!.id,
              updatedAt: now,
            })
            .where(eq(hostingExits.id, current.id));
          await tx
            .update(deployments)
            .set({ hostingState: 'stopping', updatedAt: now })
            .where(eq(deployments.id, id));
          await tx
            .update(deploymentTokens)
            .set({ status: 'inactive', updatedAt: now })
            .where(eq(deploymentTokens.deploymentId, id));
        } else if (input.kind === 'handover') {
          if (current.state !== 'retained' || !current.evidence)
            throw httpError(409, '须先完成停服与本地、异机备份');
          await tx
            .update(hostingExits)
            .set({
              handoverReference: input.reference,
              version: current.version + 1,
              updatedAt: now,
            })
            .where(eq(hostingExits.id, current.id));
        } else {
          if (current.state !== 'retained' || !current.handoverReference || !current.evidence)
            throw httpError(409, '平台尚未完成数据交接');
          await tx
            .update(hostingExits)
            .set({ state: 'completed', version: current.version + 1, updatedAt: now })
            .where(eq(hostingExits.id, current.id));
          await tx
            .update(deployments)
            .set({ hostingState: 'terminated', updatedAt: now })
            .where(eq(deployments.id, id));
        }
      }
      await tx.insert(hostingExitEvents).values({
        deploymentId: id,
        kind: input.kind,
        actorUserId: actor,
        requestKey: input.requestKey,
        fingerprint,
        createdAt: now,
      });
      return service.read(id);
    });
  }
  // Invoked only inside the authenticated operation completion transaction.
  async complete(operationId: string, evidence: HostingExitEvidence, now: Date) {
    const [exit] = await this.db
      .select()
      .from(hostingExits)
      .where(eq(hostingExits.operationId, operationId))
      .for('update');
    if (!exit || exit.state !== 'stopping') throw httpError(409, '退出任务不匹配');
    const proof = hostingExitEvidenceSchema.parse(evidence);
    if (
      proof.backupId !== exit.deploymentId + '-exit-' + operationId ||
      Date.parse(proof.stoppedAt) < exit.createdAt.getTime() - 60000 ||
      Date.parse(proof.offsiteAt) < Date.parse(proof.stoppedAt) ||
      Date.parse(proof.offsiteAt) > now.getTime() + 60000
    )
      throw httpError(409, '退出备份证据不匹配');
    await this.db
      .update(hostingExits)
      .set({
        state: 'retained',
        evidence: proof,
        retainUntil: new Date(now.getTime() + exit.retentionDays! * 86400000),
        version: exit.version + 1,
        updatedAt: now,
      })
      .where(eq(hostingExits.id, exit.id));
    await this.db
      .update(deployments)
      .set({ hostingState: 'retained', updatedAt: now })
      .where(eq(deployments.id, exit.deploymentId));
    await this.db
      .insert(hostingExitEvents)
      .values({ deploymentId: exit.deploymentId, kind: 'node_confirmed', createdAt: now });
  }
}
