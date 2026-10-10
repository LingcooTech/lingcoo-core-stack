import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, ShieldAlert } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getObservabilitySummary,
  listAuditLogs,
  listBillingWebhooks,
  listEvents,
  listJobRuns,
  retryJobRun,
} from '@/api/admin';
import {
  clearAlertingSettings,
  getAlertingSettings,
  type AlertingSettingsInput,
  upsertAlertingSettings,
} from '@/api/settings';
import type {
  AuditLog,
  BillingWebhookEvent,
  HydratedEvent,
  JobRun,
  ObservabilityAlert,
} from '@/api/types';
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Select,
  Statistic,
  Table,
  Tabs,
  type TableColumnsType,
} from 'antd';
import { AlertingSettingsInputSchema } from '@lingcoo/contracts';
import { PageContainer, PageToolbar, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { JsonViewer } from '@/components/admin/JsonViewer';
import { StatusTag, statusToTone } from '@/components/admin/StatusTag';
import { useTableState } from '@/hooks/useTableState';
import { useAuth } from '@/lib/auth';
import { operationStatusLabel, paymentProviderLabel } from '@/lib/portal-labels';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;
type ObservabilityTab = 'alerts' | 'events' | 'webhooks' | 'jobs' | 'audits';

function parseObservabilityTab(value: string | null): ObservabilityTab {
  if (value === 'events' || value === 'webhooks' || value === 'jobs' || value === 'audits') {
    return value;
  }
  return 'alerts';
}

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

function sourceLabel(source: 'database' | 'env' | 'none') {
  if (source === 'database') return '后台';
  if (source === 'env') return '环境变量';
  return '无';
}

export function ObservabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ObservabilityTab>(() =>
    parseObservabilityTab(searchParams.get('tab')),
  );
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const toastOk = (title: string) => {
    void message.success(title);
  };
  const toastErr = (error: unknown, title: string) => {
    void message.error(error instanceof Error ? `${title}：${error.message}` : title);
  };
  const [form] = Form.useForm<AlertDraft>();
  const { user } = useAuth();
  const canManageSettings = hasPermission(normalizeRole(user?.role), 'settings.manage');
  const canManageJobs = hasPermission(normalizeRole(user?.role), 'jobs.manage');
  const eventsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'events' });
  const webhooksTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'webhooks' });
  const jobsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'jobs' });
  const auditsTable = useTableState({ defaultPageSize: PAGE_SIZE, prefix: 'audits' });
  const deferredEventSearch = useDeferredValue(eventsTable.search);
  const deferredWebhookSearch = useDeferredValue(webhooksTable.search);
  const deferredJobSearch = useDeferredValue(jobsTable.search);
  const deferredAuditSearch = useDeferredValue(auditsTable.search);

  useEffect(() => {
    const nextTab = parseObservabilityTab(searchParams.get('tab'));
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  function handleTabChange(value: string) {
    const nextTab = parseObservabilityTab(value);
    setActiveTab(nextTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextTab === 'alerts') next.delete('tab');
        else next.set('tab', nextTab);
        return next;
      },
      { replace: true },
    );
  }

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
  const alertingSettingsQuery = useQuery({
    queryKey: ['system-settings', 'alerting'],
    queryFn: getAlertingSettings,
    enabled: canManageSettings,
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

  const saveAlertingMutation = useMutation({
    mutationFn: (payload: AlertingSettingsInput) => upsertAlertingSettings(payload),
    onSuccess: (result) => {
      toastOk('告警外发设置已保存');
      form.resetFields();
      qc.setQueryData(['system-settings', 'alerting'], result);
    },
    onError: (error) => toastErr(error, '告警外发设置保存失败'),
  });

  const clearAlertingMutation = useMutation({
    mutationFn: clearAlertingSettings,
    onSuccess: async () => {
      toastOk('告警外发设置已清除');
      form.resetFields();
      await qc.invalidateQueries({ queryKey: ['system-settings', 'alerting'] });
    },
    onError: (error) => toastErr(error, '告警外发设置清除失败'),
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

  useEffect(() => {
    const settings = alertingSettingsQuery.data;
    if (!settings) {
      return;
    }

    if (!form.isFieldsTouched()) {
      form.setFieldsValue({
        enabled: settings.values.enabled,
        minimumLevel: settings.values.minimumLevel,
        cooldownMinutes: settings.values.cooldownMinutes,
        emailEnabled: settings.values.email.enabled,
        recipients: settings.values.email.recipients.join('\n'),
        webhookEnabled: settings.values.webhook.enabled,
        url: settings.values.webhook.url,
        secret: '',
      });
      form.setFields(
        (Object.keys(form.getFieldsValue()) as Array<keyof AlertDraft>).map((name) => ({
          name,
          touched: false,
        })),
      );
    }
  }, [alertingSettingsQuery.data, form]);

  const saveAlertingSettings = (values: AlertDraft) => {
    const payload = AlertingSettingsInputSchema.parse({
      enabled: values.enabled,
      minimumLevel: values.minimumLevel,
      cooldownMinutes: values.cooldownMinutes,
      email: {
        enabled: values.emailEnabled,
        recipients: values.recipients
          .split(/[,\n;]/)
          .map((item) => item.trim())
          .filter(Boolean),
      },
      webhook: {
        enabled: values.webhookEnabled,
        url: values.url?.trim() || undefined,
        secret: values.secret?.trim() || undefined,
      },
    });
    saveAlertingMutation.mutate(payload);
  };

  const eventColumns: TableColumnsType<HydratedEvent> = [
    {
      key: 'event',
      title: '事件',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.eventName}</p>
          {row.app && <p className="text-[10px] text-muted-foreground">{row.app.code}</p>}
          {row.install && (
            <p className="font-mono text-[10px] text-muted-foreground">
              {row.install.extensionInstallId}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'time',
      title: '时间',
      render: (_, row) => (
        <div>
          <p className="text-xs">{formatTime(row.eventTime)}</p>
        </div>
      ),
    },
    {
      key: 'user',
      title: '用户/应用',
      render: (_, row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? '—'}</p>
          {row.app && <p className="font-mono text-[10px] text-muted-foreground">{row.app.code}</p>}
          {row.user?.displayName && (
            <p className="text-[10px] text-muted-foreground">{row.user.displayName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'context',
      title: 'Context',
      render: (_, row) => (
        <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
          {row.installId && <p className="max-w-[100px] truncate">install: {row.installId}</p>}
          {row.appId && <p className="max-w-[100px] truncate">app: {row.appId}</p>}
        </div>
      ),
    },
    {
      key: 'payload',
      title: 'Payload',
      render: (_, row) => <JsonViewer data={row.properties} label="props" />,
    },
  ];

  const webhookColumns: TableColumnsType<BillingWebhookEvent> = [
    {
      key: 'event',
      title: '回调',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs font-bold">
            {paymentProviderLabel(row.provider)} / {row.type}
          </p>
          <StatusTag tone="neutral" label={paymentProviderLabel(row.provider)} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <div className="flex flex-col gap-1">
          <StatusTag tone={statusToTone(row.status)} label={operationStatusLabel(row.status)} />
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'eventId',
      title: '事件号',
      render: (_, row) => (
        <div>
          <p className="max-w-[140px] truncate font-mono text-xs">{row.providerEventId}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{row.id}</p>
        </div>
      ),
    },
    {
      key: 'processedAt',
      title: '处理时间',
      render: (_, row) => (
        <div>
          <p className="text-xs">{row.processedAt ? formatTime(row.processedAt) : '未处理'}</p>
        </div>
      ),
    },
    {
      key: 'payload',
      title: 'Payload',
      render: (_, row) => <JsonViewer data={row.payload} label="payload" />,
    },
  ];

  const jobColumns: TableColumnsType<JobRun> = [
    {
      key: 'kind',
      title: '任务',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.kind}</p>
          <p className="text-[10px] text-muted-foreground">队列：{row.queue}</p>
          {row.relatedEntityType && row.relatedEntityId ? (
            <p className="text-[10px] text-muted-foreground">
              {row.relatedEntityType}: {row.relatedEntityId}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <div className="space-y-1">
          <StatusTag tone={jobStatusTone(row.status)} label={operationStatusLabel(row.status)} />
          <p className="text-[10px] text-muted-foreground">
            尝试 {row.attempts} / {row.maxAttempts}
          </p>
        </div>
      ),
    },
    {
      key: 'schedule',
      title: '时间',
      render: (_, row) => (
        <div className="space-y-0.5 text-[10px]">
          <p>创建：{formatTime(row.createdAt)}</p>
          <p className="text-muted-foreground">
            下次执行：{' '}
            {row.status === 'pending' || row.status === 'failed'
              ? formatTime(row.availableAt)
              : '—'}
          </p>
          <p className="text-muted-foreground">
            完成：{row.finishedAt ? formatTime(row.finishedAt) : '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'diagnostics',
      title: '诊断',
      render: (_, row) => <JsonViewer data={row.error} label="诊断摘要" />,
    },
    {
      key: 'actions',
      title: '操作',
      className: 'w-[120px]',
      render: (_, row) =>
        canManageJobs && (row.status === 'failed' || row.status === 'dead') ? (
          <Button
            size="small"
            className="h-7 px-2 text-xs"
            disabled={retryMutation.isPending && retryMutation.variables === row.id}
            onClick={() => retryMutation.mutate(row.id)}
          >
            {retryMutation.isPending && retryMutation.variables === row.id ? '重试中' : '重试'}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  const auditColumns: TableColumnsType<AuditLog> = [
    {
      key: 'action',
      title: '动作',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.action}</p>
          <p className="text-[10px] text-muted-foreground">
            {row.resourceType}
            {row.resourceId ? ` / ${row.resourceId}` : ''}
          </p>
          {row.summary ? <p className="text-[10px] text-muted-foreground">{row.summary}</p> : null}
        </div>
      ),
    },
    {
      key: 'actor',
      title: '执行者',
      render: (_, row) => (
        <div>
          <StatusTag tone={row.actorType === 'job' ? 'info' : 'neutral'} label={row.actorType} />
          <p className="mt-1 font-mono text-[10px]">
            {row.actorUserId ?? row.actorLabel ?? 'system'}
          </p>
        </div>
      ),
    },
    {
      key: 'outcome',
      title: '结果',
      render: (_, row) => (
        <div className="space-y-1">
          <StatusTag tone={auditOutcomeTone(row.outcome)} label={row.outcome} />
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'request',
      title: '请求',
      render: (_, row) => (
        <div className="space-y-0.5 text-[10px]">
          <p className="font-mono">{row.requestId ?? '—'}</p>
          <p className="text-muted-foreground">{row.ipAddress ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'meta',
      title: 'Meta',
      render: (_, row) => <JsonViewer data={row.meta} label="meta" />,
    },
  ];

  const alertColumns: TableColumnsType<ObservabilityAlert> = [
    {
      key: 'title',
      title: '告警',
      render: (_, row) => (
        <div>
          <div className="flex items-center gap-2">
            <StatusTag tone={alertTone(row.level)} label={row.level} />
            <p className="text-sm font-semibold">{row.title}</p>
          </div>
          <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'count',
      title: '数量',
      render: (_, row) => <span className="font-mono text-sm font-semibold">{row.count}</span>,
    },
    {
      key: 'link',
      title: '跳转',
      className: 'w-[120px]',
      render: (_, row) => <Link to={row.href}>查看</Link>,
    },
  ];

  const alertView = (
    <>
      {canManageSettings && (
        <Card
          title="告警外发"
          style={{ marginBottom: 16 }}
          extra={
            <StatusTag
              tone="info"
              label={`来源：${sourceLabel(alertingSettingsQuery.data?.source ?? 'none')}`}
            />
          }
        >
          <AsyncState
            loading={alertingSettingsQuery.isPending}
            error={alertingSettingsQuery.error}
            onRetry={() => void alertingSettingsQuery.refetch()}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={saveAlertingSettings}
              disabled={saveAlertingMutation.isPending || clearAlertingMutation.isPending}
              initialValues={{
                enabled: false,
                minimumLevel: 'warning',
                cooldownMinutes: 60,
                emailEnabled: false,
                recipients: '',
                webhookEnabled: false,
                url: '',
                secret: '',
              }}
            >
              <Form.Item name="enabled" valuePropName="checked">
                <Checkbox>启用告警外发</Checkbox>
              </Form.Item>
              <div className="admin-form-grid">
                <Form.Item name="minimumLevel" label="最低级别">
                  <Select
                    options={['info', 'warning', 'error'].map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
                <Form.Item
                  name="cooldownMinutes"
                  label="冷却分钟"
                  rules={[
                    { required: true, message: '请输入冷却分钟' },
                    { type: 'integer', min: 5, max: 1440, message: '请输入 5–1440 之间的整数' },
                  ]}
                >
                  <InputNumber min={5} max={1440} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="emailEnabled" valuePropName="checked">
                  <Checkbox>邮件投递</Checkbox>
                </Form.Item>
                <Form.Item name="webhookEnabled" valuePropName="checked">
                  <Checkbox>Webhook 投递</Checkbox>
                </Form.Item>
                <Form.Item
                  name="recipients"
                  label="告警接收邮箱"
                  extra="多个邮箱用逗号、分号或换行分隔。"
                  rules={[
                    {
                      validator: (_, value: string) =>
                        !value ||
                        value
                          .split(/[,\n;]/)
                          .map((item) => item.trim())
                          .filter(Boolean)
                          .every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
                          ? Promise.resolve()
                          : Promise.reject(new Error('请检查接收邮箱格式')),
                    },
                  ]}
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item
                  name="url"
                  label="Webhook URL"
                  rules={[{ type: 'url', message: '请输入完整的 Webhook URL' }]}
                >
                  <Input placeholder="https://example.com/alerts" />
                </Form.Item>
              </div>
              <Form.Item name="secret" label="签名密钥">
                <Input.Password
                  autoComplete="new-password"
                  placeholder={
                    alertingSettingsQuery.data?.secrets.webhookSecret.configured
                      ? '已配置，留空则保留'
                      : '可选'
                  }
                />
              </Form.Item>
              <FormActions hint="Worker 按冷却窗口投递告警；留空保留原签名密钥。">
                <Button
                  danger
                  loading={clearAlertingMutation.isPending}
                  onClick={() => {
                    void modal.confirm({
                      title: '清除告警外发设置？',
                      content: '将清除后台设置并恢复环境配置的生效规则。',
                      okText: '确认清除',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: () => clearAlertingMutation.mutateAsync(),
                    });
                  }}
                >
                  清除设置
                </Button>
                <Button type="primary" htmlType="submit" loading={saveAlertingMutation.isPending}>
                  保存外发设置
                </Button>
              </FormActions>
            </Form>
          </AsyncState>
        </Card>
      )}
      <AsyncState
        loading={summaryQuery.isLoading}
        error={summaryQuery.error}
        onRetry={() => void summaryQuery.refetch()}
      >
        {summary?.alerts.length ? (
          <Table
            columns={alertColumns}
            dataSource={summary.alerts}
            rowKey="id"
            pagination={false}
            scroll={{ x: 700 }}
          />
        ) : (
          <Empty description="当前没有活跃告警" />
        )}
      </AsyncState>
    </>
  );
  return (
    <PageContainer title="事件日志与告警">
      <AsyncState error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()}>
        <Flex wrap gap={16} style={{ marginBottom: 16 }}>
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
        </Flex>
      </AsyncState>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'alerts', label: `告警 (${summary?.alerts.length ?? 0})`, children: alertView },
          {
            key: 'events',
            label: `事件流 (${totalEvents})`,
            children: (
              <>
                <PageToolbar
                  filters={
                    <Input.Search
                      value={eventsTable.search}
                      onChange={(event) => eventsTable.setSearch(event.target.value)}
                      aria-label="搜索事件流"
                      allowClear
                      placeholder="搜索事件名、用户、安装 ID、应用…"
                      style={{ width: 420, maxWidth: '100%' }}
                    />
                  }
                />
                <AsyncState error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()}>
                  <Table
                    columns={eventColumns}
                    dataSource={events}
                    rowKey="id"
                    loading={eventsQuery.isLoading}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: '暂无事件流记录' }}
                    pagination={{
                      current: eventsTable.page,
                      pageSize: PAGE_SIZE,
                      total: totalEvents,
                      showSizeChanger: false,
                      onChange: eventsTable.setPage,
                    }}
                  />
                </AsyncState>
              </>
            ),
          },
          {
            key: 'webhooks',
            label: `支付回调 (${totalWebhooks})`,
            children: (
              <>
                <PageToolbar
                  filters={
                    <Input.Search
                      value={webhooksTable.search}
                      onChange={(event) => webhooksTable.setSearch(event.target.value)}
                      aria-label="搜索支付回调"
                      allowClear
                      placeholder="搜索回调类型、渠道、事件号…"
                      style={{ width: 420, maxWidth: '100%' }}
                    />
                  }
                />
                <AsyncState
                  error={webhooksQuery.error}
                  onRetry={() => void webhooksQuery.refetch()}
                >
                  <Table
                    columns={webhookColumns}
                    dataSource={webhooks}
                    rowKey="id"
                    loading={webhooksQuery.isLoading}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: '暂无支付回调记录' }}
                    pagination={{
                      current: webhooksTable.page,
                      pageSize: PAGE_SIZE,
                      total: totalWebhooks,
                      showSizeChanger: false,
                      onChange: webhooksTable.setPage,
                    }}
                  />
                </AsyncState>
              </>
            ),
          },
          {
            key: 'jobs',
            label: `任务队列 (${totalJobs})`,
            children: (
              <>
                <PageToolbar
                  filters={
                    <Input.Search
                      value={jobsTable.search}
                      onChange={(event) => jobsTable.setSearch(event.target.value)}
                      aria-label="搜索任务队列"
                      allowClear
                      placeholder="搜索任务类型、状态、实体 ID、Worker…"
                      style={{ width: 420, maxWidth: '100%' }}
                    />
                  }
                />
                <AsyncState error={jobsQuery.error} onRetry={() => void jobsQuery.refetch()}>
                  <Table
                    columns={jobColumns}
                    dataSource={jobs}
                    rowKey="id"
                    loading={jobsQuery.isLoading}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: '暂无任务队列记录' }}
                    pagination={{
                      current: jobsTable.page,
                      pageSize: PAGE_SIZE,
                      total: totalJobs,
                      showSizeChanger: false,
                      onChange: jobsTable.setPage,
                    }}
                  />
                </AsyncState>
              </>
            ),
          },
          {
            key: 'audits',
            label: `审计日志 (${totalAudits})`,
            children: (
              <>
                <PageToolbar
                  filters={
                    <Input.Search
                      value={auditsTable.search}
                      onChange={(event) => auditsTable.setSearch(event.target.value)}
                      aria-label="搜索审计日志"
                      allowClear
                      placeholder="搜索动作、资源、摘要、操作人…"
                      style={{ width: 420, maxWidth: '100%' }}
                    />
                  }
                />
                <AsyncState error={auditsQuery.error} onRetry={() => void auditsQuery.refetch()}>
                  <Table
                    columns={auditColumns}
                    dataSource={audits}
                    rowKey="id"
                    loading={auditsQuery.isLoading}
                    scroll={{ x: 900 }}
                    locale={{ emptyText: '暂无审计日志记录' }}
                    pagination={{
                      current: auditsTable.page,
                      pageSize: PAGE_SIZE,
                      total: totalAudits,
                      showSizeChanger: false,
                      onChange: auditsTable.setPage,
                    }}
                  />
                </AsyncState>
              </>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
type AlertDraft = {
  enabled: boolean;
  minimumLevel: 'info' | 'warning' | 'error';
  cooldownMinutes: number;
  emailEnabled: boolean;
  recipients: string;
  webhookEnabled: boolean;
  url: string;
  secret: string;
};

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
    <Card className="admin-metric" style={{ flex: '1 1 220px' }}>
      <Flex justify="space-between">
        <Statistic title={title} value={value} />
        <Icon size={20} />
      </Flex>
      <p className="my-2 text-sm text-muted-foreground">{note}</p>
      <StatusTag
        tone={tone}
        label={tone === 'danger' ? '需处理' : tone === 'warn' ? '关注' : '正常'}
      />
    </Card>
  );
}
