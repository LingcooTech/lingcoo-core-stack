import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { assignAdminTicket, getAdminTicket, listAdminTickets, replyAdminTicket, updateAdminTicketStatus } from '@/api/admin';
import type { HydratedSupportTicket, SupportTicketDetail, SupportTicketMessage } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import { cn, formatTime } from '@/lib/utils';

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
    return <p className="text-sm text-slate-500">暂无会话记录。</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isInternal = message.isInternal;
        return (
          <div key={message.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{messageAuthorLabel(message)}</span>
              <span>{formatTime(message.createdAt)}</span>
              {isInternal ? <StatusPill tone="neutral" label="内部备注" /> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">{message.body}</p>
          </div>
        );
      })}
    </div>
  );
}

function TicketDetailPanel({
  detail,
  statusDraft,
  onStatusDraftChange,
  onSaveStatus,
  replyDraft,
  onReplyDraftChange,
  onReply,
  internalNote,
  onInternalNoteChange,
  onAssignToMe,
  onUnassign,
  isSavingStatus,
  isReplying,
  isAssigning
}: {
  detail: SupportTicketDetail;
  statusDraft: HydratedSupportTicket['status'];
  onStatusDraftChange: (value: HydratedSupportTicket['status']) => void;
  onSaveStatus: () => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onReply: () => void;
  internalNote: boolean;
  onInternalNoteChange: (value: boolean) => void;
  onAssignToMe: () => void;
  onUnassign: () => void;
  isSavingStatus: boolean;
  isReplying: boolean;
  isAssigning: boolean;
}) {
  const { ticket, messages } = detail;

  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{ticket.subject}</CardTitle>
            <CardDescription className="mt-1">
              {ticket.ticketNo} · 最近活动 {formatTime(ticket.lastActivityAt)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={ticketStatusTone(ticket.status)} label={ticketStatusLabel(ticket.status)} />
            <StatusPill tone={ticketPriorityTone(ticket.priority)} label={ticketPriorityLabel(ticket.priority)} />
            <StatusPill tone="neutral" label={ticketCategoryLabel(ticket.category)} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetaField label="用户" value={ticket.user?.email ?? '—'} />
          <MetaField label="应用" value={ticket.app?.name ?? '未关联'} />
          <MetaField label="订单号" value={ticket.order?.orderNo ?? '未关联'} mono />
          <MetaField label="安装实例" value={ticket.install?.extensionInstallId ?? '未关联'} mono />
          <MetaField label="部署" value={ticket.deployment?.label ?? '未关联'} />
          <MetaField label="当前指派" value={ticket.assignee?.displayName ?? ticket.assignee?.email ?? '未分配'} />
          <MetaField label="创建时间" value={formatTime(ticket.createdAt)} />
          <MetaField label="最近回复方" value={ticket.lastReplyAuthorType} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <div className="space-y-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
            <div className="space-y-2">
              <Label>工单状态</Label>
              <Select value={statusDraft} onValueChange={(value) => onStatusDraftChange(value as HydratedSupportTicket['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiting_staff">待处理</SelectItem>
                  <SelectItem value="waiting_user">待回复</SelectItem>
                  <SelectItem value="resolved">已解决</SelectItem>
                  <SelectItem value="closed">已关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={onSaveStatus} disabled={isSavingStatus || statusDraft === ticket.status}>
              {isSavingStatus ? '保存中...' : '更新状态'}
            </Button>

            <div className="h-px bg-gray-200" />

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">指派</p>
              <Button type="button" variant="outline" onClick={onAssignToMe} disabled={isAssigning}>
                {isAssigning ? '处理中...' : '指派给我'}
              </Button>
              <Button type="button" variant="ghost" onClick={onUnassign} disabled={isAssigning}>
                取消指派
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">会话记录</p>
              <p className="text-xs text-slate-500">{messages.length} 条消息</p>
            </div>
            <TicketMessageList messages={messages} />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">回复工单</p>
            <div className="flex items-center gap-2">
              <Checkbox checked={internalNote} onCheckedChange={(checked) => onInternalNoteChange(checked === true)} />
              <Label className="cursor-pointer">内部备注</Label>
            </div>
          </div>
          <Textarea
            value={replyDraft}
            onChange={(event) => onReplyDraftChange(event.target.value)}
            rows={5}
            placeholder={internalNote ? '这条备注仅管理员可见' : '输入发给用户的回复内容'}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={onReply} disabled={isReplying || !replyDraft.trim()}>
              {isReplying ? '发送中...' : internalNote ? '保存备注' : '发送回复'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TicketsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [categoryFilter, setCategoryFilter] = useState('__all__');
  const [priorityFilter, setPriorityFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const [selectedTicketNo, setSelectedTicketNo] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<HydratedSupportTicket['status']>('waiting_staff');
  const [replyDraft, setReplyDraft] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, categoryFilter, priorityFilter]);

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      status: statusFilter !== '__all__' ? (statusFilter as HydratedSupportTicket['status']) : undefined,
      category: categoryFilter !== '__all__' ? (categoryFilter as HydratedSupportTicket['category']) : undefined,
      priority: priorityFilter !== '__all__' ? (priorityFilter as HydratedSupportTicket['priority']) : undefined
    }),
    [categoryFilter, deferredSearch, page, priorityFilter, statusFilter]
  );

  const ticketsQuery = useQuery({
    queryKey: ['admin-tickets', query],
    queryFn: () => listAdminTickets(query)
  });

  const detailQuery = useQuery({
    queryKey: ['admin-ticket-detail', selectedTicketNo],
    queryFn: () => getAdminTicket(selectedTicketNo!),
    enabled: Boolean(selectedTicketNo)
  });

  useEffect(() => {
    const nextStatus = detailQuery.data?.ticket.status;
    if (nextStatus) {
      setStatusDraft(nextStatus);
    }
  }, [detailQuery.data?.ticket.status]);

  const assignMutation = useMutation({
    mutationFn: assignAdminTicket,
    onSuccess: async (_, variables) => {
      toast.success(variables.assignedAdminUserId ? '工单已指派' : '已取消指派');
      await qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      await qc.invalidateQueries({ queryKey: ['admin-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新指派失败')
  });

  const replyMutation = useMutation({
    mutationFn: replyAdminTicket,
    onSuccess: async (_, variables) => {
      toast.success(variables.isInternal ? '内部备注已保存' : '回复已发送');
      setReplyDraft('');
      setInternalNote(false);
      await qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      await qc.invalidateQueries({ queryKey: ['admin-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '发送回复失败')
  });

  const statusMutation = useMutation({
    mutationFn: updateAdminTicketStatus,
    onSuccess: async (_, variables) => {
      toast.success('工单状态已更新');
      await qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      await qc.invalidateQueries({ queryKey: ['admin-ticket-detail', variables.ticketNo] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '更新状态失败')
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
      className: 'min-w-[280px]',
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
      header: '状态 / 优先级',
      cell: (row) => (
        <div className="space-y-1.5">
          <StatusPill tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
          <StatusPill tone={ticketPriorityTone(row.priority)} label={ticketPriorityLabel(row.priority)} />
        </div>
      )
    },
    {
      key: 'user',
      header: '用户 / 分类',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">{row.user?.email ?? row.userId}</p>
          <p className="text-xs text-slate-500">{ticketCategoryLabel(row.category)}</p>
        </div>
      )
    },
    {
      key: 'assignee',
      header: '指派',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm text-slate-900">{row.assignee?.displayName ?? row.assignee?.email ?? '未分配'}</p>
          <p className="text-[11px] text-slate-500">{formatTime(row.lastActivityAt)}</p>
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
          {selectedTicketNo === row.ticketNo ? '收起' : '处理'}
        </Button>
      )
    }
  ];

  const detail = detailQuery.data;

  return (
    <div>
      <SectionHeader sectionKey="tickets" />
      <div className="space-y-4 p-6">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索工单号、标题、用户、应用、订单号..."
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
            },
            {
              id: 'priority',
              placeholder: '全部优先级',
              value: priorityFilter,
              onChange: setPriorityFilter,
              options: [
                { value: 'urgent', label: '紧急' },
                { value: 'high', label: '高' },
                { value: 'normal', label: '普通' },
                { value: 'low', label: '低' }
              ]
            }
          ]}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
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

        {selectedTicketNo && detail ? (
          <TicketDetailPanel
            detail={detail}
            statusDraft={statusDraft}
            onStatusDraftChange={setStatusDraft}
            onSaveStatus={() => statusMutation.mutate({ ticketNo: selectedTicketNo, status: statusDraft })}
            replyDraft={replyDraft}
            onReplyDraftChange={setReplyDraft}
            onReply={() =>
              replyMutation.mutate({
                ticketNo: selectedTicketNo,
                body: replyDraft.trim(),
                isInternal: internalNote
              })
            }
            internalNote={internalNote}
            onInternalNoteChange={setInternalNote}
            onAssignToMe={() => {
              if (!user?.id) return;
              assignMutation.mutate({
                ticketNo: selectedTicketNo,
                assignedAdminUserId: user.id
              });
            }}
            onUnassign={() =>
              assignMutation.mutate({
                ticketNo: selectedTicketNo,
                assignedAdminUserId: null
              })
            }
            isSavingStatus={statusMutation.isPending}
            isReplying={replyMutation.isPending}
            isAssigning={assignMutation.isPending}
          />
        ) : selectedTicketNo && detailQuery.isLoading ? (
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
