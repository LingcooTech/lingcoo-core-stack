import { and, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import {
  HostingOperationSchema,
  hostingNodeReportSchema,
  hostingResourcesSchema,
} from '@lingcoo/contracts';
import { apps, deployments, hostingNodes, hostingOperations, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { HostingRepository, HOSTING_REPORT_MAX_AGE_MS } from './hosting';
import type { HostingExitEvidence } from '@lingcoo/contracts';
import { HostingExitService } from './hosting-exit';
import { monitorProfile } from './hosting-monitor-checks';

const view = (row: typeof hostingOperations.$inferSelect) =>
  HostingOperationSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  });
export class HostingOperations {
  constructor(private readonly db: DbExecutor) {}
  async overview(now = new Date()) {
    const [instances, operations] = await Promise.all([
      this.db
        .select({
          deployment: deployments,
          node: hostingNodes,
          appCode: apps.code,
          appMeta: apps.meta,
          customerEmail: users.email,
        })
        .from(deployments)
        .innerJoin(apps, eq(apps.id, deployments.appId))
        .innerJoin(users, eq(users.id, deployments.userId))
        .leftJoin(hostingNodes, eq(hostingNodes.id, deployments.hostingNodeId))
        .where(and(eq(deployments.deploymentMode, 'managed'), eq(deployments.status, 'active')))
        .orderBy(desc(deployments.createdAt))
        .limit(1000),
      this.db
        .select()
        .from(hostingOperations)
        .orderBy(desc(hostingOperations.createdAt))
        .limit(100),
    ]);
    return {
      instances: instances.map(({ deployment: d, node, appCode, appMeta, customerEmail }) => {
        const report = hostingNodeReportSchema.safeParse(node?.report);
        const profile = monitorProfile(appCode, appMeta);
        return {
          id: d.id,
          label: d.label,
          appCode,
          customerEmail,
          nodeId: d.hostingNodeId,
          hostname: d.hostedDomain,
          state: d.hostingState,
          resources: hostingResourcesSchema.safeParse(d.hostingResources).success
            ? hostingResourcesSchema.parse(d.hostingResources)
            : null,
          services:
            report.success && profile
              ? (report.data.containers ?? []).filter(
                  (c) => c.project === profile.projectPrefix + '-' + d.id.replaceAll('-', ''),
                )
              : [],
          backup: report.success
            ? (report.data.backups?.find((b) => b.deploymentId === d.id) ?? null)
            : null,
          telemetryFresh:
            !!node?.lastReportedAt &&
            now.getTime() - node.lastReportedAt.getTime() >= 0 &&
            now.getTime() - node.lastReportedAt.getTime() <= HOSTING_REPORT_MAX_AGE_MS,
        };
      }),
      operations: operations.map(view),
    };
  }
  async request(
    deploymentId: string,
    actor: string,
    input: { kind: 'restart' | 'backup'; requestKey: string },
    now = new Date(),
  ) {
    await new HostingRepository(this.db).lockPool();
    const [previous] = await this.db
      .select()
      .from(hostingOperations)
      .where(eq(hostingOperations.requestKey, input.requestKey));
    if (previous) {
      if (
        previous.deploymentId !== deploymentId ||
        previous.kind !== input.kind ||
        previous.requestedBy !== actor
      )
        throw httpError(409, '操作请求标识已用于其他操作');
      return view(previous);
    }
    const [d] = await this.db.select().from(deployments).where(eq(deployments.id, deploymentId));
    if (!d || d.deploymentMode !== 'managed') throw httpError(404, '托管实例不存在');
    if (d.status !== 'active' || d.hostingState !== 'ready' || !d.hostingNodeId)
      throw httpError(409, '实例尚未就绪');
    const [node] = await this.db
      .select()
      .from(hostingNodes)
      .where(eq(hostingNodes.id, d.hostingNodeId));
    const report = hostingNodeReportSchema.safeParse(node?.report);
    if (
      !node?.lastReportedAt ||
      now.getTime() - node.lastReportedAt.getTime() < 0 ||
      now.getTime() - node.lastReportedAt.getTime() > HOSTING_REPORT_MAX_AGE_MS ||
      !report.success ||
      !report.data.dockerReady ||
      !report.data.canDeploy
    )
      throw httpError(409, '节点离线或未启用托管执行器');
    const [active] = await this.db
      .select()
      .from(hostingOperations)
      .where(
        and(
          eq(hostingOperations.deploymentId, d.id),
          inArray(hostingOperations.state, ['pending', 'running']),
        ),
      );
    if (active) throw httpError(409, '该实例已有运维任务，请等待完成');
    const [row] = await this.db
      .insert(hostingOperations)
      .values({
        deploymentId: d.id,
        nodeId: d.hostingNodeId,
        kind: input.kind,
        requestKey: input.requestKey,
        requestedBy: actor,
        createdAt: now,
      })
      .returning();
    return view(row!);
  }
  async claim(nodeId: string, token: string, now = new Date()) {
    const repository = new HostingRepository(this.db);
    await repository.authenticate(nodeId, token);
    await repository.lockPool();
    // Never automatically repeat a potentially partially executed side effect.
    await this.db
      .update(hostingOperations)
      .set({ state: 'failed', result: 'lease_expired', completedAt: now })
      .where(
        and(
          eq(hostingOperations.nodeId, nodeId),
          eq(hostingOperations.state, 'running'),
          ne(hostingOperations.kind, 'retire'),
          lt(hostingOperations.startedAt, new Date(now.getTime() - 60 * 60 * 1000)),
        ),
      );
    const runningRows = await this.db
      .select()
      .from(hostingOperations)
      .where(and(eq(hostingOperations.nodeId, nodeId), eq(hostingOperations.state, 'running')))
      .orderBy(hostingOperations.createdAt);
    const running = runningRows.find(
      (row) =>
        row.kind !== 'retire' ||
        row.result !== 'execution_failed' ||
        !row.startedAt ||
        now.getTime() - row.startedAt.getTime() >= 5 * 60000,
    );
    if (running) {
      if (running.kind === 'retire' && running.result === 'execution_failed') {
        const [retry] = await this.db
          .update(hostingOperations)
          .set({ result: null, startedAt: now })
          .where(eq(hostingOperations.id, running.id))
          .returning();
        return { operation: view(retry!) };
      }
      return { operation: view(running) };
    }
    const [row] = await this.db
      .select()
      .from(hostingOperations)
      .where(and(eq(hostingOperations.nodeId, nodeId), eq(hostingOperations.state, 'pending')))
      .orderBy(hostingOperations.createdAt)
      .limit(1)
      .for('update');
    if (!row) return { operation: null };
    const [updated] = await this.db
      .update(hostingOperations)
      .set({ state: 'running', startedAt: now })
      .where(eq(hostingOperations.id, row.id))
      .returning();
    return { operation: view(updated!) };
  }
  async complete(
    nodeId: string,
    token: string,
    id: string,
    success: boolean,
    now = new Date(),
    evidence?: HostingExitEvidence,
  ) {
    const repository = new HostingRepository(this.db);
    await repository.authenticate(nodeId, token);
    await repository.lockPool();
    const [row] = await this.db
      .select()
      .from(hostingOperations)
      .where(and(eq(hostingOperations.id, id), eq(hostingOperations.nodeId, nodeId)));
    if (!row) throw httpError(404, '操作不存在');
    if (['succeeded', 'failed'].includes(row.state)) return { ok: true };
    if (row.state !== 'running') throw httpError(409, '操作未领取');
    if (row.kind === 'retire') {
      if (!success) {
        await this.db
          .update(hostingOperations)
          .set({ result: 'execution_failed', startedAt: now })
          .where(eq(hostingOperations.id, id));
        return { ok: true }; // Unknown/partial stop retains capacity and the same retryable operation.
      }
      if (!evidence) throw httpError(409, '缺少已停服及异机备份证据');
      await new HostingExitService(this.db).complete(id, evidence, now);
    }
    await this.db
      .update(hostingOperations)
      .set({
        state: success ? 'succeeded' : 'failed',
        result: success ? 'verified' : 'execution_failed',
        completedAt: now,
      })
      .where(eq(hostingOperations.id, id));
    return { ok: true };
  }
}
