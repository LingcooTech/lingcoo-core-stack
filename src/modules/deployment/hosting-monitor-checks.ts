import { hostingNodeReportSchema, hostingProfileSchema } from '@lingcoo/contracts';
import type { hostingNodes, deployments, hostingServices } from '../../db/schema';
import { hostingAlerts } from './hosting-alerts';
export type HealthObservation = {
  scope: 'node' | 'deployment' | 'service';
  resourceId: string;
  code: string;
  title: string;
  severity: 'warning' | 'critical';
  state: 'active' | 'clear' | 'unknown';
};
const nodeCodes = [
  'node_offline',
  'docker_unavailable',
  'memory_pressure',
  'disk_pressure',
  'certificate_expiring',
  'certificate_automation',
  'certificate_missing',
  'container_unhealthy',
  'server_expiring',
];
const fresh = (date: Date | null, now: Date) =>
  date !== null && now.getTime() - date.getTime() >= 0 && now.getTime() - date.getTime() <= 300000;
export function nodeObservations(
  node: typeof hostingNodes.$inferSelect,
  now: Date,
): HealthObservation[] {
  const reliable =
    fresh(node.lastReportedAt, now) && hostingNodeReportSchema.safeParse(node.report).success;
  const alerts = hostingAlerts(node, now);
  return nodeCodes.map((code) => {
    const alert = alerts.find((a) => a.code === code);
    return {
      scope: 'node',
      resourceId: node.id,
      code,
      title: alert?.message ?? code,
      severity: alert?.severity ?? 'warning',
      state: alert ? 'active' : reliable || code === 'node_offline' ? 'clear' : 'unknown',
    };
  });
}
export function monitorProfile(_appCode: string, meta: unknown) {
  const raw =
    meta && typeof meta === 'object' ? (meta as Record<string, unknown>).hostingProfile : undefined;
  const profile = hostingProfileSchema.safeParse(raw);
  if (profile.success && profile.data.monitoring) return profile.data.monitoring;
  if (raw && typeof raw === 'object' && 'monitoring' in raw && !profile.success) return null;
  return null;
}
export function deploymentObservations(
  d: typeof deployments.$inferSelect,
  node: typeof hostingNodes.$inferSelect | undefined,
  app: { code: string; meta: unknown },
  now: Date,
): HealthObservation[] {
  const make = (
    code: string,
    title: string,
    state: HealthObservation['state'],
    severity: HealthObservation['severity'] = 'critical',
  ): HealthObservation => ({ scope: 'deployment', resourceId: d.id, code, title, state, severity });
  const report = hostingNodeReportSchema.safeParse(node?.report);
  const reliable = !!node && fresh(node.lastReportedAt, now) && report.success;
  const age = now.getTime() - d.updatedAt.getTime();
  const runtimeExpected =
    !!d.lastDeployedAt || ['runtime_ready', 'pending_tls', 'ready'].includes(d.hostingState ?? '');
  const profile = monitorProfile(app.code, app.meta);
  const observations = [
    make('delivery_failed', '托管交付失败', d.hostingState === 'failed' ? 'active' : 'clear'),
    make(
      'delivery_stalled',
      '托管交付等待超过一小时',
      !['ready', 'failed', 'cancelled'].includes(d.hostingState ?? '') && age > 3600000
        ? 'active'
        : 'clear',
      'warning',
    ),
    make(
      'node_report_missing',
      '托管实例缺少有效节点报告',
      runtimeExpected && !reliable ? 'active' : 'clear',
    ),
    make(
      'monitoring_configuration',
      '应用尚未声明可信运行监测清单',
      runtimeExpected && !profile ? 'active' : 'clear',
      'warning',
    ),
  ];
  if (!runtimeExpected || !reliable || !report.success || !profile) return observations;
  const expectedProject = profile.projectPrefix + '-' + d.id.replaceAll('-', '');
  const containers = report.data.containers;
  observations.push(
    make(
      'services_missing',
      '实例服务停止、缺失或不健康',
      !containers ||
        profile.services.some(
          (service) =>
            !containers.some(
              (c) =>
                c.project === expectedProject &&
                c.service === service &&
                c.state === 'running' &&
                c.health !== 'unhealthy',
            ),
        )
        ? 'active'
        : 'clear',
    ),
  );
  const backup = report.data.backups?.find((b) => b.deploymentId === d.id);
  const deliveredAge = now.getTime() - (d.lastDeployedAt ?? d.createdAt).getTime();
  const expired = (value: string | null | undefined) =>
    !value ||
    now.getTime() - Date.parse(value) < 0 ||
    now.getTime() - Date.parse(value) > 36 * 3600000;
  if (profile.backupRequired)
    observations.push(
      make(
        'backup_missing',
        '本地备份失败、缺失或超过 36 小时',
        !backup && deliveredAge <= 36 * 3600000
          ? 'unknown'
          : backup?.status !== 'success' || expired(backup.completedAt)
            ? 'active'
            : 'clear',
      ),
    );
  if (profile.offsiteRequired)
    observations.push(
      make(
        'offsite_missing',
        '异机备份失败、缺失或超过 36 小时',
        !backup && deliveredAge <= 36 * 3600000
          ? 'unknown'
          : backup?.offsiteStatus !== 'success' || expired(backup.offsiteAt)
            ? 'active'
            : 'clear',
        'warning',
      ),
    );
  return observations;
}
export function serviceObservations(
  service: typeof hostingServices.$inferSelect,
  now: Date,
): HealthObservation[] {
  const expires = service.expiresAt?.getTime();
  return [
    {
      code: 'service_due',
      title: '托管服务将在 7 天内到期',
      state:
        expires && expires > now.getTime() && expires - now.getTime() <= 7 * 86400000
          ? 'active'
          : 'clear',
      severity: 'warning',
    },
    {
      code: 'service_expired',
      title: '托管服务已到期，请处理续费或退出安排',
      state: expires && expires <= now.getTime() ? 'active' : 'clear',
      severity: 'critical',
    },
  ].map(
    (item) =>
      ({ ...item, scope: 'service', resourceId: service.deploymentId }) as HealthObservation,
  );
}
