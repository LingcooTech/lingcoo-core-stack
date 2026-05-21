import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { listBillingWebhooks, listEvents } from '@/api/admin';
import type { BillingWebhookEvent, HydratedEvent } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar } from '@/components/shared/FilterChipBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTableState } from '@/hooks/useTableState';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

export function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState<'events' | 'webhooks'>('events');

  const eventsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'events' });
  const webhooksTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'webhooks' });
  const deferredEventSearch = useDeferredValue(eventsTable.search);
  const deferredWebhookSearch = useDeferredValue(webhooksTable.search);

  const eventQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (eventsTable.page - 1) * PAGE_SIZE,
      search: deferredEventSearch.trim() || undefined,
    }),
    [deferredEventSearch, eventsTable.page],
  );
  const webhookQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (webhooksTable.page - 1) * PAGE_SIZE,
      search: deferredWebhookSearch.trim() || undefined,
    }),
    [deferredWebhookSearch, webhooksTable.page],
  );

  const eventsQuery = useQuery({
    queryKey: ['events', eventQuery],
    queryFn: () => listEvents(eventQuery),
  });
  const webhooksQuery = useQuery({
    queryKey: ['billing-webhooks', webhookQuery],
    queryFn: () => listBillingWebhooks(webhookQuery),
  });

  const events = eventsQuery.data?.items ?? [];
  const webhooks = webhooksQuery.data?.items ?? [];
  const totalEvents = eventsQuery.data?.total ?? 0;
  const totalWebhooks = webhooksQuery.data?.total ?? 0;

  const eventColumns: Column<HydratedEvent>[] = [
    {
      key: 'event',
      header: '事件',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.eventName}</p>
          {row.app && <p className="text-muted-foreground text-[10px]">{row.app.code}</p>}
          {row.install && (
            <p className="text-muted-foreground font-mono text-[10px]">
              {row.install.extensionInstallId}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'time',
      header: '时间',
      cell: (row) => (
        <div>
          <p className="text-xs">{formatTime(row.eventTime)}</p>
          <p className="text-muted-foreground text-[10px]">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: '用户/应用',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? '—'}</p>
          {row.app && <p className="text-muted-foreground font-mono text-[10px]">{row.app.code}</p>}
          {row.user?.displayName && (
            <p className="text-muted-foreground text-[10px]">{row.user.displayName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'context',
      header: 'Context',
      cell: (row) => (
        <div className="text-muted-foreground space-y-0.5 font-mono text-[10px]">
          {row.installId && <p className="max-w-[100px] truncate">install: {row.installId}</p>}
          {row.appId && <p className="max-w-[100px] truncate">app: {row.appId}</p>}
        </div>
      ),
    },
    {
      key: 'payload',
      header: 'Payload',
      cell: (row) => <JsonViewer data={row.properties} label="props" />,
    },
  ];

  const webhookColumns: Column<BillingWebhookEvent>[] = [
    {
      key: 'event',
      header: '回调',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">
            {row.provider} / {row.type}
          </p>
          <StatusPill tone="neutral" label={row.provider} className="mt-1" />
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
      key: 'eventId',
      header: '事件号',
      cell: (row) => (
        <div>
          <p className="max-w-[140px] truncate font-mono text-xs">{row.providerEventId}</p>
          <p className="text-muted-foreground font-mono text-[10px]">{row.id}</p>
        </div>
      ),
    },
    {
      key: 'processedAt',
      header: '处理时间',
      cell: (row) => (
        <div>
          <p className="text-xs">{row.processedAt ? formatTime(row.processedAt) : '未处理'}</p>
          <p className="text-muted-foreground text-[10px]">{formatTime(row.updatedAt)}</p>
        </div>
      ),
    },
    {
      key: 'payload',
      header: 'Payload',
      cell: (row) => <JsonViewer data={row.payload} label="payload" />,
    },
  ];

  return (
    <div>
      <SectionHeader sectionKey="observability" />
      <div className="p-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'events' | 'webhooks')}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="events">事件流 ({totalEvents})</TabsTrigger>
            <TabsTrigger value="webhooks">支付回调 ({totalWebhooks})</TabsTrigger>
          </TabsList>

          <TabsContent value="events">
            <div className="mb-4">
              <FilterChipBar
                searchValue={eventsTable.search}
                onSearchChange={eventsTable.setSearch}
                searchPlaceholder="搜索事件名、用户、安装 ID、应用..."
              />
            </div>
            <div className="border-border overflow-hidden rounded-lg border bg-white">
              <DataTable
                columns={eventColumns}
                data={events}
                isLoading={eventsQuery.isLoading}
                emptyMessage="暂无事件记录"
                getRowId={(row) => row.id}
              />
            </div>
            <div className="mt-4">
              <PaginationBar
                total={totalEvents}
                page={eventsTable.page}
                pageSize={PAGE_SIZE}
                isLoading={eventsQuery.isLoading}
                itemLabel="条事件"
                onPageChange={eventsTable.setPage}
              />
            </div>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="mb-4">
              <FilterChipBar
                searchValue={webhooksTable.search}
                onSearchChange={webhooksTable.setSearch}
                searchPlaceholder="搜索回调类型、渠道、事件号..."
              />
            </div>
            <div className="border-border overflow-hidden rounded-lg border bg-white">
              <DataTable
                columns={webhookColumns}
                data={webhooks}
                isLoading={webhooksQuery.isLoading}
                emptyMessage="暂无支付回调记录"
                getRowId={(row) => row.id}
              />
            </div>
            <div className="mt-4">
              <PaginationBar
                total={totalWebhooks}
                page={webhooksTable.page}
                pageSize={PAGE_SIZE}
                isLoading={webhooksQuery.isLoading}
                itemLabel="条支付回调"
                onPageChange={webhooksTable.setPage}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
