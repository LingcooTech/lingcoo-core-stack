import { hostingAssetSchema, hostingNodeReportSchema } from '@lingcoo/contracts';
import type { hostingNodes } from '../../db/schema';
export function hostingAlerts(node: typeof hostingNodes.$inferSelect, now: Date) {
  const alerts: { code: string; severity: 'warning' | 'critical'; message: string }[] = [];
  const report = hostingNodeReportSchema.safeParse(node.report);
  const age = node.lastReportedAt ? now.getTime() - node.lastReportedAt.getTime() : Infinity;
  if (age < 0 || age > 300000 || !report.success) {
    alerts.push({
      code: 'node_offline',
      severity: 'critical',
      message: '节点报告缺失或超过 5 分钟',
    });
    return alerts;
  }
  const r = report.data;
  if (!r.dockerReady)
    alerts.push({
      code: 'docker_unavailable',
      severity: 'critical',
      message: 'Docker 或 Compose 不可用',
    });
  if (r.available.memoryMb < 512)
    alerts.push({
      code: 'memory_pressure',
      severity: 'warning',
      message: '可用内存低于 512 MiB，检查容量',
    });
  if (r.available.diskMb < 5120)
    alerts.push({ code: 'disk_pressure', severity: 'critical', message: '可用磁盘低于 5 GiB' });
  if (r.certificate && Date.parse(r.certificate.expiresAt) - now.getTime() < 14 * 86400000)
    alerts.push({
      code: 'certificate_expiring',
      severity: 'critical',
      message: '平台通配符证书将在 14 天内到期或已过期',
    });
  if (
    r.certificateAutomation &&
    (r.certificateAutomation.status !== 'success' ||
      now.getTime() - Date.parse(r.certificateAutomation.checkedAt) > 36 * 3600000)
  )
    alerts.push({
      code: 'certificate_automation',
      severity: 'critical',
      message: '证书签发或分发失败，或超过 36 小时未运行',
    });
  if (r.canDeploy && !r.certificate)
    alerts.push({
      code: 'certificate_missing',
      severity: 'warning',
      message: '尚未上报平台通配符证书',
    });
  const bad = (r.containers ?? []).filter((c) => c.state === 'running' && c.health === 'unhealthy');
  if (bad.length)
    alerts.push({
      code: 'container_unhealthy',
      severity: 'critical',
      message: `${bad.length} 个容器健康检查失败`,
    });
  for (const b of r.backups ?? []) {
    // Registered-instance monitoring owns service completeness; node reports do not define application topology.
    if (
      b.status !== 'success' ||
      !b.completedAt ||
      now.getTime() - Date.parse(b.completedAt) > 36 * 3600000
    )
      alerts.push({
        code: 'backup_' + b.deploymentId,
        severity: 'critical',
        message: `实例 ${b.deploymentId.slice(0, 8)} 本地备份失败或超过 36 小时`,
      });
    if (
      b.offsiteStatus !== 'success' ||
      !b.offsiteAt ||
      now.getTime() - Date.parse(b.offsiteAt) > 36 * 3600000
    )
      alerts.push({
        code: 'offsite_' + b.deploymentId,
        severity: 'warning',
        message: `实例 ${b.deploymentId.slice(0, 8)} 异机备份未就绪或已过期`,
      });
  }
  const asset = hostingAssetSchema.parse(node.asset);
  if (asset.expiresAt && Date.parse(asset.expiresAt) - now.getTime() < 14 * 86400000)
    alerts.push({
      code: 'server_expiring',
      severity: 'warning',
      message: '服务器将在 14 天内到期或已到期',
    });
  return alerts;
}
