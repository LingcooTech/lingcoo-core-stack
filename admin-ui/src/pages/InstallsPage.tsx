import { useQuery } from '@tanstack/react-query';
import { listInstalls } from '@/api/admin';
import type { HydratedInstall } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';

export function InstallsPage() {
  const installsQuery = useQuery({ queryKey: ['installs', 100], queryFn: () => listInstalls(100) });
  const installs = installsQuery.data?.items ?? [];

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
      header: '应用/产品',
      cell: (row) => (
        <div>
          <p className="text-xs font-mono">{row.app?.code ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">{row.product?.code ?? '—'}</p>
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
      <SectionHeader sectionKey="instances" />
      <div className="px-6 py-6">
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <DataTable
            columns={installColumns}
            data={installs}
            isLoading={installsQuery.isLoading}
            emptyMessage="暂无安装记录"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>
    </div>
  );
}
