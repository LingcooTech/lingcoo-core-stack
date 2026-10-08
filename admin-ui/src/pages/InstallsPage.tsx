import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Monitor, Info } from 'lucide-react';
import { useDeferredValue, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { listInstalls } from '@/api/admin';
import type { HydratedInstall } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar } from '@/components/shared/FilterChipBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { useTableState } from '@/hooks/useTableState';
import { recordStatusLabel } from '@/lib/portal-labels';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

function adminSearchHref(path: string, search: string) {
  return `${path}?search=${encodeURIComponent(search)}`;
}

function observabilityHref(search: string) {
  return `/admin/observability?tab=events&events.search=${encodeURIComponent(search)}`;
}

function userDetailHref(userId: string) {
  return `/admin/users?userId=${encodeURIComponent(userId)}`;
}

export function InstallsPage() {
  const { user } = useAuth();
  const canViewDeployments = hasPermission(normalizeRole(user?.role), 'deployments.view');
  const { page, search, setPage, setSearch } = useTableState({ defaultPageSize: PAGE_SIZE });
  const deferredSearch = useDeferredValue(search);

  const installQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
    }),
    [deferredSearch, page],
  );
  const installsQuery = useQuery({
    queryKey: ['installs', installQuery],
    queryFn: () => listInstalls(installQuery),
  });
  const installs = installsQuery.data?.items ?? [];
  const totalInstalls = installsQuery.data?.total ?? 0;

  const installColumns: Column<HydratedInstall>[] = [
    {
      key: 'install',
      header: '客户端安装',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.extensionInstallId}</p>
          {row.chromeProfileHint && (
            <p className="text-[10px] text-muted-foreground">{row.chromeProfileHint}</p>
          )}
          {row.appVersion && <p className="text-[10px] text-muted-foreground">v{row.appVersion}</p>}
        </div>
      ),
    },
    {
      key: 'app',
      header: '应用',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs">{row.app?.code ?? '—'}</p>
          <StatusPill tone="neutral" label={row.app?.type ?? '—'} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'user',
      header: '用户',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? '未绑定'}</p>
          {row.user?.displayName && (
            <p className="text-[10px] text-muted-foreground">{row.user.displayName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: '登记状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={recordStatusLabel(row.status)} />
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'lastSeen',
      header: '最近上报',
      cell: (row) => (
        <div>
          <p className="text-xs">{formatTime(row.lastSeenAt)}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '关联处理',
      className: 'min-w-[220px]',
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.user ? <ActionLink to={userDetailHref(row.user.id)} label="用户 360" /> : null}
          <ActionLink to={observabilityHref(row.extensionInstallId)} label="事件" />
          <ActionLink to={adminSearchHref('/admin/tickets', row.extensionInstallId)} label="工单" />
          <ActionLink
            to={adminSearchHref('/admin/licenses', row.user?.email ?? row.extensionInstallId)}
            label="授权"
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader sectionKey="installs" />
      <div className="space-y-5 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Monitor className="size-6 text-muted-foreground" />
              客户端安装
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              查看插件等客户端主动登记的安装、版本和用户绑定，处理接入与授权问题。
            </p>
          </div>
          {canViewDeployments ? (
            <Button variant="outline" asChild>
              <Link to="/admin/deployments">
                查看应用部署
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </header>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            这里记录客户端主动调用登记接口产生的安装。客户使用 deploy token
            安装到服务器的记录位于“应用部署”。“最近上报”反映客户端最后一次联系平台的时间，不代表服务器健康。服务器、容器、证书和备份统一在“托管运维”管理。
          </p>
        </div>
        {installsQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            加载客户端安装记录失败：{installsQuery.error.message}
            <Button variant="ghost" size="sm" onClick={() => void installsQuery.refetch()}>
              重试
            </Button>
          </p>
        ) : null}
        <FilterChipBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索客户端安装 ID、用户、应用..."
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DataTable
            columns={installColumns}
            data={installs}
            isLoading={installsQuery.isLoading}
            emptyMessage="暂无客户端登记记录"
            getRowId={(row) => row.id}
          />
        </div>

        <div className="mt-4">
          <PaginationBar
            total={totalInstalls}
            page={page}
            pageSize={PAGE_SIZE}
            isLoading={installsQuery.isLoading}
            itemLabel="条客户端安装记录"
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
      <Link to={to}>
        {label}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}
