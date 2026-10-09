import { HostingExitPanel } from '@/components/hosting/HostingExitPanel';
import { HostingServicePanel } from '@/components/hosting/HostingServicePanel';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Boxes, Search, RefreshCw } from 'lucide-react';
import type { AdminDeployment } from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';

const states: Record<string, string> = {
  ready: '交付就绪',
  waiting_capacity: '等待资源',
  pending_infrastructure: '准备环境',
  deploying: '部署中',
  runtime_ready: '验证入口',
  pending_tls: '配置证书',
  failed: '部署失败',
  cancelled: '已取消',
};
const entitlementLabels: Record<string, string> = {
  active: '有效',
  inactive: '已停用',
  cancelled: '已撤销',
  expired: '已过期',
};
function deliveryLabel(row: AdminDeployment) {
  if (row.status !== 'active') return '已停用';
  if (row.mode === 'managed') return states[row.hostingState ?? ''] ?? '等待部署';
  return row.lastDeployedAt ? '已有部署回报' : '等待部署回报';
}
export function AdminDeploymentsPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<AdminDeployment | null>(null);
  const { user } = useAuth();
  const can = (permission: 'settings.manage' | 'tickets.manage' | 'users.view') =>
    hasPermission(normalizeRole(user?.role), permission);
  const search = params.get('search') ?? '';
  const mode = ['managed', 'self_hosted'].includes(params.get('mode') ?? '')
    ? params.get('mode')!
    : 'all';
  const status = ['active', 'inactive', 'cancelled', 'expired'].includes(params.get('status') ?? '')
    ? params.get('status')!
    : 'all';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(50001, rawPage) : 1;
  const delayedSearch = useDeferredValue(search);
  const change = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  const query = useQuery({
    queryKey: ['admin-deployments', delayedSearch, mode, status, page],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/deployments',
        '/v1/admin/deployments?' +
          new URLSearchParams({
            search: delayedSearch,
            mode,
            status,
            limit: '20',
            offset: String((page - 1) * 20),
          }).toString(),
      ),
  });
  const columns: Column<AdminDeployment>[] = [
    {
      key: 'label',
      className: 'min-w-[240px]',
      header: '应用 / 部署',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.appName} · {r.appCode}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      className: 'min-w-[200px]',
      header: '客户',
      cell: (r) => <span className="break-all">{r.customerEmail}</span>,
    },
    {
      key: 'mode',
      className: 'min-w-[150px] whitespace-nowrap',
      header: '部署方式',
      cell: (r) => (
        <StatusPill
          tone={r.mode === 'managed' ? 'info' : 'neutral'}
          label={r.mode === 'managed' ? '平台托管' : '客户自有服务器'}
        />
      ),
    },
    {
      key: 'state',
      className: 'min-w-[120px] whitespace-nowrap',
      header: '交付状态',
      cell: (r) => (
        <StatusPill
          tone={r.hostingState === 'failed' ? 'danger' : 'neutral'}
          label={deliveryLabel(r)}
        />
      ),
    },
    {
      key: 'domain',
      className: 'min-w-[240px]',
      header: '域名 / 服务器',
      cell: (r) => (
        <div className="text-xs">
          <p className="break-all">{r.domains.join('、') || '尚未配置域名'}</p>
          <p className="mt-1 text-muted-foreground">{r.nodeName ?? r.serverHost ?? '尚未分配'}</p>
        </div>
      ),
    },
    {
      key: 'action',
      className: 'min-w-[110px] whitespace-nowrap',
      header: '详情',
      cell: (r) => (
        <Button variant="outline" size="sm" onClick={() => setSelected(r)}>
          查看详情
        </Button>
      ),
    },
  ];
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Boxes className="size-6 text-muted-foreground" />
            应用部署
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            统一查看客户自有服务器与平台托管的交付记录。
          </p>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </header>
      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        这里记录服务器部署，与插件等应用的“客户端安装”分开管理。交付状态不代表实时运行健康；平台托管的服务状态请进入托管运维查看。
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="搜索应用部署"
            className="pl-9"
            maxLength={200}
            placeholder="搜索客户、应用、部署名称、ID、服务器或托管域名"
            value={search}
            onChange={(e) => change('search', e.target.value)}
          />
        </div>
        <select
          aria-label="部署方式"
          className="h-10 rounded-lg border bg-card px-3 text-sm"
          value={mode}
          onChange={(e) => change('mode', e.target.value)}
        >
          <option value="all">全部部署方式</option>
          <option value="self_hosted">客户自有服务器</option>
          <option value="managed">平台托管</option>
        </select>
        <select
          aria-label="记录状态"
          className="h-10 rounded-lg border bg-card px-3 text-sm"
          value={status}
          onChange={(e) => change('status', e.target.value)}
        >
          <option value="all">全部记录</option>
          <option value="active">有效记录</option>
          <option value="inactive">已停用</option>
          <option value="cancelled">已取消</option>
          <option value="expired">已过期</option>
        </select>
      </div>
      {query.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-destructive">
          部署记录加载失败：{query.error.message}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <DataTable
              columns={columns}
              minTableWidth="1060px"
              data={query.data?.items ?? []}
              isLoading={query.isPending}
              getRowId={(r) => r.id}
              emptyMessage="没有匹配的部署记录"
            />
          </div>
          <PaginationBar
            total={query.data?.total ?? 0}
            page={page}
            pageSize={20}
            onPageChange={(p) => change('page', String(p))}
            isLoading={query.isFetching}
            itemLabel="条部署记录"
          />
        </>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.label ?? '部署详情'}</SheetTitle>
            <SheetDescription>交付信息与关联记录；不显示安装凭据或初始化密码。</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-5 p-4">
              <dl className="space-y-4 text-sm">
                {[
                  ['部署 ID', selected.id],
                  ['应用', `${selected.appName} (${selected.appCode})`],
                  ['客户', selected.customerEmail],
                  ['部署方式', selected.mode === 'managed' ? '平台托管' : '客户自有服务器'],
                  ['交付状态', deliveryLabel(selected)],
                  ['域名', selected.domains.join('、') || '未配置'],
                  ['服务器', selected.nodeName ?? selected.serverHost ?? '未分配'],
                  ['权益 ID', selected.entitlementId ?? '未关联'],
                  [
                    '权益状态',
                    selected.entitlementStatus === 'active' &&
                    selected.entitlementExpiresAt &&
                    Date.parse(selected.entitlementExpiresAt) < Date.now()
                      ? '已过期'
                      : (entitlementLabels[selected.entitlementStatus ?? ''] ?? '未关联'),
                  ],
                  [
                    '权益到期',
                    selected.entitlementId
                      ? selected.entitlementExpiresAt
                        ? formatTime(selected.entitlementExpiresAt)
                        : '未设置到期时间'
                      : '未关联',
                  ],
                  ['创建时间', formatTime(selected.createdAt)],
                  [
                    '最近部署回报',
                    selected.lastDeployedAt ? formatTime(selected.lastDeployedAt) : '尚无部署回报',
                  ],
                  [
                    '最近实例上报',
                    selected.lastReportedAt ? formatTime(selected.lastReportedAt) : '尚无上报',
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-all">{value}</dd>
                  </div>
                ))}
              </dl>
              {selected.mode === 'managed' && (
                <>
                  <HostingServicePanel deploymentId={selected.id} admin />
                  <HostingExitPanel deploymentId={selected.id} admin />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {can('users.view') && (
                  <Button variant="outline" asChild>
                    <Link to={`/admin/users?userId=${selected.userId}`}>客户资料</Link>
                  </Button>
                )}
                {can('tickets.manage') && (
                  <Button variant="outline" asChild>
                    <Link to={`/admin/tickets?deploymentId=${selected.id}`}>关联工单</Link>
                  </Button>
                )}
                {selected.mode === 'managed' &&
                  selected.status === 'active' &&
                  can('settings.manage') && (
                    <Button asChild>
                      <Link to={`/admin/hosting?tab=instances&deploymentId=${selected.id}`}>
                        托管运维
                      </Link>
                    </Button>
                  )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
