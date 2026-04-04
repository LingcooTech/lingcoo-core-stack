import { useQuery } from '@tanstack/react-query';

import { listBillingWebhooks } from '@/api/admin';
import type { BillingWebhookEvent } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';

export function LogsPage() {
  const webhooksQuery = useQuery({
    queryKey: ['billing-webhooks', 100],
    queryFn: () => listBillingWebhooks(100)
  });
  const webhooks = webhooksQuery.data?.items ?? [];

  const columns: Column<BillingWebhookEvent>[] = [
    {
      key: 'event',
      header: '日志来源',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold font-mono text-foreground">{row.provider} / {row.type}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.providerEventId}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: '处理状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          <p className="text-[10px] text-muted-foreground">{row.processedAt ? `处理于 ${formatTime(row.processedAt)}` : '尚未处理'}</p>
        </div>
      )
    },
    {
      key: 'time',
      header: '记录时间',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs text-foreground">{formatTime(row.createdAt)}</p>
          <p className="text-[10px] text-muted-foreground">更新于 {formatTime(row.updatedAt)}</p>
        </div>
      )
    },
    {
      key: 'payload',
      header: '原始内容',
      cell: (row) => <JsonViewer data={row.payload} label="payload" />
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="logs" />
      <div className="px-6 py-6 space-y-4">
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          当前日志管理页先承接支付回调和处理日志，后续可以继续扩展系统任务日志、API 调用日志和错误日志。
        </div>
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <DataTable
            columns={columns}
            data={webhooks}
            isLoading={webhooksQuery.isLoading}
            emptyMessage="暂无日志记录"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>
    </div>
  );
}
