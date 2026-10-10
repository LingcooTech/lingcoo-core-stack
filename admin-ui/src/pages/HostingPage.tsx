import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select, Space, Statistic, Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { PageContainer, PageToolbar } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { HostingIncidents } from '@/components/hosting/HostingIncidents';
import { HostingOffers } from '@/components/hosting/HostingOffers';
import { HostingNodeCard } from '@/components/hosting/HostingNodeCard';
import { HostingInstances } from '@/components/hosting/HostingInstances';
import { AddHostingNode } from '@/components/hosting/AddHostingNode';
import { useHostingOverview } from '@/components/hosting/useHostingOverview';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
export function HostingPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const canManageOffers = hasPermission(normalizeRole(user?.role), 'hosting.offers.manage');
  const search = params.get('search') ?? '',
    filter = params.get('nodeType') ?? 'all';
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
  const items = nodes.data?.items ?? [],
    filtered = items.filter(
      (n) =>
        `${n.name} ${n.serverIp} ${n.asset.provider}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'deploy' && n.telemetry?.canDeploy) ||
          (filter === 'attention' && (!n.healthy || n.alerts.length > 0))),
    );
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
      key: 'servers',
      label: '服务器资源',
      children: (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <PageToolbar
            filters={
              <>
                <Input.Search
                  aria-label="搜索服务器"
                  placeholder="搜索名称或 IP"
                  value={search}
                  onChange={(e) => update('search', e.target.value)}
                  style={{ width: 300 }}
                />
                <Select
                  aria-label="筛选服务器"
                  value={filter}
                  onChange={(v) => update('nodeType', v)}
                  style={{ width: 160 }}
                  options={[
                    { value: 'all', label: '全部节点' },
                    { value: 'deploy', label: '托管节点' },
                    { value: 'attention', label: '需要关注' },
                  ]}
                />
              </>
            }
          />
          <p>资源预算与实际占用独立展示，暂停分配不影响已有应用。</p>
          <AsyncState
            loading={nodes.isPending}
            error={nodes.error}
            empty={!filtered.length}
            emptyText={
              items.length ? '没有匹配的服务器' : '尚未添加服务器，登记并接入上报后显示资源状态。'
            }
            onRetry={() => void nodes.refetch()}
          >
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {filtered.map((n) => (
                <HostingNodeCard key={n.id} node={n} />
              ))}
            </div>
          </AsyncState>
        </Space>
      ),
    },
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
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'servers';
  return (
    <PageContainer
      title="托管运维"
      width="wide"
      actions={
        <Space>
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
          <AddHostingNode />
        </Space>
      }
    >
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            title: '服务器在线',
            value: nodes.data ? `${items.filter((n) => n.healthy).length} / ${items.length}` : '—',
            note: '节点健康与资源上报',
          },
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
          <Card className="admin-metric" key={m.title}>
            <Statistic title={m.title} value={m.value} />
            <small>{m.note}</small>
          </Card>
        ))}
      </div>
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
      <Tabs activeKey={tab} onChange={(v) => update('tab', v)} items={tabs} />
    </PageContainer>
  );
}
