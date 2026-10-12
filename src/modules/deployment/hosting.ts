import { hostingAlerts } from './hosting-alerts';
import { hostingAssetSchema, type hostingNodeStateSchema } from '@lingcoo/contracts';
import type { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  hostingNodeReportSchema,
  hostingResourcesSchema,
  type HostingResources,
} from '@lingcoo/contracts';
import { apps, deployments, hostingNodes, deploymentComposeRequests } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { acquireTransactionLock } from '../../db/locks';
import { hashPassword, verifyPassword } from '../../lib/security';
import { httpError } from '../../lib/errors';

export const HOSTING_REPORT_MAX_AGE_MS = 5 * 60 * 1000;
export const resourceKeys = ['cpuMillis', 'memoryMb', 'diskMb'] as const;
type Node = typeof hostingNodes.$inferSelect;
type Deployment = typeof deployments.$inferSelect;
const emptyResources = (): HostingResources => ({ cpuMillis: 0, memoryMb: 0, diskMb: 0 });

export function evaluateHostingNode(
  node: Node,
  reserved: HostingResources,
  requested: HostingResources,
  now: Date,
) {
  const report = hostingNodeReportSchema.safeParse(node.report);
  const age = node.lastReportedAt ? now.getTime() - node.lastReportedAt.getTime() : Infinity;
  if (
    !node.enabled ||
    !report.success ||
    !report.data.dockerReady ||
    report.data.canDeploy === false ||
    age < 0 ||
    age > HOSTING_REPORT_MAX_AGE_MS
  )
    return null;
  const remaining = emptyResources();
  for (const key of resourceKeys) {
    // Both the operator's allocation budget and the recent measured headroom must fit.
    // Reservations are deducted from the report too: unstarted instances consume no live RAM yet.
    remaining[key] = Math.min(node[key], report.data.available[key]) - reserved[key];
    if (remaining[key] < requested[key]) return null;
  }
  return Math.min(
    ...resourceKeys.map((key) => (remaining[key] - requested[key]) / Math.max(1, node[key])),
  );
}

export class HostingRepository {
  constructor(private readonly db: DbExecutor) {}

  async lockPool() {
    // Every capacity/prefix reservation and release shares this transaction-scoped lock.
    await acquireTransactionLock(this.db, 'deployment:hosting-pool');
  }

  async listNodes() {
    return this.db.select().from(hostingNodes).orderBy(asc(hostingNodes.id));
  }

  async reservations() {
    const rows = await this.db
      .select()
      .from(deployments)
      .where(and(eq(deployments.deploymentMode, 'managed'), eq(deployments.status, 'active')));
    const result = new Map<string, HostingResources>();
    for (const row of rows) {
      if (!row.hostingNodeId) continue;
      const parsed = hostingResourcesSchema.safeParse(row.hostingResources);
      if (!parsed.success) throw httpError(503, '托管资源记录异常，暂停分配');
      const used = result.get(row.hostingNodeId) ?? emptyResources();
      for (const key of resourceKeys) {
        if (key !== 'diskMb' && ['retained', 'terminated'].includes(row.hostingState ?? ''))
          continue;
        used[key] += parsed.data[key];
      }
      result.set(row.hostingNodeId, used);
    }
    return result;
  }

  async nodeViews(now: Date) {
    const [nodes, reserved] = await Promise.all([this.listNodes(), this.reservations()]);
    return {
      items: nodes.map((node) => {
        const report = hostingNodeReportSchema.safeParse(node.report);
        return {
          id: node.id,
          name: node.name,
          serverIp: node.serverIp,
          enabled: node.enabled,
          capacity: { cpuMillis: node.cpuMillis, memoryMb: node.memoryMb, diskMb: node.diskMb },
          reserved: reserved.get(node.id) ?? emptyResources(),
          available: report.success ? report.data.available : null,
          healthy:
            report.success &&
            report.data.dockerReady &&
            !!node.lastReportedAt &&
            now.getTime() - node.lastReportedAt.getTime() >= 0 &&
            now.getTime() - node.lastReportedAt.getTime() <= HOSTING_REPORT_MAX_AGE_MS,
          asset: hostingAssetSchema.parse(node.asset),
          telemetry: report.success ? report.data : null,
          alerts: hostingAlerts(node, now),
          lastReportedAt: node.lastReportedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async createNode(
    input: {
      name: string;
      serverIp: string;
      capacity: HostingResources;
      asset?: z.infer<typeof hostingAssetSchema>;
    },
    now: Date,
  ) {
    const reportToken = randomBytes(32).toString('base64url');
    const [node] = await this.db
      .insert(hostingNodes)
      .values({
        name: input.name,
        asset: input.asset ?? {},
        serverIp: input.serverIp,
        ...input.capacity,
        reportTokenHash: hashPassword(reportToken),
      })
      .onConflictDoNothing()
      .returning();
    if (!node) throw httpError(409, '该服务器 IP 已登记');
    const view = (await this.nodeViews(now)).items.find((item) => item.id === node.id)!;
    return { node: view, reportToken };
  }

  async updateNode(nodeId: string, input: z.infer<typeof hostingNodeStateSchema>) {
    const [node] = await this.db.select().from(hostingNodes).where(eq(hostingNodes.id, nodeId));
    if (!node) throw httpError(404, '托管节点不存在');
    if (input.capacity) {
      const reserved = (await this.reservations()).get(nodeId) ?? emptyResources();
      for (const key of resourceKeys)
        if (input.capacity[key] < reserved[key]) throw httpError(409, '容量预算不得低于已预留资源');
    }
    const report = hostingNodeReportSchema.safeParse(node.report);
    if (input.enabled && report.success && report.data.canDeploy === false)
      throw httpError(409, '当前节点仅监控，未安装部署执行器');
    await this.db
      .update(hostingNodes)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.capacity ?? {}),
        ...(input.asset ? { asset: input.asset } : {}),
      })
      .where(eq(hostingNodes.id, nodeId));
  }

  async setEnabled(nodeId: string, enabled: boolean) {
    const [node] = await this.db
      .update(hostingNodes)
      .set({ enabled })
      .where(eq(hostingNodes.id, nodeId))
      .returning();
    if (!node) throw httpError(404, '托管节点不存在');
  }

  async authenticate(nodeId: string, token: string) {
    const [node] = await this.db.select().from(hostingNodes).where(eq(hostingNodes.id, nodeId));
    if (!node || !verifyPassword(token, node.reportTokenHash))
      throw httpError(401, '节点报告凭据无效');
    return node;
  }

  async nextExecution(nodeId: string) {
    const [row] = await this.db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.hostingNodeId, nodeId),
          eq(deployments.status, 'active'),
          eq(deployments.deploymentMode, 'managed'),
          inArray(deployments.hostingState, ['pending_infrastructure', 'deploying']),
        ),
      )
      .orderBy(asc(deployments.createdAt))
      .limit(1)
      .for('update');
    return row;
  }

  async report(nodeId: string, token: string, payload: unknown, now: Date) {
    const [node] = await this.db.select().from(hostingNodes).where(eq(hostingNodes.id, nodeId));
    if (!node || !verifyPassword(token, node.reportTokenHash))
      throw httpError(401, '节点报告凭据无效');
    const report = hostingNodeReportSchema.parse(payload);
    await this.db
      .update(hostingNodes)
      .set({ report, lastReportedAt: now })
      .where(eq(hostingNodes.id, nodeId));
  }

  async reservePrefix(requested: string | undefined) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const prefix = requested ?? `app-${randomBytes(8).toString('hex')}`;
      const [existing] = await this.db
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.hostedPrefix, prefix))
        .limit(1);
      if (!existing) return prefix;
      if (requested) throw httpError(409, '此前缀已被使用，请换一个或选择自动生成');
    }
    throw httpError(503, '域名前缀暂时无法分配，请重试');
  }

  async allocate(deployment: Deployment, now: Date) {
    if (deployment.status !== 'active' || deployment.hostingState !== 'waiting_capacity') return;
    const requested = hostingResourcesSchema.parse(deployment.hostingResources);
    const nodes = await this.listNodes();
    const reserved = await this.reservations();
    const [application] = await this.db
      .select({ code: apps.code })
      .from(apps)
      .where(eq(apps.id, deployment.appId));
    if (!application) return;
    const [composeRequest] = await this.db
      .select({ id: deploymentComposeRequests.deploymentId })
      .from(deploymentComposeRequests)
      .where(eq(deploymentComposeRequests.deploymentId, deployment.id));
    const candidate = nodes
      .filter((node) => {
        const report = hostingNodeReportSchema.safeParse(node.report);
        return (
          report.success &&
          (composeRequest
            ? (report.data.supportedProtocols ?? []).includes('compose_install_v1')
            : (report.data.supportedApps ?? []).includes(application.code))
        );
      })
      .map((node) => ({
        node,
        score: evaluateHostingNode(node, reserved.get(node.id) ?? emptyResources(), requested, now),
      }))
      .filter((item): item is { node: Node; score: number } => item.score !== null)
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))[0];
    if (!candidate) return;
    await this.db
      .update(deployments)
      .set({
        hostingNodeId: candidate.node.id,
        serverHost: candidate.node.serverIp,
        hostingState: 'pending_infrastructure',
        updatedAt: now,
      })
      .where(eq(deployments.id, deployment.id));
  }

  async waiting() {
    return this.db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.deploymentMode, 'managed'),
          eq(deployments.status, 'active'),
          eq(deployments.hostingState, 'waiting_capacity'),
        ),
      )
      .orderBy(asc(deployments.createdAt))
      .limit(100);
  }
}
