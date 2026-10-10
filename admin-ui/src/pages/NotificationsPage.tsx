import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo } from 'react';
import {
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Statistic,
  Table,
  type TableColumnsType,
} from 'antd';
import { listAdminNotifications, publishAnnouncement } from '@/api/admin';
import type { AdminNotificationItem } from '@/api/types';
import { PageContainer, PageToolbar } from '@/components/admin/PageContainer';
import { StatusTag } from '@/components/admin/StatusTag';
import { AsyncState } from '@/components/admin/AsyncState';
import { useTableState } from '@/hooks/useTableState';
import { notificationLevelLabel, notificationStatusLabel } from '@/lib/portal-labels';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

function categoryLabel(category: AdminNotificationItem['category']) {
  switch (category) {
    case 'account':
      return '账户';
    case 'announcement':
      return '公告';
    case 'billing':
      return '账单';
    case 'deployment':
      return '部署';
    case 'ticket':
      return '工单';
    case 'license':
      return '授权';
    case 'system':
    default:
      return '系统';
  }
}

function categoryTone(category: AdminNotificationItem['category']) {
  if (category === 'announcement') return 'info' as const;
  if (category === 'billing' || category === 'license') return 'ok' as const;
  if (category === 'deployment') return 'warn' as const;
  if (category === 'ticket') return 'warn' as const;
  return 'neutral' as const;
}

function levelTone(level: AdminNotificationItem['level']) {
  if (level === 'success') return 'ok' as const;
  if (level === 'warning') return 'warn' as const;
  if (level === 'error') return 'danger' as const;
  return 'info' as const;
}

function statusTone(status: AdminNotificationItem['status']) {
  if (status === 'unread') return 'warn' as const;
  if (status === 'read') return 'ok' as const;
  return 'neutral' as const;
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<AnnouncementValues>();
  const [modal, contextHolder] = Modal.useModal();
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: PAGE_SIZE,
    knownFilters: ['status', 'category'],
  });
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);
  const categoryValues = useMemo(() => filters.category ?? [], [filters.category]);
  const deferredSearch = useDeferredValue(search);

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      status: statusValues[0] as 'unread' | 'read' | 'archived' | undefined,
      category: categoryValues[0] as AdminNotificationItem['category'] | undefined,
    }),
    [categoryValues, deferredSearch, page, statusValues],
  );

  const notificationsQuery = useQuery({
    queryKey: ['admin-notifications', query],
    queryFn: () => listAdminNotifications(query),
  });

  const publishMutation = useMutation({
    mutationFn: publishAnnouncement,
    onSuccess: async (result) => {
      void message.success(`公告已发布，已发送给 ${result.recipientCount} 位活跃用户`);
      form.resetFields();
      await qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
    onError: (error) => void message.error(error instanceof Error ? error.message : '发布公告失败'),
  });

  const items = notificationsQuery.data?.items ?? [];
  const total = notificationsQuery.data?.total ?? 0;

  const columns: TableColumnsType<AdminNotificationItem> = [
    {
      key: 'content',
      title: '通知内容',
      className: 'min-w-[320px]',
      render: (_, row) => (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">{row.title}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{row.body}</p>
          {typeof row.meta?.broadcastId === 'string' ? (
            <p className="font-mono text-[10px] text-muted-foreground">
              广播 ID: {row.meta.broadcastId}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'user',
      title: '接收用户',
      render: (_, row) => (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{row.user?.email ?? '—'}</p>
          {row.user?.displayName ? (
            <p className="text-xs text-muted-foreground">{row.user.displayName}</p>
          ) : null}
          {row.user?.status ? (
            <StatusTag
              tone={row.user.status === 'active' ? 'ok' : 'warn'}
              label={row.user.status === 'active' ? '活跃' : row.user.status}
              className="mt-1"
            />
          ) : null}
        </div>
      ),
    },
    {
      key: 'meta',
      title: '分类 / 级别',
      render: (_, row) => (
        <div className="space-y-1.5">
          <StatusTag tone={categoryTone(row.category)} label={categoryLabel(row.category)} />
          <StatusTag tone={levelTone(row.level)} label={notificationLevelLabel(row.level)} />
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <div className="space-y-1">
          <StatusTag tone={statusTone(row.status)} label={notificationStatusLabel(row.status)} />
          <p className="text-[11px] text-muted-foreground">{row.sourceEventName ?? '手动发布'}</p>
        </div>
      ),
    },
    {
      key: 'time',
      title: '时间',
      render: (_, row) => (
        <div className="space-y-1">
          <p className="text-xs text-foreground">{formatTime(row.createdAt)}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.readAt ? `已读：${formatTime(row.readAt)}` : '未读'}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.ctaLabel && row.ctaUrl ? (
            <Button
              size="small"
              href={row.ctaUrl}
              target={row.ctaUrl.startsWith('/') ? undefined : '_blank'}
              rel="noreferrer"
            >
              {row.ctaLabel}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">无 CTA</span>
          )}
        </div>
      ),
    },
  ];

  const publish = async (values: AnnouncementValues) => {
    const confirmed = await modal.confirm({
      title: '发布站内公告？',
      content: '公告将发送给所有活跃用户，发布后无法撤回。',
      okText: '确认发布',
      cancelText: '取消',
    });
    if (!confirmed) return;
    publishMutation.mutate({
      title: values.title.trim(),
      body: values.body.trim(),
      level: values.level,
      ctaLabel: values.ctaLabel?.trim() || undefined,
      ctaUrl: values.ctaUrl?.trim() || undefined,
    });
  };
  return (
    <PageContainer title="通知管理">
      {contextHolder}
      <Flex wrap gap={16} style={{ marginBottom: 16 }}>
        <Card title="发布公告" style={{ flex: '1 1 400px' }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ level: 'info' }}
            disabled={publishMutation.isPending}
            onFinish={(values) => {
              void publish(values);
            }}
          >
            <Form.Item
              name="title"
              label="公告标题"
              rules={[
                { required: true, whitespace: true, message: '请输入公告标题' },
                { max: 200 },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="body"
              label="公告正文"
              rules={[{ required: true, whitespace: true, message: '请输入公告正文' }]}
            >
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="level" label="通知级别" rules={[{ required: true }]}>
              <Select
                options={['info', 'success', 'warning', 'error'].map((value) => ({
                  value,
                  label: notificationLevelLabel(value as AdminNotificationItem['level']),
                }))}
              />
            </Form.Item>
            <Form.Item name="ctaLabel" label="操作文案">
              <Input placeholder="例如：查看详情" />
            </Form.Item>
            <Form.Item
              name="ctaUrl"
              label="操作链接"
              rules={[
                {
                  validator: (_, value: string | undefined) =>
                    !value || /^\/(?!\/)/.test(value) || /^https?:\/\//.test(value)
                      ? Promise.resolve()
                      : Promise.reject(new Error('请输入站内路径或 HTTP(S) 链接')),
                },
              ]}
            >
              <Input placeholder="/docs 或 https://…" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={publishMutation.isPending}>
              发布站内公告
            </Button>
          </Form>
        </Card>
        <Flex wrap gap={16} style={{ flex: '1 1 360px', alignContent: 'flex-start' }}>
          <Card>
            <Statistic title="当前筛选结果" value={total} />
          </Card>
          <Card>
            <Statistic
              title="当前页未读"
              value={items.filter((item) => item.status === 'unread').length}
            />
          </Card>
          <Card>
            <Statistic
              title="当前页公告"
              value={items.filter((item) => item.category === 'announcement').length}
            />
          </Card>
        </Flex>
      </Flex>
      <PageToolbar
        filters={
          <>
            <Input.Search
              aria-label="搜索通知"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题、正文、用户邮箱…"
              allowClear
              style={{ width: 320, maxWidth: '100%' }}
            />
            <Select
              aria-label="通知分类"
              placeholder="全部分类"
              allowClear
              value={categoryValues[0]}
              onChange={(value) => setFilter('category', value ? [value] : [])}
              style={{ width: 140 }}
              options={[
                'announcement',
                'account',
                'billing',
                'license',
                'deployment',
                'ticket',
                'system',
              ].map((value) => ({
                value,
                label: categoryLabel(value as AdminNotificationItem['category']),
              }))}
            />
            <Select
              aria-label="通知状态"
              placeholder="全部状态"
              allowClear
              value={statusValues[0]}
              onChange={(value) => setFilter('status', value ? [value] : [])}
              style={{ width: 140 }}
              options={['unread', 'read', 'archived'].map((value) => ({
                value,
                label: notificationStatusLabel(value as AdminNotificationItem['status']),
              }))}
            />
            <Button onClick={clearFilters}>清除筛选</Button>
          </>
        }
      />
      <AsyncState
        error={notificationsQuery.error}
        onRetry={() => void notificationsQuery.refetch()}
      >
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={notificationsQuery.isLoading}
          scroll={{ x: 1000 }}
          locale={{ emptyText: '暂无通知记录' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: setPage,
            showTotal: (value) => `共 ${value} 条通知`,
          }}
        />
      </AsyncState>
    </PageContainer>
  );
}
type AnnouncementValues = {
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  ctaLabel?: string;
  ctaUrl?: string;
};
