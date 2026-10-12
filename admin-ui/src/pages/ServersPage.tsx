import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select, Space } from 'antd';
import { useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { PageContainer, PageToolbar } from '@/components/admin/PageContainer';
import { MetricCard, MetricGrid } from '@/components/admin/MetricCard';
import { AsyncState } from '@/components/admin/AsyncState';
import { HostingNodeCard } from '@/components/hosting/HostingNodeCard';
import { AddHostingNode } from '@/components/hosting/AddHostingNode';
export function ServersPage() {
  const [params, setParams] = useSearchParams();
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
  return (
    <PageContainer title="服务器资源">
      <MetricGrid>
        <MetricCard title="已登记服务器" value={nodes.data ? items.length : '—'} />
        <MetricCard
          title="在线服务器"
          value={nodes.data ? items.filter((n) => n.healthy).length : '—'}
        />
        <MetricCard
          title="允许新分配"
          value={
            nodes.data
              ? items.filter((n) => n.enabled && n.healthy && n.telemetry?.canDeploy).length
              : '—'
          }
        />
      </MetricGrid>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <PageToolbar
          actions={
            <Space>
              <Button onClick={() => void nodes.refetch()} loading={nodes.isFetching}>
                刷新
              </Button>
              <Link to="/developers/server-onboarding">
                <Button>接入指南与 Skill</Button>
              </Link>
              <AddHostingNode />
            </Space>
          }
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
    </PageContainer>
  );
}
