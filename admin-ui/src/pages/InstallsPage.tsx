import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { listInstalls } from '@/api/admin';
import type { HydratedInstall } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

export function InstallsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const installQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearchQuery.trim() || undefined,
    }),
    [deferredSearchQuery, page],
  );
  const installsQuery = useQuery({
    queryKey: ['installs', installQuery],
    queryFn: () => listInstalls(installQuery),
  });
  const installs = installsQuery.data?.items ?? [];
  const totalInstalls = installsQuery.data?.total ?? 0;

  useEffect(() => {
    setPage(1);
  }, [deferredSearchQuery]);

  const installColumns: Column<HydratedInstall>[] = [
    {
      key: 'install',
      header: '安装实例',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold font-mono">{row.extensionInstallId}</p>
          {row.chromeProfileHint && <p className="text-[10px] text-muted-foreground">{row.chromeProfileHint}</p>}
          {row.appVersion && <p className="text-[10px] text-muted-foreground">v{row.appVersion}</p>}
        </div>
      )
    },
    {
      key: 'app',
      header: '应用',
      cell: (row) => (
        <div>
          <p className="text-xs font-mono">{row.app?.code ?? '—'}</p>
          <StatusPill tone="neutral" label={row.app?.type ?? '—'} className="mt-1" />
        </div>
      )
    },
    {
      key: 'user',
      header: '用户',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? '未绑定'}</p>
          {row.user?.displayName && <p className="text-[10px] text-muted-foreground">{row.user.displayName}</p>}
        </div>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      )
    },
    {
      key: 'lastSeen',
      header: '最近活跃',
      cell: (row) => (
        <div>
          <p className="text-xs">{formatTime(row.lastSeenAt)}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</p>
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight">安装实例</h1>
        <p className="text-sm text-muted-foreground mt-1">查看应用安装记录与设备信息</p>
      </div>
      <div className="px-6 pb-6 space-y-4">
        <FilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜索安装 ID、用户、应用..."
        />

        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <DataTable
            columns={installColumns}
            data={installs}
            isLoading={installsQuery.isLoading}
            emptyMessage="暂无安装记录"
            getRowKey={(row) => row.id}
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
