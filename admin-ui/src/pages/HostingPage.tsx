import { HostingIncidents } from '@/components/hosting/HostingIncidents';
import { HostingOffers } from '@/components/hosting/HostingOffers';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Server, Boxes, ShieldCheck, Activity, RefreshCw, Search, CircleCheck } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HostingNodeCard } from '@/components/hosting/HostingNodeCard';
import { HostingInstances } from '@/components/hosting/HostingInstances';
import { AddHostingNode } from '@/components/hosting/AddHostingNode';
import { useHostingOverview } from '@/components/hosting/useHostingOverview';
import { HostingEmpty, HostingLoading } from '@/components/hosting/HostingVisuals';
export function HostingPage() {
  const { user } = useAuth();
  const canManageOffers = hasPermission(normalizeRole(user?.role), 'hosting.offers.manage');
  const [params, setParams] = useSearchParams();
  const tab = [
    'servers',
    'instances',
    'operations',
    'incidents',
    ...(canManageOffers ? ['offers'] : []),
  ].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'servers';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const nodes = useQuery({
    queryKey: ['hosting-nodes'],
    queryFn: () => apiClient('GET /v1/admin/hosting/nodes', '/v1/admin/hosting/nodes'),
    refetchInterval: 15000,
  });
  const overview = useHostingOverview();
  const monitor = useQuery({
    queryKey: ['hosting-monitor-summary'],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/hosting/incidents',
        '/v1/admin/hosting/incidents?state=active&limit=1&offset=0',
      ),
    refetchInterval: 30000,
  });
  const items = nodes.data?.items ?? [];
  const filtered = items.filter(
    (n) =>
      `${n.name} ${n.serverIp} ${n.asset.provider}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'deploy' && n.telemetry?.canDeploy) ||
        (filter === 'attention' && (!n.healthy || n.alerts.length > 0))),
  );
  const instances = overview.data?.instances ?? [];
  const protectedCount = instances.filter(
    (i) =>
      i.telemetryFresh &&
      i.backup?.status === 'success' &&
      i.backup.offsiteStatus === 'success' &&
      !!i.backup.offsiteAt &&
      Date.now() - Date.parse(i.backup.offsiteAt) < 36 * 3600000,
  ).length;
  const refresh = () => {
    void nodes.refetch();
    void overview.refetch();
    void monitor.refetch();
  };
  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">运维 / HOSTING</p>
          <h1 className="text-2xl font-semibold tracking-tight">托管运维</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            掌握服务器资源，管理托管应用与数据保护。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={refresh}
            disabled={nodes.isFetching || overview.isFetching}
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <AddHostingNode />
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            title: '服务器在线',
            value: nodes.data ? `${items.filter((n) => n.healthy).length} / ${items.length}` : '—',
            note: '节点健康与资源上报',
            icon: Server,
          },
          {
            title: '托管实例',
            value: overview.data ? String(instances.length) : '—',
            note: overview.data
              ? `${instances.filter((i) => i.state === 'ready' && i.telemetryFresh).length} 个已就绪且报告正常`
              : '正在读取实例',
            icon: Boxes,
          },
          {
            title: '异机备份正常',
            value: overview.data ? `${protectedCount} / ${instances.length}` : '—',
            note: '36 小时内的成功副本',
            icon: ShieldCheck,
          },
          {
            title: '完整性告警',
            value: monitor.data?.lastScanAt ? String(monitor.data.activeCount) : '—',
            note: '实例、资源、备份与期限',
            icon: Activity,
          },
        ].map((m) => (
          <div key={m.title} className="rounded-xl border bg-card px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{m.title}</span>
              <m.icon className="size-4" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{m.value}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{m.note}</p>
          </div>
        ))}
      </div>
      {nodes.data && !nodes.isError ? (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <CircleCheck className="size-4 shrink-0" />
          <span>
            {items.length === 0
              ? '添加第一台服务器，开始建立托管资源池。'
              : monitor.isError
                ? '完整性监测状态读取失败，请在“告警与恢复”中重试。'
                : !monitor.data?.lastScanAt
                  ? '等待首次完整性扫描，暂不能确认实例健康状态。'
                  : Date.now() - Date.parse(monitor.data.lastScanAt) > 10 * 60000
                    ? '完整性监测超过 10 分钟未更新，请检查平台 Worker。'
                    : monitor.data.activeCount
                      ? `有 ${monitor.data.activeCount} 项完整性告警，请查看“告警与恢复”。`
                      : '最近完整性扫描未发现异常。请同时留意节点报告时间。'}
          </span>
        </div>
      ) : null}
      {params.get('deploymentId') && (
        <Button
          variant="outline"
          onClick={() =>
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete('deploymentId');
              return next;
            })
          }
        >
          清除实例筛选，查看全部
        </Button>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('tab', value);
              return next;
            },
            { replace: true },
          )
        }
        className="space-y-5"
      >
        <div className="overflow-x-auto border-b pb-3">
          <TabsList aria-label="托管管理分类">
            <TabsTrigger value="servers">服务器资源</TabsTrigger>
            <TabsTrigger value="instances">托管实例</TabsTrigger>
            <TabsTrigger value="incidents">告警与恢复</TabsTrigger>
            <TabsTrigger value="operations">运维记录</TabsTrigger>
            {canManageOffers && <TabsTrigger value="offers">托管套餐</TabsTrigger>}
          </TabsList>
        </div>
        {canManageOffers && (
          <TabsContent value="offers">
            <HostingOffers />
          </TabsContent>
        )}
        <TabsContent value="servers" className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">服务器资源</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                资源预算与实际占用独立展示，暂停分配不影响已有应用。
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1 sm:w-56">
                <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  aria-label="搜索服务器"
                  placeholder="搜索名称或 IP"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                aria-label="筛选服务器"
                className="h-9 rounded-md border bg-background px-2 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部节点</option>
                <option value="deploy">托管节点</option>
                <option value="attention">需要关注</option>
              </select>
            </div>
          </div>
          {nodes.isError ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
            >
              {nodes.error.message}
              <Button variant="ghost" size="sm" onClick={() => void nodes.refetch()}>
                重试
              </Button>
            </p>
          ) : nodes.isPending ? (
            <HostingLoading />
          ) : filtered.length ? (
            <div className="grid items-stretch gap-4 xl:grid-cols-2">
              {filtered.map((n) => (
                <HostingNodeCard key={n.id} node={n} />
              ))}
            </div>
          ) : (
            <HostingEmpty
              title={items.length ? '没有匹配的服务器' : '尚未添加服务器'}
              description={
                items.length
                  ? '调整搜索条件，或切换节点筛选。'
                  : '登记服务器并接入节点上报后，即可在这里查看资源和运行状态。'
              }
            />
          )}
        </TabsContent>
        <TabsContent value="instances">
          <HostingInstances
            deploymentId={params.get('deploymentId') ?? undefined}
            nodeNames={Object.fromEntries(items.map((n) => [n.id, n.name]))}
          />
        </TabsContent>
        <TabsContent value="incidents">
          <HostingIncidents />
        </TabsContent>
        <TabsContent value="operations">
          <HostingInstances view="operations" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
