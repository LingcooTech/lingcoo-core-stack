import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
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
      header: '安装实例',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.extensionInstallId}</p>
          {row.chromeProfileHint && (
            <p className="text-muted-foreground text-[10px]">{row.chromeProfileHint}</p>
          )}
          {row.appVersion && <p className="text-muted-foreground text-[10px]">v{row.appVersion}</p>}
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
            <p className="text-muted-foreground text-[10px]">{row.user.displayName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          <p className="text-muted-foreground text-[10px]">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'lastSeen',
      header: '最近活跃',
      cell: (row) => (
        <div>
          <p className="text-xs">{formatTime(row.lastSeenAt)}</p>
          <p className="text-muted-foreground text-[10px]">{formatTime(row.updatedAt)}</p>
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
      <div className="space-y-4 p-6">
        <FilterChipBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索安装 ID、用户、应用..."
        />

        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <DataTable
            columns={installColumns}
            data={installs}
            isLoading={installsQuery.isLoading}
            emptyMessage="暂无安装记录"
            getRowId={(row) => row.id}
          />
        </div>

        <div className="mt-4">
          <PaginationBar
            total={totalInstalls}
            page={page}
            pageSize={PAGE_SIZE}
            isLoading={installsQuery.isLoading}
            itemLabel="条安装记录"
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
