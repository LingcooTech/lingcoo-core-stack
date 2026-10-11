import { QueryErrorState } from '@/components/portal/QueryErrorState';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

import { closeMyTicket, getMyTicket, listMyTickets, replyMyTicket } from '@/api/user';
import type { HydratedSupportTicket, SupportTicketDetail, SupportTicketMessage } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTableState } from '@/hooks/useTableState';
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
    <div className="rounded-lg border border-border bg-muted/70 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm text-foreground', mono && 'font-mono text-xs')}>
        {value || '—'}
      </p>
    </div>
  );
}

function TicketMessageList({ messages }: { messages: SupportTicketMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无会话记录。</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isUser = message.authorType === 'user';
        return (
          <div key={message.id} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-xl border px-4 py-3',
                isUser
                  ? 'border-foreground/15 bg-muted text-foreground'
                  : 'border-border bg-card text-foreground',
              )}
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{messageAuthorLabel(message)}</span>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{message.body}</p>
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
  isClosing,
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
    <Card className="rounded-xl border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{ticket.subject}</CardTitle>
            <CardDescription className="mt-1">
              {ticket.ticketNo} · 最近更新 {formatTime(ticket.lastActivityAt)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill
              tone={ticketStatusTone(ticket.status)}
              label={ticketStatusLabel(ticket.status)}
            />
            <StatusPill
              tone={ticketPriorityTone(ticket.priority)}
              label={ticketPriorityLabel(ticket.priority)}
            />
            <StatusPill tone="neutral" label={ticketCategoryLabel(ticket.category)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetaField label="应用" value={ticket.app?.name ?? '未关联'} />
          <MetaField label="订单号" value={ticket.order?.orderNo ?? '未关联'} mono />
          <MetaField
            label="客户端安装"
            value={ticket.install?.extensionInstallId ?? '未关联'}
            mono
          />
          <MetaField label="部署" value={ticket.deployment?.label ?? '未关联'} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">会话记录</p>
            <p className="text-xs text-muted-foreground">{messages.length} 条消息</p>
          </div>
          <TicketMessageList messages={messages} />
        </div>

        {ticket.status !== 'closed' ? (
          <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">继续补充问题</p>
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
              <Button type="button" onClick={onReply} disabled={isReplying || !replyBody.trim()}>
                {isReplying ? '发送中...' : '发送回复'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AccountTicketsTab() {
  const qc = useQueryClient();
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: PAGE_SIZE,
    prefix: 'tickets',
    knownFilters: ['status', 'category'],
  });
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);
  const categoryValues = useMemo(() => filters.category ?? [], [filters.category]);
  const [selectedTicketNo, setSelectedTicketNo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const deferredSearch = useDeferredValue(search);

  const ticketQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      // 后端单值，多选时取首项
      status: statusValues[0] as HydratedSupportTicket['status'] | undefined,
      category: categoryValues[0] as HydratedSupportTicket['category'] | undefined,
    }),
    [categoryValues, deferredSearch, page, statusValues],
  );

  const ticketsQuery = useQuery({
    queryKey: ['my-tickets', ticketQuery],
    queryFn: () => listMyTickets(ticketQuery),
  });

  const ticketDetailQuery = useQuery({
    queryKey: ['my-ticket-detail', selectedTicketNo],
    queryFn: () => getMyTicket(selectedTicketNo!),
    enabled: Boolean(selectedTicketNo),
  });

  const replyMutation = useMutation({
    mutationFn: ({ ticketNo, body }: { ticketNo: string; body: string }) =>
      replyMyTicket(ticketNo, body),
    onSuccess: async (_, variables) => {
      toast.success('回复已发送');
      setReplyBody('');
      await qc.invalidateQueries({ queryKey: ['my-tickets'] });
      await qc.invalidateQueries({ queryKey: ['my-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '发送回复失败'),
  });

  const closeMutation = useMutation({
    mutationFn: closeMyTicket,
    onSuccess: async (_, ticketNo) => {
      toast.success('工单已关闭');
      await qc.invalidateQueries({ queryKey: ['my-tickets'] });
      await qc.invalidateQueries({ queryKey: ['my-ticket-detail', ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '关闭工单失败'),
  });

  const tickets = useMemo(() => ticketsQuery.data?.items ?? [], [ticketsQuery.data?.items]);
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
          <p className="font-mono text-[11px] font-semibold text-muted-foreground">
            {row.ticketNo}
          </p>
          <p className="text-sm font-semibold text-foreground">{row.subject}</p>
          <p className="text-xs text-muted-foreground">
            {row.app?.name ?? '未关联应用'}
            {row.order?.orderNo ? ` · 订单 ${row.order.orderNo}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="space-y-1.5">
          <StatusPill tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
          <StatusPill
            tone={ticketPriorityTone(row.priority)}
            label={ticketPriorityLabel(row.priority)}
          />
        </div>
      ),
    },
    {
      key: 'category',
      header: '分类',
      cell: (row) => <StatusPill tone="neutral" label={ticketCategoryLabel(row.category)} />,
    },
    {
      key: 'activity',
      header: '最近活动',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs text-foreground">{formatTime(row.lastActivityAt)}</p>
          <p className="text-[11px] text-muted-foreground">{row.messageCount} 条消息</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setSelectedTicketNo(row.ticketNo === selectedTicketNo ? null : row.ticketNo)
          }
        >
          {selectedTicketNo === row.ticketNo ? '收起' : '查看'}
        </Button>
      ),
    },
  ];

  const selectedDetail = ticketDetailQuery.data;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-foreground">我的工单</p>
            <p className="text-xs text-muted-foreground">
              查看处理进度、补充信息或关闭已处理完成的工单。
            </p>
          </div>
          <Button asChild>
            <Link to="/tickets/new">发起新工单</Link>
          </Button>
        </div>

        <FilterChipBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索工单号、标题、应用、订单号..."
          chips={
            [
              {
                id: 'status',
                label: '状态',
                values: statusValues,
                onChange: (next) => setFilter('status', next),
                options: [
                  { value: 'waiting_staff', label: '待处理' },
                  { value: 'waiting_user', label: '待回复' },
                  { value: 'resolved', label: '已解决' },
                  { value: 'closed', label: '已关闭' },
                ],
              },
              {
                id: 'category',
                label: '分类',
                values: categoryValues,
                onChange: (next) => setFilter('category', next),
                options: [
                  { value: 'billing', label: '账单' },
                  { value: 'access', label: '授权' },
                  { value: 'install', label: '安装' },
                  { value: 'deployment', label: '部署' },
                  { value: 'bug', label: '缺陷' },
                  { value: 'feature', label: '功能' },
                  { value: 'account', label: '账户' },
                  { value: 'other', label: '其他' },
                ],
              },
            ] satisfies FilterChipConfig[]
          }
          onClearAll={clearFilters}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {ticketsQuery.isError ? (
            <QueryErrorState
              retry={() => void ticketsQuery.refetch()}
              busy={ticketsQuery.isFetching}
            />
          ) : (
            <DataTable
              columns={columns}
              data={tickets}
              isLoading={ticketsQuery.isLoading}
              emptyMessage="暂无工单"
              getRowId={(row) => row.ticketNo}
            />
          )}
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
              body: replyBody.trim(),
            })
          }
          onCloseTicket={() => closeMutation.mutate(selectedTicketNo)}
          isReplying={replyMutation.isPending}
          isClosing={closeMutation.isPending}
        />
      ) : selectedTicketNo && ticketDetailQuery.isLoading ? (
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
