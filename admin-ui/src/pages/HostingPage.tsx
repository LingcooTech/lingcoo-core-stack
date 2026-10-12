import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Tabs } from 'antd';
import { Navigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { MetricCard, MetricGrid } from '@/components/admin/MetricCard';
import { PageContainer } from '@/components/admin/PageContainer';
import { HostingIncidents } from '@/components/hosting/HostingIncidents';
import { HostingOffers } from '@/components/hosting/HostingOffers';
import { HostingInstances } from '@/components/hosting/HostingInstances';
import { useHostingOverview } from '@/components/hosting/useHostingOverview';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
export function HostingPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const canManageOffers = hasPermission(normalizeRole(user?.role), 'hosting.offers.manage');
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const nodes = useQuery({
      queryKey: ['hosting-nodes'],
      queryFn: () => apiClient('GET /v1/admin/hosting/nodes', '/v1/admin/hosting/nodes'),
      refetchInterval: 15000,
    }),
    overview = useHostingOverview(),
    monitor = useQuery({
      queryKey: ['hosting-monitor-summary'],
      queryFn: () =>
        apiClient(
          'GET /v1/admin/hosting/incidents',
          '/v1/admin/hosting/incidents?state=active&limit=1&offset=0',
        ),
      refetchInterval: 30000,
    });
  const items = nodes.data?.items ?? [];
  const instances = overview.data?.instances ?? [],
    backupInstances = instances.filter((i) => !['retained', 'terminated'].includes(i.state ?? '')),
    protectedCount = backupInstances.filter(
      (i) =>
        i.telemetryFresh &&
        i.backup?.status === 'success' &&
        i.backup.offsiteStatus === 'success' &&
        i.backup.offsiteAt &&
        Date.now() - Date.parse(i.backup.offsiteAt) < 36 * 3600000,
    ).length;
  const monitorText = monitor.isPending
    ? '正在读取完整性监测状态…'
    : monitor.isError
      ? '完整性监测状态读取失败，请重试。'
      : !monitor.data.lastScanAt
        ? '等待首次完整性扫描，暂不能确认实例健康状态。'
        : Date.now() - Date.parse(monitor.data.lastScanAt) > 600000
          ? '完整性监测超过 10 分钟未更新，请检查平台 Worker。'
          : monitor.data.activeCount
            ? `有 ${monitor.data.activeCount} 项完整性告警，请查看“告警与恢复”。`
            : '最近完整性扫描未发现异常。请同时留意节点报告时间。';
  const tabs = [
    {
      key: 'instances',
      label: '托管实例',
      children: (
        <HostingInstances
          deploymentId={params.get('deploymentId') ?? undefined}
          nodeNames={Object.fromEntries(items.map((n) => [n.id, n.name]))}
        />
      ),
    },
    { key: 'incidents', label: '告警与恢复', children: <HostingIncidents /> },
    { key: 'operations', label: '运维记录', children: <HostingInstances view="operations" /> },
    ...(canManageOffers ? [{ key: 'offers', label: '托管套餐', children: <HostingOffers /> }] : []),
  ];
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'instances';
  if (params.get('tab') === 'servers') return <Navigate to="/admin/servers" replace />;
  return (
    <PageContainer title="托管运维">
      <MetricGrid>
        {[
          {
            title: '托管实例',
            value: overview.data ? instances.length : '—',
            note: `${instances.filter((i) => i.state === 'ready' && i.telemetryFresh).length} 个已就绪且报告正常`,
          },
          {
            title: '异机备份正常',
            value: overview.data ? `${protectedCount} / ${backupInstances.length}` : '—',
            note: '运行实例 36 小时内的成功副本',
          },
          {
            title: '完整性告警',
            value: monitor.data?.lastScanAt ? monitor.data.activeCount : '—',
            note: '实例、资源、备份与期限',
          },
        ].map((m) => (
          <MetricCard key={m.title} title={m.title} value={m.value} note={m.note} />
        ))}
      </MetricGrid>
      <Alert
        type={
          monitor.isError || !monitor.data?.lastScanAt || monitor.data.activeCount
            ? 'warning'
            : 'info'
        }
        title={monitorText}
        action={monitor.isError && <Button onClick={() => void monitor.refetch()}>重试</Button>}
      />
      {overview.isError && (
        <Alert
          type="error"
          title={overview.error.message}
          action={<Button onClick={() => void overview.refetch()}>重试实例状态</Button>}
        />
      )}{' '}
      {params.get('deploymentId') && (
        <Button onClick={() => update('deploymentId', '')}>清除实例筛选，查看全部</Button>
      )}
      <Tabs
        className="admin-section-tabs"
        activeKey={tab}
        onChange={(v) => update('tab', v)}
        items={tabs}
        tabBarExtraContent={
          <Button
            loading={nodes.isFetching || overview.isFetching || monitor.isFetching}
            onClick={() => {
              void nodes.refetch();
              void overview.refetch();
              void monitor.refetch();
            }}
          >
            刷新
          </Button>
        }
      />
    </PageContainer>
  );
}
