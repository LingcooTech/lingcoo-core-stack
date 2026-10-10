import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Input,
  Select,
  Table,
  Typography,
  type TableColumnsType,
  type FormInstance,
} from 'antd';

import {
  assignAdminTicket,
  getAdminTicket,
  listAdminTickets,
  replyAdminTicket,
  updateAdminTicketStatus,
} from '@/api/admin';
import type { HydratedSupportTicket, SupportTicketDetail, SupportTicketMessage } from '@/api/types';
import { PageContainer } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { StatusTag } from '@/components/admin/StatusTag';
import { useTableState } from '@/hooks/useTableState';
import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

function ticketStatusLabel(status: HydratedSupportTicket['status']) {
  switch (status) {
    case 'waiting_staff':
      return '待处理';
    case 'waiting_user':
      return '待回复';
    case 'resolved':
      return '已解决';
    case 'closed':
    default:
      return '已关闭';
  }
}

function ticketStatusTone(status: HydratedSupportTicket['status']) {
  switch (status) {
    case 'waiting_staff':
      return 'warn' as const;
    case 'waiting_user':
      return 'info' as const;
    case 'resolved':
      return 'ok' as const;
    case 'closed':
    default:
      return 'neutral' as const;
  }
}

function ticketCategoryLabel(category: HydratedSupportTicket['category']) {
  switch (category) {
    case 'account':
      return '账户';
    case 'billing':
      return '账单';
    case 'access':
      return '授权';
    case 'install':
      return '安装';
    case 'deployment':
      return '部署';
    case 'bug':
      return '缺陷';
    case 'feature':
      return '功能';
    case 'other':
    default:
      return '其他';
  }
}

function ticketPriorityLabel(priority: HydratedSupportTicket['priority']) {
  switch (priority) {
    case 'low':
      return '低';
    case 'normal':
      return '普通';
    case 'high':
      return '高';
    case 'urgent':
      return '紧急';
    default:
      return priority;
  }
}

function ticketPriorityTone(priority: HydratedSupportTicket['priority']) {
  switch (priority) {
    case 'urgent':
      return 'danger' as const;
    case 'high':
      return 'warn' as const;
    case 'low':
      return 'neutral' as const;
    case 'normal':
    default:
      return 'info' as const;
  }
}

function messageAuthorLabel(message: SupportTicketMessage) {
  if (message.authorType === 'system') {
    return '系统';
  }

  if (message.authorType === 'admin') {
    return message.author?.displayName?.trim() || message.author?.email || '管理员';
  }

  return message.author?.displayName?.trim() || message.author?.email || '用户';
}

function userDetailHref(userId: string) {
  return `/admin/users?userId=${encodeURIComponent(userId)}`;
}

function MetaField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="admin-detail-field">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text code={mono}>{value || '—'}</Typography.Text>
    </div>
  );
}

function TicketMessageList({ messages }: { messages: SupportTicketMessage[] }) {
  if (messages.length === 0) {
    return <p className="admin-text-secondary text-sm">暂无会话记录。</p>;
  }

  return (
    <div className="admin-detail-stack">
      {messages.map((message) => (
        <Card key={message.id} size="small">
          <Flex wrap gap={8} align="center">
            <Typography.Text strong>{messageAuthorLabel(message)}</Typography.Text>
            <Typography.Text type="secondary">{formatTime(message.createdAt)}</Typography.Text>
            {message.isInternal && <StatusTag tone="neutral" label="内部备注" />}
          </Flex>
          <Typography.Paragraph
            style={{
              marginTop: 12,
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {message.body}
          </Typography.Paragraph>
        </Card>
      ))}
    </div>
  );
}

type TicketDraft = { status: HydratedSupportTicket['status']; body: string; internal: boolean };
function TicketDetailPanel({
  detail,
  form,
  onSaveStatus,
  onReply,
  onAssignToMe,
  onUnassign,
  isSavingStatus,
  isReplying,
  isAssigning,
}: {
  detail: SupportTicketDetail;
  form: FormInstance<TicketDraft>;
  onSaveStatus: () => void;
  onReply: () => void;
  onAssignToMe: () => void;
  onUnassign: () => void;
  isSavingStatus: boolean;
  isReplying: boolean;
  isAssigning: boolean;
}) {
  const { ticket, messages } = detail;
  const statusDraft = Form.useWatch('status', form);
  const internal = Form.useWatch('internal', form);
  return (
    <div className="admin-detail-stack">
      <Card title={ticket.subject} extra={<Link to={userDetailHref(ticket.userId)}>用户 360</Link>}>
        <Flex wrap gap={8} style={{ marginBottom: 16 }}>
          <StatusTag
            tone={ticketStatusTone(ticket.status)}
            label={ticketStatusLabel(ticket.status)}
          />
          <StatusTag
            tone={ticketPriorityTone(ticket.priority)}
            label={ticketPriorityLabel(ticket.priority)}
          />
          <StatusTag tone="neutral" label={ticketCategoryLabel(ticket.category)} />
        </Flex>
        <div className="admin-detail-fields">
          <MetaField label="用户" value={ticket.user?.email ?? '—'} />
          <MetaField label="应用" value={ticket.app?.name ?? '未关联'} />
          <MetaField label="订单号" value={ticket.order?.orderNo ?? '未关联'} mono />
          <MetaField
            label="客户端安装"
            value={ticket.install?.extensionInstallId ?? '未关联'}
            mono
          />
          <MetaField label="部署" value={ticket.deployment?.label ?? '未关联'} />
          <MetaField
            label="当前指派"
            value={ticket.assignee?.displayName ?? ticket.assignee?.email ?? '未分配'}
          />
          <MetaField label="创建时间" value={formatTime(ticket.createdAt)} />
          <MetaField label="最近活动" value={formatTime(ticket.lastActivityAt)} />
        </div>
      </Card>
      <Card title={`会话记录 (${messages.length})`}>
        <TicketMessageList messages={messages} />
      </Card>
      <Card title="处理工单">
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: ticket.status, body: '', internal: false }}
          onFinish={onReply}
        >
          <Flex gap={12} wrap align="end" style={{ marginBottom: 16 }}>
            <Form.Item name="status" label="工单状态" style={{ width: 180, marginBottom: 0 }}>
              <Select
                options={['waiting_staff', 'waiting_user', 'resolved', 'closed'].map((value) => ({
                  value,
                  label: ticketStatusLabel(value as HydratedSupportTicket['status']),
                }))}
              />
            </Form.Item>
            <Button
              onClick={onSaveStatus}
              loading={isSavingStatus}
              disabled={!statusDraft || statusDraft === ticket.status}
            >
              更新状态
            </Button>
            <Button onClick={onAssignToMe} loading={isAssigning}>
              指派给我
            </Button>
            <Button type="text" onClick={onUnassign} disabled={isAssigning}>
              取消指派
            </Button>
          </Flex>
          <Form.Item name="internal" valuePropName="checked">
            <Checkbox>内部备注（仅管理员可见）</Checkbox>
          </Form.Item>
          <Form.Item
            name="body"
            label={internal ? '内部备注内容' : '回复内容'}
            rules={[{ required: true, whitespace: true, message: '请输入回复内容' }]}
          >
            <Input.TextArea
              rows={5}
              placeholder={internal ? '这条备注仅管理员可见' : '输入发给用户的回复内容'}
              disabled={isReplying}
            />
          </Form.Item>
          <Flex justify="end">
            <Button type="primary" htmlType="submit" loading={isReplying}>
              {internal ? '保存备注' : '发送回复'}
            </Button>
          </Flex>
        </Form>
      </Card>
    </div>
  );
}

export function TicketsPage() {
  const [contextParams, setContextParams] = useSearchParams();
  const deploymentId = contextParams.get('deploymentId') ?? undefined;
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<TicketDraft>();
  const { user } = useAuth();
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: PAGE_SIZE,
    knownFilters: ['status', 'category', 'priority'],
  });
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);
  const categoryValues = useMemo(() => filters.category ?? [], [filters.category]);
  const priorityValues = useMemo(() => filters.priority ?? [], [filters.priority]);
  const deferredSearch = useDeferredValue(search);

  const [selectedTicketNo, setSelectedTicketNo] = useState<string | null>(null);
  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      deploymentId,
      status: statusValues[0] as HydratedSupportTicket['status'] | undefined,
      category: categoryValues[0] as HydratedSupportTicket['category'] | undefined,
      priority: priorityValues[0] as HydratedSupportTicket['priority'] | undefined,
    }),
    [categoryValues, deferredSearch, page, priorityValues, statusValues, deploymentId],
  );

  const ticketsQuery = useQuery({
    queryKey: ['admin-tickets', query],
    queryFn: () => listAdminTickets(query),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-ticket-detail', selectedTicketNo],
    queryFn: () => getAdminTicket(selectedTicketNo!),
    enabled: Boolean(selectedTicketNo),
  });

  useEffect(() => {
    const nextStatus = detailQuery.data?.ticket.status;
    if (nextStatus) {
      form.setFieldValue('status', nextStatus);
    }
  }, [detailQuery.data?.ticket.status, form]);

  const assignMutation = useMutation({
    mutationFn: assignAdminTicket,
    onSuccess: async (_, variables) => {
      void message.success(variables.assignedAdminUserId ? '工单已指派' : '已取消指派');
      await qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      await qc.invalidateQueries({ queryKey: ['admin-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => void message.error(error instanceof Error ? error.message : '更新指派失败'),
  });

  const replyMutation = useMutation({
    mutationFn: replyAdminTicket,
    onSuccess: async (_, variables) => {
      void message.success(variables.isInternal ? '内部备注已保存' : '回复已发送');
      form.setFieldsValue({ body: '', internal: false });
      await qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      await qc.invalidateQueries({ queryKey: ['admin-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => void message.error(error instanceof Error ? error.message : '发送回复失败'),
  });

  const statusMutation = useMutation({
    mutationFn: updateAdminTicketStatus,
    onSuccess: async (_, variables) => {
      void message.success('工单状态已更新');
      await qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      await qc.invalidateQueries({ queryKey: ['admin-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => void message.error(error instanceof Error ? error.message : '更新状态失败'),
  });

  const tickets = useMemo(() => ticketsQuery.data?.items ?? [], [ticketsQuery.data?.items]);
  const total = ticketsQuery.data?.total ?? 0;

  useEffect(() => {
    if (selectedTicketNo && !tickets.some((ticket) => ticket.ticketNo === selectedTicketNo)) {
      setSelectedTicketNo(null);
    }
  }, [selectedTicketNo, tickets]);

  const currentTicketIndex = selectedTicketNo
    ? tickets.findIndex((ticket) => ticket.ticketNo === selectedTicketNo)
    : -1;
  const previousTicket = currentTicketIndex > 0 ? tickets[currentTicketIndex - 1] : null;
  const nextTicket =
    currentTicketIndex >= 0 && currentTicketIndex < tickets.length - 1
      ? tickets[currentTicketIndex + 1]
      : null;

  useEffect(() => {
    if (!selectedTicketNo) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === '[' && previousTicket) {
        event.preventDefault();
        void openTicket(previousTicket.ticketNo);
      } else if (event.key === ']' && nextTicket) {
        event.preventDefault();
        void openTicket(nextTicket.ticketNo);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const columns: TableColumnsType<HydratedSupportTicket> = [
    {
      key: 'ticket',
      title: '工单',
      className: 'min-w-[260px]',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="admin-text truncate text-[13px] font-medium">{row.subject}</p>
          <p className="admin-text-secondary truncate font-mono text-xs">
            {row.ticketNo}
            {row.app?.name ? ` · ${row.app.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusTag tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
          <StatusTag
            tone={ticketPriorityTone(row.priority)}
            label={ticketPriorityLabel(row.priority)}
          />
        </div>
      ),
    },
    {
      key: 'user',
      title: '用户',
      render: (_, row) => <p className="truncate text-sm">{row.user?.email ?? row.userId}</p>,
    },
    {
      key: 'assignee',
      title: '指派 / 更新',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="admin-text truncate text-sm">
            {row.assignee?.displayName ?? row.assignee?.email ?? '未分配'}
          </p>
          <p className="admin-text-secondary text-xs tabular-nums">
            {formatTime(row.lastActivityAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      className: 'w-[80px]',
      render: (_, row) => (
        <Button
          size="small"
          className="h-7 px-2.5 text-xs"
          onClick={() => void openTicket(row.ticketNo)}
        >
          处理
        </Button>
      ),
    },
  ];

  const detail = detailQuery.data;

  async function openTicket(ticketNo: string | null) {
    if (replyMutation.isPending || statusMutation.isPending || assignMutation.isPending) return;
    if (
      form.getFieldValue('body')?.trim() &&
      !(await modal.confirm({
        title: '放弃未发送的回复？',
        okText: '放弃回复',
        cancelText: '继续编辑',
      }))
    )
      return;
    form.resetFields();
    setSelectedTicketNo(ticketNo);
  }
  const filterOptions = [
    {
      id: 'status',
      label: '状态',
      values: statusValues,
      options: ['waiting_staff', 'waiting_user', 'resolved', 'closed'].map((value) => ({
        value,
        label: ticketStatusLabel(value as HydratedSupportTicket['status']),
      })),
    },
    {
      id: 'category',
      label: '分类',
      values: categoryValues,
      options: [
        'billing',
        'access',
        'install',
        'deployment',
        'bug',
        'feature',
        'account',
        'other',
      ].map((value) => ({
        value,
        label: ticketCategoryLabel(value as HydratedSupportTicket['category']),
      })),
    },
    {
      id: 'priority',
      label: '优先级',
      values: priorityValues,
      options: ['urgent', 'high', 'normal', 'low'].map((value) => ({
        value,
        label: ticketPriorityLabel(value as HydratedSupportTicket['priority']),
      })),
    },
  ];
  return (
    <PageContainer
      title="工单管理"
      filters={
        <>
          <Input.Search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索工单"
            allowClear
            placeholder="搜索工单号、标题、用户、应用、订单号…"
            style={{ width: 320, maxWidth: '100%' }}
          />
          {filterOptions.map((filter) => (
            <Select
              key={filter.id}
              aria-label={`工单${filter.label}`}
              placeholder={`全部${filter.label}`}
              allowClear
              value={filter.values[0]}
              style={{ width: 130 }}
              options={filter.options}
              onChange={(value) => setFilter(filter.id, value ? [value] : [])}
            />
          ))}
          <Button onClick={clearFilters}>清除筛选</Button>
        </>
      }
    >
      {deploymentId && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          title={`关联部署：${deploymentId}`}
          action={
            <Button
              onClick={() =>
                setContextParams((current) => {
                  const next = new URLSearchParams(current);
                  next.delete('deploymentId');
                  next.delete('page');
                  return next;
                })
              }
            >
              清除部署筛选
            </Button>
          }
        />
      )}
      <AsyncState error={ticketsQuery.error} onRetry={() => void ticketsQuery.refetch()}>
        <Table
          columns={columns}
          dataSource={tickets}
          rowKey="ticketNo"
          loading={ticketsQuery.isLoading}
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无工单' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </AsyncState>
      <ManagementDrawer
        open={!!selectedTicketNo}
        title={`工单详情 · ${selectedTicketNo ?? ''}`}
        onClose={() => {
          void openTicket(null);
        }}
        size="large"
        footer={
          <Flex justify="space-between" gap={8} wrap>
            <Flex gap={8}>
              <Button
                aria-label="上一条工单"
                icon={<ChevronLeft size={14} />}
                disabled={!previousTicket}
                onClick={() => {
                  if (previousTicket) void openTicket(previousTicket.ticketNo);
                }}
              />
              <Button
                aria-label="下一条工单"
                icon={<ChevronRight size={14} />}
                disabled={!nextTicket}
                onClick={() => {
                  if (nextTicket) void openTicket(nextTicket.ticketNo);
                }}
              />
              {currentTicketIndex >= 0 && (
                <span>
                  {currentTicketIndex + 1} / {tickets.length}
                </span>
              )}
            </Flex>
            <Button
              onClick={() => {
                void openTicket(null);
              }}
            >
              关闭
            </Button>
          </Flex>
        }
      >
        <AsyncState
          loading={detailQuery.isLoading}
          error={detailQuery.error}
          onRetry={() => void detailQuery.refetch()}
        >
          {detail && selectedTicketNo && (
            <TicketDetailPanel
              detail={detail}
              form={form}
              onSaveStatus={() =>
                statusMutation.mutate({
                  ticketNo: selectedTicketNo,
                  status: form.getFieldValue('status') as TicketDraft['status'],
                })
              }
              onReply={() => {
                const values = form.getFieldsValue();
                if (!replyMutation.isPending)
                  replyMutation.mutate({
                    ticketNo: selectedTicketNo,
                    body: values.body.trim(),
                    isInternal: values.internal,
                  });
              }}
              onAssignToMe={() => {
                if (user?.id)
                  assignMutation.mutate({
                    ticketNo: selectedTicketNo,
                    assignedAdminUserId: user.id,
                  });
              }}
              onUnassign={() =>
                assignMutation.mutate({ ticketNo: selectedTicketNo, assignedAdminUserId: null })
              }
              isSavingStatus={statusMutation.isPending}
              isReplying={replyMutation.isPending}
              isAssigning={assignMutation.isPending}
            />
          )}
        </AsyncState>
      </ManagementDrawer>
    </PageContainer>
  );
}
