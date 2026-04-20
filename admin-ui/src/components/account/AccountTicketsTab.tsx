import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { closeMyTicket, createMyTicket, getMyTicket, listMyTickets, replyMyTicket } from '@/api/user';
import type { HydratedSupportTicket, SupportTicketDetail, SupportTicketMessage } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatTime } from '@/lib/utils';

const PAGE_SIZE = 10;

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
    return message.author?.displayName?.trim() || message.author?.email || '客服';
  }

  return message.author?.displayName?.trim() || message.author?.email || '我';
}

function MetaField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2.5">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className={cn('mt-1 text-sm text-gray-900', mono && 'font-mono text-xs')}>{value || '—'}</p>
    </div>
  );
}

function TicketMessageList({ messages }: { messages: SupportTicketMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-gray-500">暂无会话记录。</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isUser = message.authorType === 'user';
        return (
          <div
            key={message.id}
            className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm',
                isUser ? 'border-blue-200 bg-blue-50 text-slate-900' : 'border-gray-200 bg-white text-slate-900'
              )}
            >
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="font-semibold text-gray-700">{messageAuthorLabel(message)}</span>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketDetailPanel({
  detail,
  replyBody,
  onReplyBodyChange,
  onReply,
  onCloseTicket,
  isReplying,
  isClosing
}: {
  detail: SupportTicketDetail;
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onReply: () => void;
  onCloseTicket: () => void;
  isReplying: boolean;
  isClosing: boolean;
}) {
  const { ticket, messages } = detail;

  return (
    <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{ticket.subject}</CardTitle>
            <CardDescription className="mt-1">
              {ticket.ticketNo} · 最近更新 {formatTime(ticket.lastActivityAt)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={ticketStatusTone(ticket.status)} label={ticketStatusLabel(ticket.status)} />
            <StatusPill tone={ticketPriorityTone(ticket.priority)} label={ticketPriorityLabel(ticket.priority)} />
            <StatusPill tone="neutral" label={ticketCategoryLabel(ticket.category)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetaField label="应用" value={ticket.app?.name ?? '未关联'} />
          <MetaField label="订单号" value={ticket.order?.orderNo ?? '未关联'} mono />
          <MetaField label="安装实例" value={ticket.install?.extensionInstallId ?? '未关联'} mono />
          <MetaField label="部署" value={ticket.deployment?.label ?? '未关联'} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">会话记录</p>
            <p className="text-xs text-gray-500">{messages.length} 条消息</p>
          </div>
          <TicketMessageList messages={messages} />
        </div>

        {ticket.status !== 'closed' ? (
          <div className="space-y-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">继续补充问题</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCloseTicket}
                disabled={isClosing}
              >
                {isClosing ? '关闭中...' : '关闭工单'}
              </Button>
            </div>
            <Textarea
              value={replyBody}
              onChange={(event) => onReplyBodyChange(event.target.value)}
              placeholder="补充报错、截图说明、复现步骤或当前处理结果"
              rows={4}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={onReply}
                disabled={isReplying || !replyBody.trim()}
              >
                {isReplying ? '发送中...' : '发送回复'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AccountTicketsTab({ defaultAppCode }: { defaultAppCode?: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [categoryFilter, setCategoryFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const [selectedTicketNo, setSelectedTicketNo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [createForm, setCreateForm] = useState({
    appCode: defaultAppCode?.trim() || '',
    orderNo: '',
    extensionInstallId: '',
    category: 'other' as HydratedSupportTicket['category'],
    priority: 'normal' as HydratedSupportTicket['priority'],
    subject: '',
    body: ''
  });
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!defaultAppCode?.trim()) {
      return;
    }

    setCreateForm((prev) => (prev.appCode ? prev : { ...prev, appCode: defaultAppCode.trim() }));
  }, [defaultAppCode]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, categoryFilter]);

  const ticketQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      status:
        statusFilter !== '__all__'
          ? (statusFilter as HydratedSupportTicket['status'])
          : undefined,
      category:
        categoryFilter !== '__all__'
          ? (categoryFilter as HydratedSupportTicket['category'])
          : undefined
    }),
    [categoryFilter, deferredSearch, page, statusFilter]
  );

  const appsQuery = useQuery({
    queryKey: ['catalog-apps'],
    queryFn: listApps,
    staleTime: 5 * 60_000
  });

  const ticketsQuery = useQuery({
    queryKey: ['my-tickets', ticketQuery],
    queryFn: () => listMyTickets(ticketQuery)
  });

  const ticketDetailQuery = useQuery({
    queryKey: ['my-ticket-detail', selectedTicketNo],
    queryFn: () => getMyTicket(selectedTicketNo!),
    enabled: Boolean(selectedTicketNo)
  });

  const createMutation = useMutation({
    mutationFn: createMyTicket,
    onSuccess: async (result) => {
      toast.success(`工单已创建：${result.ticket.ticketNo}`);
      setCreateForm((prev) => ({
        ...prev,
        orderNo: '',
        extensionInstallId: '',
        subject: '',
        body: '',
        category: 'other',
        priority: 'normal'
      }));
      setSelectedTicketNo(result.ticket.ticketNo);
      await qc.invalidateQueries({ queryKey: ['my-tickets'] });
      await qc.invalidateQueries({ queryKey: ['my-ticket-detail', result.ticket.ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '创建工单失败')
  });

  const replyMutation = useMutation({
    mutationFn: ({ ticketNo, body }: { ticketNo: string; body: string }) => replyMyTicket(ticketNo, body),
    onSuccess: async (_, variables) => {
      toast.success('回复已发送');
      setReplyBody('');
      await qc.invalidateQueries({ queryKey: ['my-tickets'] });
      await qc.invalidateQueries({ queryKey: ['my-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '发送回复失败')
  });

  const closeMutation = useMutation({
    mutationFn: closeMyTicket,
    onSuccess: async (_, ticketNo) => {
      toast.success('工单已关闭');
      await qc.invalidateQueries({ queryKey: ['my-tickets'] });
      await qc.invalidateQueries({ queryKey: ['my-ticket-detail', ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '关闭工单失败')
  });

  const tickets = ticketsQuery.data?.items ?? [];
  const total = ticketsQuery.data?.total ?? 0;

  useEffect(() => {
    if (selectedTicketNo && !tickets.some((ticket) => ticket.ticketNo === selectedTicketNo)) {
      setSelectedTicketNo(null);
    }
  }, [selectedTicketNo, tickets]);

  const columns: Column<HydratedSupportTicket>[] = [
    {
      key: 'ticket',
      header: '工单',
      className: 'min-w-[260px]',
      cell: (row) => (
        <div className="space-y-1">
          <p className="font-mono text-[11px] font-semibold text-slate-600">{row.ticketNo}</p>
          <p className="text-sm font-semibold text-slate-900">{row.subject}</p>
          <p className="text-xs text-slate-500">
            {row.app?.name ?? '未关联应用'}
            {row.order?.orderNo ? ` · 订单 ${row.order.orderNo}` : ''}
          </p>
        </div>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="space-y-1.5">
          <StatusPill tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
          <StatusPill tone={ticketPriorityTone(row.priority)} label={ticketPriorityLabel(row.priority)} />
        </div>
      )
    },
    {
      key: 'category',
      header: '分类',
      cell: (row) => <StatusPill tone="neutral" label={ticketCategoryLabel(row.category)} />
    },
    {
      key: 'activity',
      header: '最近活动',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs text-slate-700">{formatTime(row.lastActivityAt)}</p>
          <p className="text-[11px] text-slate-500">{row.messageCount} 条消息</p>
        </div>
      )
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setSelectedTicketNo(row.ticketNo === selectedTicketNo ? null : row.ticketNo)}
        >
          {selectedTicketNo === row.ticketNo ? '收起' : '查看'}
        </Button>
      )
    }
  ];

  const appOptions = appsQuery.data?.items ?? [];
  const selectedDetail = ticketDetailQuery.data;

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl tracking-tight">提交新工单</CardTitle>
          <CardDescription>
            把订单号、安装实例 ID、复现步骤和报错信息写完整，后面处理会快很多。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>关联应用</Label>
              <Select
                value={createForm.appCode || '__none__'}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    appCode: value === '__none__' ? '' : value
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择应用" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不关联应用</SelectItem>
                  {appOptions.map((app) => (
                    <SelectItem key={app.id} value={app.code}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>订单号</Label>
              <Input
                value={createForm.orderNo}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, orderNo: event.target.value }))}
                placeholder="可选，例如 FD202604200001"
              />
            </div>
            <div className="space-y-2">
              <Label>安装实例 ID</Label>
              <Input
                value={createForm.extensionInstallId}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, extensionInstallId: event.target.value }))
                }
                placeholder="可选，例如浏览器扩展安装 ID"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>分类</Label>
                <Select
                  value={createForm.category}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      category: value as HydratedSupportTicket['category']
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billing">账单</SelectItem>
                    <SelectItem value="access">授权</SelectItem>
                    <SelectItem value="install">安装</SelectItem>
                    <SelectItem value="deployment">部署</SelectItem>
                    <SelectItem value="bug">缺陷</SelectItem>
                    <SelectItem value="feature">功能</SelectItem>
                    <SelectItem value="account">账户</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select
                  value={createForm.priority}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      priority: value as HydratedSupportTicket['priority']
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="normal">普通</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="urgent">紧急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>标题</Label>
            <Input
              value={createForm.subject}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="一句话说明问题，例如：支付成功但 Pro 未开通"
            />
          </div>

          <div className="space-y-2">
            <Label>问题描述</Label>
            <Textarea
              value={createForm.body}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, body: event.target.value }))}
              rows={6}
              placeholder="请描述复现步骤、报错文案、你已经尝试过的排查动作"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() =>
                createMutation.mutate({
                  appCode: createForm.appCode || undefined,
                  orderNo: createForm.orderNo.trim() || undefined,
                  extensionInstallId: createForm.extensionInstallId.trim() || undefined,
                  category: createForm.category,
                  priority: createForm.priority,
                  subject: createForm.subject.trim(),
                  body: createForm.body.trim()
                })
              }
              disabled={
                createMutation.isPending ||
                !createForm.subject.trim() ||
                !createForm.body.trim()
              }
            >
              {createMutation.isPending ? '提交中...' : '提交工单'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索工单号、标题、应用、订单号..."
          filters={[
            {
              id: 'status',
              placeholder: '全部状态',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'waiting_staff', label: '待处理' },
                { value: 'waiting_user', label: '待回复' },
                { value: 'resolved', label: '已解决' },
                { value: 'closed', label: '已关闭' }
              ]
            },
            {
              id: 'category',
              placeholder: '全部分类',
              value: categoryFilter,
              onChange: setCategoryFilter,
              options: [
                { value: 'billing', label: '账单' },
                { value: 'access', label: '授权' },
                { value: 'install', label: '安装' },
                { value: 'deployment', label: '部署' },
                { value: 'bug', label: '缺陷' },
                { value: 'feature', label: '功能' },
                { value: 'account', label: '账户' },
                { value: 'other', label: '其他' }
              ]
            }
          ]}
        />

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <DataTable
            columns={columns}
            data={tickets}
            isLoading={ticketsQuery.isLoading}
            emptyMessage="暂无工单"
            getRowKey={(row) => row.ticketNo}
          />
        </div>

        <PaginationBar
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          isLoading={ticketsQuery.isLoading}
          itemLabel="条工单"
          onPageChange={setPage}
        />
      </div>

      {selectedTicketNo && selectedDetail ? (
        <TicketDetailPanel
          detail={selectedDetail}
          replyBody={replyBody}
          onReplyBodyChange={setReplyBody}
          onReply={() =>
            replyMutation.mutate({
              ticketNo: selectedTicketNo,
              body: replyBody.trim()
            })
          }
          onCloseTicket={() => closeMutation.mutate(selectedTicketNo)}
          isReplying={replyMutation.isPending}
          isClosing={closeMutation.isPending}
        />
      ) : selectedTicketNo && ticketDetailQuery.isLoading ? (
        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
