import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { listBillingWebhooks, listEvents } from '@/api/admin';
import type { BillingWebhookEvent, HydratedEvent } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

export function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState<'events' | 'webhooks'>('events');
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const [webhookSearchQuery, setWebhookSearchQuery] = useState('');
  const [webhookPage, setWebhookPage] = useState(1);
  const deferredEventSearch = useDeferredValue(eventSearchQuery);
  const deferredWebhookSearch = useDeferredValue(webhookSearchQuery);
  const eventQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (eventPage - 1) * PAGE_SIZE,
      search: deferredEventSearch.trim() || undefined
    }),
    [deferredEventSearch, eventPage]
  );
  const webhookQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (webhookPage - 1) * PAGE_SIZE,
      search: deferredWebhookSearch.trim() || undefined
    }),
    [deferredWebhookSearch, webhookPage]
  );

  const eventsQuery = useQuery({
    queryKey: ['events', eventQuery],
    queryFn: () => listEvents(eventQuery)
  });
  const webhooksQuery = useQuery({
    queryKey: ['billing-webhooks', webhookQuery],
    queryFn: () => listBillingWebhooks(webhookQuery)
  });

  useEffect(() => {
    setEventPage(1);
  }, [deferredEventSearch]);

  useEffect(() => {
    setWebhookPage(1);
  }, [deferredWebhookSearch]);

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
          <p className="text-xs font-bold font-mono">{row.eventName}</p>
          {row.app && <p className="text-[10px] text-muted-foreground">{row.app.code}</p>}
          {row.install && <p className="text-[10px] text-muted-foreground font-mono">{row.install.extensionInstallId}</p>}
        </div>
      )
    },
    {
      key: 'time',
      header: '时间',
      cell: (row) => (
        <div>
          <p className="text-xs">{formatTime(row.eventTime)}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      )
    },
    {
      key: 'user',
      header: '用户/应用',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? '—'}</p>
          {row.app && <p className="text-[10px] text-muted-foreground font-mono">{row.app.code}</p>}
          {row.user?.displayName && <p className="text-[10px] text-muted-foreground">{row.user.displayName}</p>}
        </div>
      )
    },
    {
      key: 'context',
      header: 'Context',
      cell: (row) => (
        <div className="text-[10px] text-muted-foreground font-mono space-y-0.5">
          {row.installId && <p className="truncate max-w-[100px]">install: {row.installId}</p>}
          {row.appId && <p className="truncate max-w-[100px]">app: {row.appId}</p>}
        </div>
      )
    },
    {
      key: 'payload',
      header: 'Payload',
      cell: (row) => <JsonViewer data={row.properties} label="props" />
    }
  ];

  const webhookColumns: Column<BillingWebhookEvent>[] = [
    {
      key: 'event',
      header: '回调',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold font-mono">{row.provider} / {row.type}</p>
          <StatusPill tone="neutral" label={row.provider} className="mt-1" />
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
      key: 'eventId',
      header: '事件号',
      cell: (row) => (
        <div>
          <p className="text-xs font-mono truncate max-w-[140px]">{row.providerEventId}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.id}</p>
        </div>
      )
    },
    {
      key: 'processedAt',
      header: '处理时间',
      cell: (row) => (
        <div>
          <p className="text-xs">{row.processedAt ? formatTime(row.processedAt) : '未处理'}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</p>
        </div>
      )
    },
    {
      key: 'payload',
      header: 'Payload',
      cell: (row) => <JsonViewer data={row.payload} label="payload" />
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="observability" />
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'events' | 'webhooks')}>
          <TabsList className="mb-4">
            <TabsTrigger value="events">事件流 ({totalEvents})</TabsTrigger>
            <TabsTrigger value="webhooks">支付回调 ({totalWebhooks})</TabsTrigger>
          </TabsList>

          <TabsContent value="events">
            <div className="mb-4">
              <FilterBar
                searchValue={eventSearchQuery}
                onSearchChange={setEventSearchQuery}
                searchPlaceholder="搜索事件名、用户、安装 ID、应用..."
              />
            </div>
            <div className="rounded-2xl border border-border bg-white overflow-hidden">
              <DataTable
                columns={eventColumns}
                data={events}
                isLoading={eventsQuery.isLoading}
                emptyMessage="暂无事件记录"
                getRowKey={(row) => row.id}
              />
            </div>
            <div className="mt-4">
              <PaginationBar
                total={totalEvents}
                page={eventPage}
                pageSize={PAGE_SIZE}
                isLoading={eventsQuery.isLoading}
                itemLabel="条事件"
                onPageChange={setEventPage}
              />
            </div>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="mb-4">
              <FilterBar
                searchValue={webhookSearchQuery}
                onSearchChange={setWebhookSearchQuery}
                searchPlaceholder="搜索回调类型、渠道、事件号..."
              />
            </div>
            <div className="rounded-2xl border border-border bg-white overflow-hidden">
              <DataTable
                columns={webhookColumns}
                data={webhooks}
                isLoading={webhooksQuery.isLoading}
                emptyMessage="暂无支付回调记录"
                getRowKey={(row) => row.id}
              />
            </div>
            <div className="mt-4">
              <PaginationBar
                total={totalWebhooks}
                page={webhookPage}
                pageSize={PAGE_SIZE}
                isLoading={webhooksQuery.isLoading}
                itemLabel="条支付回调"
                onPageChange={setWebhookPage}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
