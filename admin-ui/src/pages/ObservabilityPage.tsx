import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getObservabilitySummary,
  listAuditLogs,
  listBillingWebhooks,
  listEvents,
  listJobRuns,
  retryJobRun,
} from '@/api/admin';
import type {
  AuditLog,
  BillingWebhookEvent,
  HydratedEvent,
  JobRun,
  ObservabilityAlert,
} from '@/api/types';
import { EmptyState } from '@/components/portal/EmptyState';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar } from '@/components/shared/FilterChipBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTableState } from '@/hooks/useTableState';
import { toastErr, toastOk } from '@/lib/toast';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

function jobStatusTone(status: JobRun['status']) {
  if (status === 'succeeded') return 'ok';
  if (status === 'pending' || status === 'running') return 'warn';
  if (status === 'failed' || status === 'dead') return 'danger';
  return 'neutral';
}

function auditOutcomeTone(outcome: AuditLog['outcome']) {
  return outcome === 'succeeded' ? 'ok' : 'danger';
}

function alertTone(level: ObservabilityAlert['level']) {
  if (level === 'error') return 'danger';
  if (level === 'warning') return 'warn';
  return 'info';
}

export function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState<'alerts' | 'events' | 'webhooks' | 'jobs' | 'audits'>(
    'alerts',
  );
  const qc = useQueryClient();

  const eventsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'events' });
  const webhooksTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'webhooks' });
  const jobsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'jobs' });
  const auditsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'audits' });
  const deferredEventSearch = useDeferredValue(eventsTable.search);
  const deferredWebhookSearch = useDeferredValue(webhooksTable.search);
  const deferredJobSearch = useDeferredValue(jobsTable.search);
  const deferredAuditSearch = useDeferredValue(auditsTable.search);

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
  const jobsQueryInput = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (jobsTable.page - 1) * PAGE_SIZE,
      search: deferredJobSearch.trim() || undefined,
    }),
    [deferredJobSearch, jobsTable.page],
  );
  const auditsQueryInput = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (auditsTable.page - 1) * PAGE_SIZE,
      search: deferredAuditSearch.trim() || undefined,
    }),
    [deferredAuditSearch, auditsTable.page],
  );

  const summaryQuery = useQuery({
    queryKey: ['observability-summary'],
    queryFn: getObservabilitySummary,
    refetchInterval: 30_000,
  });
  const eventsQuery = useQuery({
    queryKey: ['events', eventQuery],
    queryFn: () => listEvents(eventQuery),
  });
  const webhooksQuery = useQuery({
    queryKey: ['billing-webhooks', webhookQuery],
    queryFn: () => listBillingWebhooks(webhookQuery),
  });
  const jobsQuery = useQuery({
    queryKey: ['job-runs', jobsQueryInput],
    queryFn: () => listJobRuns(jobsQueryInput),
  });
  const auditsQuery = useQuery({
    queryKey: ['audit-logs', auditsQueryInput],
    queryFn: () => listAuditLogs(auditsQueryInput),
  });

  const retryMutation = useMutation({
    mutationFn: retryJobRun,
    onSuccess: () => {
      toastOk('任务已重新入队');
      void qc.invalidateQueries({ queryKey: ['job-runs'] });
      void qc.invalidateQueries({ queryKey: ['observability-summary'] });
    },
    onError: (error) => toastErr(error, '任务重试失败'),
  });

  const summary = summaryQuery.data;
  const events = eventsQuery.data?.items ?? [];
  const webhooks = webhooksQuery.data?.items ?? [];
  const jobs = jobsQuery.data?.items ?? [];
  const audits = auditsQuery.data?.items ?? [];
  const totalEvents = eventsQuery.data?.total ?? 0;
  const totalWebhooks = webhooksQuery.data?.total ?? 0;
  const totalJobs = jobsQuery.data?.total ?? 0;
  const totalAudits = auditsQuery.data?.total ?? 0;

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

  const jobColumns: Column<JobRun>[] = [
    {
      key: 'kind',
      header: '任务',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.kind}</p>
          <p className="text-muted-foreground text-[10px]">queue: {row.queue}</p>
          {row.relatedEntityType && row.relatedEntityId ? (
            <p className="text-muted-foreground text-[10px]">
              {row.relatedEntityType}: {row.relatedEntityId}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="space-y-1">
          <StatusPill tone={jobStatusTone(row.status)} label={row.status} />
          <p className="text-muted-foreground text-[10px]">
            attempts {row.attempts} / {row.maxAttempts}
          </p>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: '时间',
      cell: (row) => (
        <div className="space-y-0.5 text-[10px]">
          <p>created: {formatTime(row.createdAt)}</p>
          <p className="text-muted-foreground">
            next:{' '}
            {row.status === 'pending' || row.status === 'failed'
              ? formatTime(row.availableAt)
              : '—'}
          </p>
          <p className="text-muted-foreground">
            done: {row.finishedAt ? formatTime(row.finishedAt) : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'owner',
      header: '来源',
      cell: (row) => (
        <div className="space-y-0.5 text-[10px]">
          <p className="font-mono">{row.createdByUserId ?? 'system'}</p>
          <p className="text-muted-foreground">worker: {row.lockedBy ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'payload',
      header: 'Payload',
      cell: (row) => (
        <JsonViewer
          data={{
            payload: row.payload,
            result: row.result,
            error: row.error,
          }}
          label="job"
        />
      ),
    },
    {
      key: 'actions',
      header: '操作',
      className: 'w-[120px]',
      cell: (row) =>
        row.status === 'failed' || row.status === 'dead' ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={retryMutation.isPending && retryMutation.variables === row.id}
            onClick={() => retryMutation.mutate(row.id)}
          >
            {retryMutation.isPending && retryMutation.variables === row.id ? '重试中' : '重试'}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
  ];

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'action',
      header: '动作',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.action}</p>
          <p className="text-muted-foreground text-[10px]">
            {row.resourceType}
            {row.resourceId ? ` / ${row.resourceId}` : ''}
          </p>
          {row.summary ? <p className="text-muted-foreground text-[10px]">{row.summary}</p> : null}
        </div>
      ),
    },
    {
      key: 'actor',
      header: '执行者',
      cell: (row) => (
        <div>
          <StatusPill tone={row.actorType === 'job' ? 'info' : 'neutral'} label={row.actorType} />
          <p className="mt-1 font-mono text-[10px]">
            {row.actorUserId ?? row.actorLabel ?? 'system'}
          </p>
        </div>
      ),
    },
    {
      key: 'outcome',
      header: '结果',
      cell: (row) => (
        <div className="space-y-1">
          <StatusPill tone={auditOutcomeTone(row.outcome)} label={row.outcome} />
          <p className="text-muted-foreground text-[10px]">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'request',
      header: '请求',
      cell: (row) => (
        <div className="space-y-0.5 text-[10px]">
          <p className="font-mono">{row.requestId ?? '—'}</p>
          <p className="text-muted-foreground">{row.ipAddress ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'meta',
      header: 'Meta',
      cell: (row) => <JsonViewer data={row.meta} label="meta" />,
    },
  ];

  const alertColumns: Column<ObservabilityAlert>[] = [
    {
      key: 'title',
      header: '告警',
      cell: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <StatusPill tone={alertTone(row.level)} label={row.level} />
            <p className="text-sm font-semibold">{row.title}</p>
          </div>
          <p className="text-muted-foreground mt-1 text-[12px] leading-6">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'count',
      header: '数量',
      cell: (row) => <span className="font-mono text-sm font-semibold">{row.count}</span>,
    },
    {
      key: 'link',
      header: '跳转',
      className: 'w-[120px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={row.href}>查看</Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader sectionKey="observability" />
      <div className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="死信任务"
            value={summary?.metrics.deadJobs ?? 0}
            note="已耗尽重试次数"
            tone={(summary?.metrics.deadJobs ?? 0) > 0 ? 'danger' : 'ok'}
          />
          <MetricCard
            title="待处理回调"
            value={summary?.metrics.unprocessedWebhooks ?? 0}
            note="支付回调未处理"
            tone={(summary?.metrics.unprocessedWebhooks ?? 0) > 0 ? 'warn' : 'ok'}
          />
          <MetricCard
            title="待支付订单"
            value={summary?.metrics.pendingOrders ?? 0}
            note={`超时 ${summary?.metrics.stalePendingOrders ?? 0}`}
            tone={(summary?.metrics.stalePendingOrders ?? 0) > 0 ? 'warn' : 'neutral'}
          />
          <MetricCard
            title="24h 事件"
            value={summary?.metrics.events24h ?? 0}
            note={`客服待处理 ${summary?.metrics.waitingStaffTickets ?? 0}`}
            tone="info"
          />
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as 'alerts' | 'events' | 'webhooks' | 'jobs' | 'audits')
          }
        >
          <TabsList className="mb-4">
            <TabsTrigger value="alerts">告警 ({summary?.alerts.length ?? 0})</TabsTrigger>
            <TabsTrigger value="events">事件流 ({totalEvents})</TabsTrigger>
            <TabsTrigger value="webhooks">支付回调 ({totalWebhooks})</TabsTrigger>
            <TabsTrigger value="jobs">任务队列 ({totalJobs})</TabsTrigger>
            <TabsTrigger value="audits">审计日志 ({totalAudits})</TabsTrigger>
          </TabsList>

          <TabsContent value="alerts">
            <div className="border-border bg-card overflow-hidden rounded-lg border">
              {summaryQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="bg-muted h-12 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : summary && summary.alerts.length > 0 ? (
                <DataTable
                  columns={alertColumns}
                  data={summary.alerts}
                  isLoading={false}
                  emptyMessage="暂无告警"
                  getRowId={(row) => row.id}
                />
              ) : (
                <EmptyState
                  icon={CheckCircle2}
                  title="当前没有活跃告警"
                  description="订单、回调、任务和工单都处于正常范围内。"
                  className="py-14"
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events">
            <div className="mb-4">
              <FilterChipBar
                searchValue={eventsTable.search}
                onSearchChange={eventsTable.setSearch}
                searchPlaceholder="搜索事件名、用户、安装 ID、应用..."
              />
            </div>
            <div className="border-border bg-card overflow-hidden rounded-lg border">
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
            <div className="border-border bg-card overflow-hidden rounded-lg border">
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

          <TabsContent value="jobs">
            <div className="mb-4">
              <FilterChipBar
                searchValue={jobsTable.search}
                onSearchChange={jobsTable.setSearch}
                searchPlaceholder="搜索任务类型、状态、实体 ID、worker..."
              />
            </div>
            <div className="border-border bg-card overflow-hidden rounded-lg border">
              <DataTable
                columns={jobColumns}
                data={jobs}
                isLoading={jobsQuery.isLoading}
                emptyMessage="暂无任务记录"
                getRowId={(row) => row.id}
              />
            </div>
            <div className="mt-4">
              <PaginationBar
                total={totalJobs}
                page={jobsTable.page}
                pageSize={PAGE_SIZE}
                isLoading={jobsQuery.isLoading}
                itemLabel="条任务"
                onPageChange={jobsTable.setPage}
              />
            </div>
          </TabsContent>

          <TabsContent value="audits">
            <div className="mb-4">
              <FilterChipBar
                searchValue={auditsTable.search}
                onSearchChange={auditsTable.setSearch}
                searchPlaceholder="搜索动作、资源、摘要、操作人..."
              />
            </div>
            <div className="border-border bg-card overflow-hidden rounded-lg border">
              <DataTable
                columns={auditColumns}
                data={audits}
                isLoading={auditsQuery.isLoading}
                emptyMessage="暂无审计日志"
                getRowId={(row) => row.id}
              />
            </div>
            <div className="mt-4">
              <PaginationBar
                total={totalAudits}
                page={auditsTable.page}
                pageSize={PAGE_SIZE}
                isLoading={auditsQuery.isLoading}
                itemLabel="条审计"
                onPageChange={auditsTable.setPage}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
  tone,
}: {
  title: string;
  value: number;
  note: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info';
}) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warn' ? AlertTriangle : BellRing;
  return (
    <div className="border-border bg-card rounded-lg border px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.08em]">
            {title}
          </p>
          <p className="text-foreground mt-2 font-mono text-2xl font-semibold">{value}</p>
          <p className="text-muted-foreground mt-2 text-xs">{note}</p>
        </div>
        <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
          <Icon className="text-muted-foreground h-5 w-5" />
        </div>
      </div>
      <div className="mt-3">
        <StatusPill
          tone={tone}
          label={tone === 'danger' ? '需处理' : tone === 'warn' ? '关注' : '正常'}
        />
      </div>
    </div>
  );
}
