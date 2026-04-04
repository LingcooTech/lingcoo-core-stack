import { useQuery } from '@tanstack/react-query';

import { listEvents } from '@/api/admin';
import type { HydratedEvent } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { formatTime } from '@/lib/utils';

export function EventsPage() {
  const eventsQuery = useQuery({
    queryKey: ['events', 100],
    queryFn: () => listEvents(100)
  });
  const events = eventsQuery.data?.items ?? [];

  const columns: Column<HydratedEvent>[] = [
    {
      key: 'event',
      header: '事件',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold font-mono text-foreground">{row.eventName}</p>
          <p className="text-[10px] text-muted-foreground">{row.product?.code ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.install?.extensionInstallId ?? '—'}</p>
        </div>
      )
    },
    {
      key: 'context',
      header: '用户 / 应用',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">{row.user?.email ?? '—'}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{row.app?.code ?? '—'}</p>
          {row.user?.displayName ? <p className="text-[10px] text-muted-foreground">{row.user.displayName}</p> : null}
        </div>
      )
    },
    {
      key: 'time',
      header: '时间',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs text-foreground">{formatTime(row.eventTime)}</p>
          <p className="text-[10px] text-muted-foreground">写入于 {formatTime(row.createdAt)}</p>
        </div>
      )
    },
    {
      key: 'payload',
      header: '事件内容',
      cell: (row) => <JsonViewer data={row.properties} label="properties" />
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="events" />
      <div className="px-6 py-6">
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <DataTable
            columns={columns}
            data={events}
            isLoading={eventsQuery.isLoading}
            emptyMessage="暂无事件记录"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>
    </div>
  );
}
