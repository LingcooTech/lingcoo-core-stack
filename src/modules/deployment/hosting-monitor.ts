import { acquireTransactionLock } from '../../db/locks';
import { and, asc, desc, eq, sql, notInArray } from 'drizzle-orm';
import { hostingIncidentQuerySchema } from '@lingcoo/contracts';
import {
  apps,
  deployments,
  hostingNodes,
  hostingIncidents,
  hostingIncidentEvents,
  hostingMonitorState,
  hostingServices,
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import {
  deploymentObservations,
  nodeObservations,
  serviceObservations,
} from './hosting-monitor-checks';
export class HostingMonitor {
  constructor(private readonly db: DbExecutor) {}
  async reconcile(at?: Date) {
    return this.db.transaction(async (tx) => {
      // Serialize scans, including multiple worker replicas. Never call external services under this lock.
      await acquireTransactionLock(tx, 'deployment:hosting-monitor');
      const nodes = await tx.select().from(hostingNodes);
      const instances = await tx
        .select({ deployment: deployments, app: apps })
        .from(deployments)
        .innerJoin(apps, eq(apps.id, deployments.appId))
        .where(and(eq(deployments.status, 'active'), eq(deployments.deploymentMode, 'managed')));
      const services = await tx
        .select({ service: hostingServices })
        .from(hostingServices)
        .innerJoin(deployments, eq(deployments.id, hostingServices.deploymentId))
        .where(
          and(
            eq(deployments.status, 'active'),
            eq(deployments.deploymentMode, 'managed'),
            notInArray(deployments.hostingState, ['retained', 'terminated']),
          ),
        );
      const now = at ?? new Date();
      const resources = new Set([
        ...nodes.map((n) => 'node:' + n.id),
        ...instances.map((i) => 'deployment:' + i.deployment.id),
        ...services.map((s) => 'service:' + s.service.deploymentId),
      ]);
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const observed = [
        ...nodes.flatMap((n) => nodeObservations(n, now)),
        ...instances.flatMap((i) =>
          deploymentObservations(
            i.deployment,
            nodeMap.get(i.deployment.hostingNodeId ?? ''),
            i.app,
            now,
          ),
        ),
        ...services.flatMap((s) => serviceObservations(s.service, now)),
      ];
      const rows = await tx.select().from(hostingIncidents);
      const key = (r: { scope: string; resourceId: string; code: string }) =>
        [r.scope, r.resourceId, r.code].join(':');
      const map = new Map(rows.map((r) => [key(r), r]));
      let opened = 0,
        resolved = 0;
      for (const check of observed) {
        if (check.state === 'unknown') continue;
        const previous = map.get(key(check));
        if (check.state === 'active') {
          const { state: ignored, ...data } = check;
          void ignored;
          if (!previous) {
            const [row] = await tx
              .insert(hostingIncidents)
              .values({ ...data, state: 'active', firstDetectedAt: now, lastDetectedAt: now })
              .returning();
            await tx
              .insert(hostingIncidentEvents)
              .values({ incidentId: row!.id, kind: 'opened', observedAt: now });
            opened++;
          } else {
            await tx
              .update(hostingIncidents)
              .set({
                ...data,
                state: 'active',
                lastDetectedAt: now,
                resolvedAt: null,
                resolution: null,
                occurrences: previous.occurrences + (previous.state === 'resolved' ? 1 : 0),
              })
              .where(eq(hostingIncidents.id, previous.id));
            if (previous.state === 'resolved') {
              await tx
                .insert(hostingIncidentEvents)
                .values({ incidentId: previous.id, kind: 'opened', observedAt: now });
              opened++;
            }
          }
        } else if (previous?.state === 'active') {
          await tx
            .update(hostingIncidents)
            .set({ state: 'resolved', resolvedAt: now, resolution: 'recovered' })
            .where(eq(hostingIncidents.id, previous.id));
          await tx
            .insert(hostingIncidentEvents)
            .values({ incidentId: previous.id, kind: 'recovered', observedAt: now });
          resolved++;
        }
      }
      for (const row of rows) {
        if (row.state === 'active' && !resources.has(row.scope + ':' + row.resourceId)) {
          await tx
            .update(hostingIncidents)
            .set({ state: 'resolved', resolvedAt: now, resolution: 'retired' })
            .where(eq(hostingIncidents.id, row.id));
          await tx
            .insert(hostingIncidentEvents)
            .values({ incidentId: row.id, kind: 'retired', observedAt: now });
          resolved++;
        }
      }
      await tx
        .insert(hostingMonitorState)
        .values({ id: 1, checkedAt: now })
        .onConflictDoUpdate({ target: hostingMonitorState.id, set: { checkedAt: now } });
      return { opened, resolved };
    });
  }
  async list(raw: unknown) {
    const query = hostingIncidentQuerySchema.parse(raw);
    const where = query.state ? eq(hostingIncidents.state, query.state) : undefined;
    const rows = await this.db
      .select()
      .from(hostingIncidents)
      .where(where)
      .orderBy(desc(hostingIncidents.lastDetectedAt), asc(hostingIncidents.id))
      .limit(query.limit)
      .offset(query.offset);
    const [total] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hostingIncidents)
      .where(where);
    const [active] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hostingIncidents)
      .where(eq(hostingIncidents.state, 'active'));
    const [state] = await this.db
      .select()
      .from(hostingMonitorState)
      .where(eq(hostingMonitorState.id, 1));
    return {
      items: rows.map((r) => ({
        ...r,
        firstDetectedAt: r.firstDetectedAt.toISOString(),
        lastDetectedAt: r.lastDetectedAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      total: total?.count ?? 0,
      activeCount: active?.count ?? 0,
      limit: query.limit,
      offset: query.offset,
      lastScanAt: state?.checkedAt.toISOString() ?? null,
    };
  }
  async history(id: string) {
    const rows = await this.db
      .select()
      .from(hostingIncidentEvents)
      .where(eq(hostingIncidentEvents.incidentId, id))
      .orderBy(desc(hostingIncidentEvents.observedAt), desc(hostingIncidentEvents.id))
      .limit(100);
    return {
      items: rows.map((r) => ({ id: r.id, kind: r.kind, observedAt: r.observedAt.toISOString() })),
    };
  }
  async activeAlerts() {
    const rows = await this.db
      .select()
      .from(hostingIncidents)
      .where(eq(hostingIncidents.state, 'active'))
      .orderBy(desc(hostingIncidents.lastDetectedAt))
      .limit(100);
    const alerts = rows.map((r) => ({
      id: 'hosting-' + r.id + '-' + r.occurrences,
      level: r.severity === 'critical' ? ('error' as const) : ('warning' as const),
      title: r.title,
      description: `${r.scope === 'node' ? '节点' : '实例'} ${r.resourceId.slice(0, 8)}；首次发现 ${r.firstDetectedAt.toISOString()}`,
      count: 1,
      href: '/admin/hosting?tab=incidents',
    }));
    const [state] = await this.db
      .select()
      .from(hostingMonitorState)
      .where(eq(hostingMonitorState.id, 1));
    if (!state || Date.now() - state.checkedAt.getTime() > 10 * 60000)
      alerts.push({
        id: 'hosting-monitor-stale',
        level: 'error',
        title: '托管完整性监测尚未运行或已中断',
        description: '检查平台 Worker；当前告警列表不能代表最新健康状态。',
        count: 1,
        href: '/admin/hosting?tab=incidents',
      });
    return alerts;
  }
}
