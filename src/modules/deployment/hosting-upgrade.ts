import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  upgradeReleaseSchema,
  upgradeEvidenceSchema,
  UpgradeOptionsSchema,
  hostingNodeReportSchema,
  type upgradeRequestSchema,
} from '@lingcoo/contracts';
import type { z } from 'zod';
import {
  apps,
  deployments,
  hostingNodes,
  hostingOperations,
  hostingUpgrades,
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { HostingRepository, HOSTING_REPORT_MAX_AGE_MS } from './hosting';

export class HostingUpgradeService {
  constructor(private readonly db: DbExecutor) {}
  async read(id: string, now = new Date()) {
    const [d] = await this.db.select().from(deployments).where(eq(deployments.id, id));
    if (!d || d.deploymentMode !== 'managed') throw httpError(404, '托管实例不存在');
    const [a] = await this.db.select().from(apps).where(eq(apps.id, d.appId));
    const [node] = d.hostingNodeId
      ? await this.db.select().from(hostingNodes).where(eq(hostingNodes.id, d.hostingNodeId))
      : [];
    const report = hostingNodeReportSchema.safeParse(node?.report);
    let currentImage = report.success
      ? (report.data.runtimeImages?.find((r) => r.deploymentId === id)?.image ?? null)
      : null;
    const [active] = await this.db
      .select()
      .from(hostingOperations)
      .where(
        and(
          eq(hostingOperations.deploymentId, id),
          inArray(hostingOperations.state, ['pending', 'running']),
        ),
      );
    const history = await this.db
      .select()
      .from(hostingUpgrades)
      .where(eq(hostingUpgrades.deploymentId, id))
      .orderBy(desc(hostingUpgrades.createdAt))
      .limit(30);
    const latest = history.find((h) => h.evidence);
    if (latest) {
      const proof = upgradeEvidenceSchema.parse(latest.evidence);
      if (!node?.lastReportedAt || Date.parse(proof.completedAt) > node.lastReportedAt.getTime())
        currentImage = proof.runningImage;
    }
    let blockedReason: string | null = null;
    if (d.status !== 'active' || d.hostingState !== 'ready')
      blockedReason = '实例不在可升级状态，请先完成当前维护或退出流程';
    else if (active) blockedReason = '实例已有运维任务';
    else if (
      !node?.lastReportedAt ||
      now.getTime() - node.lastReportedAt.getTime() < 0 ||
      now.getTime() - node.lastReportedAt.getTime() > HOSTING_REPORT_MAX_AGE_MS ||
      !report.success ||
      !report.data.dockerReady ||
      !report.data.canDeploy ||
      !report.data.supportedOperations?.includes('upgrade')
    )
      blockedReason = '节点尚未就绪或未启用受控升级';
    else if (!currentImage) blockedReason = '节点尚未报告当前固定镜像';
    const releases = report.success
      ? (report.data.upgradeReleases ?? []).filter(
          (r) => r.appCode === a?.code && r.fromImage === currentImage,
        )
      : [];
    if (!blockedReason && !releases.length) blockedReason = '暂无与当前镜像匹配且已审核的升级版本';
    return UpgradeOptionsSchema.parse({
      currentImage,
      releases,
      blockedReason,
      history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    });
  }
  async request(
    id: string,
    actor: string,
    input: z.infer<typeof upgradeRequestSchema>,
    now = new Date(),
  ) {
    await new HostingRepository(this.db).lockPool();
    if (input.confirmDeploymentId !== id) throw httpError(409, '确认的实例编号不匹配');
    const [old] = await this.db
      .select()
      .from(hostingOperations)
      .where(eq(hostingOperations.requestKey, input.requestKey));
    if (old) {
      const [h] = await this.db
        .select()
        .from(hostingUpgrades)
        .where(eq(hostingUpgrades.operationId, old.id));
      const plan = upgradeReleaseSchema.safeParse(h?.plan);
      if (
        old.kind !== 'upgrade' ||
        old.deploymentId !== id ||
        old.requestedBy !== actor ||
        !plan.success ||
        plan.data.id !== input.releaseId ||
        plan.data.fromImage !== input.expectedImage
      )
        throw httpError(409, '请求标识已用于其他操作');
      return { operationId: old.id };
    }
    const options = await this.read(id, now);
    if (options.blockedReason) throw httpError(409, options.blockedReason);
    const plan = options.releases.find((r) => r.id === input.releaseId);
    if (!plan || options.currentImage !== input.expectedImage)
      throw httpError(409, '版本已变化，请刷新后重新选择');
    const [d] = await this.db.select().from(deployments).where(eq(deployments.id, id));
    const priorPlans = await this.db
      .select({ plan: hostingUpgrades.plan })
      .from(hostingUpgrades)
      .where(sql`${hostingUpgrades.plan}->>'id' = ${plan.id}`);
    if (
      priorPlans.some(
        (p) => JSON.stringify(upgradeReleaseSchema.parse(p.plan)) !== JSON.stringify(plan),
      )
    )
      throw httpError(409, '已使用的发行编号不能更换升级计划');
    const [op] = await this.db
      .insert(hostingOperations)
      .values({
        deploymentId: id,
        nodeId: d!.hostingNodeId!,
        kind: 'upgrade',
        requestKey: input.requestKey,
        requestedBy: actor,
        createdAt: now,
      })
      .returning();
    await this.db
      .insert(hostingUpgrades)
      .values({ operationId: op!.id, deploymentId: id, plan, createdAt: now });
    await this.db
      .update(deployments)
      .set({ hostingState: 'maintenance', updatedAt: now })
      .where(eq(deployments.id, id));
    return { operationId: op!.id };
  }
  async nodePlan(nodeId: string, token: string, id: string) {
    await new HostingRepository(this.db).authenticate(nodeId, token);
    const [op] = await this.db
      .select()
      .from(hostingOperations)
      .where(and(eq(hostingOperations.id, id), eq(hostingOperations.nodeId, nodeId)));
    if (!op || op.kind !== 'upgrade' || op.state !== 'running')
      throw httpError(409, '升级任务未领取或不属于节点');
    const [h] = await this.db
      .select()
      .from(hostingUpgrades)
      .where(eq(hostingUpgrades.operationId, id));
    if (!h) throw httpError(404, '升级计划不存在');
    return upgradeReleaseSchema.parse(h.plan);
  }
  async complete(id: string, raw: unknown, now = new Date()) {
    const evidence = upgradeEvidenceSchema.parse(raw);
    const [h] = await this.db
      .select()
      .from(hostingUpgrades)
      .where(eq(hostingUpgrades.operationId, id));
    if (!h) throw httpError(409, '升级计划不存在');
    const plan = upgradeReleaseSchema.parse(h.plan);
    if (
      evidence.operationId !== id ||
      evidence.deploymentId !== h.deploymentId ||
      evidence.releaseId !== plan.id ||
      evidence.runningImage !== (evidence.outcome === 'upgraded' ? plan.toImage : plan.fromImage) ||
      Date.parse(evidence.completedAt) > now.getTime() + 60000 ||
      Date.parse(evidence.completedAt) < h.createdAt.getTime() - 60000
    )
      throw httpError(409, '升级证据与计划不符');
    if (evidence.outcome === 'upgraded' && !evidence.backup) throw httpError(409, '缺少升级前备份');
    if (
      evidence.backup &&
      (evidence.backup.backupId !== h.deploymentId + '-exit-' + id ||
        Date.parse(evidence.backup.offsiteAt) < Date.parse(evidence.backup.stoppedAt))
    )
      throw httpError(409, '升级备份证据不符');
    if (h.evidence) throw httpError(409, '升级结果已经记录');
    await this.db
      .update(hostingUpgrades)
      .set({ evidence })
      .where(eq(hostingUpgrades.operationId, id));
    await this.db
      .update(deployments)
      .set({ hostingState: 'ready', updatedAt: now })
      .where(eq(deployments.id, h.deploymentId));
    return evidence.outcome === 'upgraded'
      ? 'verified'
      : evidence.outcome === 'rolled_back'
        ? 'upgrade_rolled_back'
        : 'upgrade_rejected';
  }
}
