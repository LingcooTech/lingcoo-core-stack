import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listAdminNotifications, publishAnnouncement } from '@/api/admin';
import type { AdminNotificationItem } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [categoryFilter, setCategoryFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    level: 'info' as 'info' | 'success' | 'warning' | 'error',
    ctaLabel: '',
    ctaUrl: '',
  });

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, categoryFilter]);

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      status:
        statusFilter !== '__all__'
          ? (statusFilter as 'unread' | 'read' | 'archived')
          : undefined,
      category:
        categoryFilter !== '__all__'
          ? (categoryFilter as AdminNotificationItem['category'])
          : undefined,
    }),
    [categoryFilter, deferredSearch, page, statusFilter],
  );

  const notificationsQuery = useQuery({
    queryKey: ['admin-notifications', query],
    queryFn: () => listAdminNotifications(query),
  });

  const publishMutation = useMutation({
    mutationFn: publishAnnouncement,
    onSuccess: async (result) => {
      toast.success(`公告已发布，已发送给 ${result.recipientCount} 位活跃用户`);
      setAnnouncementForm({
        title: '',
        body: '',
        level: 'info',
        ctaLabel: '',
        ctaUrl: '',
      });
      await qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '发布公告失败'),
  });

  const items = notificationsQuery.data?.items ?? [];
  const total = notificationsQuery.data?.total ?? 0;

  const columns: Column<AdminNotificationItem>[] = [
    {
      key: 'content',
      header: '通知内容',
      className: 'min-w-[320px]',
      cell: (row) => (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-900">{row.title}</p>
          <p className="line-clamp-2 text-sm text-slate-600">{row.body}</p>
          {typeof row.meta?.broadcastId === 'string' ? (
            <p className="font-mono text-[10px] text-slate-500">广播 ID: {row.meta.broadcastId}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'user',
      header: '接收用户',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">{row.user?.email ?? '—'}</p>
          {row.user?.displayName ? <p className="text-xs text-slate-500">{row.user.displayName}</p> : null}
          {row.user?.status ? (
            <StatusPill
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
      header: '分类 / 级别',
      cell: (row) => (
        <div className="space-y-1.5">
          <StatusPill tone={categoryTone(row.category)} label={categoryLabel(row.category)} />
          <StatusPill tone={levelTone(row.level)} label={row.level} />
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="space-y-1">
          <StatusPill tone={statusTone(row.status)} label={row.status} />
          <p className="text-[11px] text-slate-500">{row.sourceEventName ?? 'manual'}</p>
        </div>
      ),
    },
    {
      key: 'time',
      header: '时间',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs text-slate-700">{formatTime(row.createdAt)}</p>
          <p className="text-[11px] text-slate-500">
            {row.readAt ? `已读：${formatTime(row.readAt)}` : '未读'}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.ctaLabel && row.ctaUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={row.ctaUrl} target={row.ctaUrl.startsWith('/') ? undefined : '_blank'} rel="noreferrer">
                {row.ctaLabel}
              </a>
            </Button>
          ) : (
            <span className="text-xs text-slate-400">无 CTA</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader sectionKey="notifications" />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">发布公告</CardTitle>
              <CardDescription>发布后会作为站内通知发送给所有活跃用户，并直接出现在用户消息中心。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>公告标题</Label>
                <Input
                  placeholder="例如：平台支付服务升级通知"
                  value={announcementForm.title}
                  onChange={(event) =>
                    setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>公告正文</Label>
                <Textarea
                  rows={6}
                  placeholder="输入需要通知用户的公告正文"
                  value={announcementForm.body}
                  onChange={(event) =>
                    setAnnouncementForm((prev) => ({ ...prev, body: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>通知级别</Label>
                  <Select
                    value={announcementForm.level}
                    onValueChange={(value) =>
                      setAnnouncementForm((prev) => ({
                        ...prev,
                        level: value as typeof prev.level,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">信息</SelectItem>
                      <SelectItem value="success">成功</SelectItem>
                      <SelectItem value="warning">提醒</SelectItem>
                      <SelectItem value="error">警告</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>操作文案</Label>
                  <Input
                    placeholder="例如：查看详情"
                    value={announcementForm.ctaLabel}
                    onChange={(event) =>
                      setAnnouncementForm((prev) => ({ ...prev, ctaLabel: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>操作链接</Label>
                <Input
                  placeholder="支持 /docs 或 https://..."
                  value={announcementForm.ctaUrl}
                  onChange={(event) =>
                    setAnnouncementForm((prev) => ({ ...prev, ctaUrl: event.target.value }))
                  }
                />
              </div>
              <Button
                className="w-full"
                disabled={
                  publishMutation.isPending ||
                  !announcementForm.title.trim() ||
                  !announcementForm.body.trim()
                }
                onClick={() =>
                  publishMutation.mutate({
                    title: announcementForm.title.trim(),
                    body: announcementForm.body.trim(),
                    level: announcementForm.level,
                    ctaLabel: announcementForm.ctaLabel.trim() || undefined,
                    ctaUrl: announcementForm.ctaUrl.trim() || undefined,
                  })
                }
              >
                {publishMutation.isPending ? '发布中...' : '发布站内公告'}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: '当前筛选结果', value: String(total), note: '符合当前筛选条件的通知总数' },
              { label: '当前页未读', value: String(items.filter((item) => item.status === 'unread').length), note: '当前页里尚未被用户读取的通知' },
              { label: '当前页公告', value: String(items.filter((item) => item.category === 'announcement').length), note: '当前页里来自后台公告广播的通知' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
                <p className="text-sm font-medium text-gray-500">{item.label}</p>
                <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-gray-900">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">通知记录</h2>
              <p className="text-sm text-muted-foreground">查看系统发出的用户通知，包括事件通知和管理员公告。</p>
            </div>
          </div>

          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="搜索标题、正文、用户邮箱..."
            filters={[
              {
                id: 'category',
                placeholder: '全部分类',
                value: categoryFilter,
                onChange: setCategoryFilter,
                options: [
                  { value: 'announcement', label: '公告' },
                  { value: 'account', label: '账户' },
                  { value: 'billing', label: '账单' },
                  { value: 'license', label: '授权' },
                  { value: 'deployment', label: '部署' },
                  { value: 'ticket', label: '工单' },
                  { value: 'system', label: '系统' },
                ],
              },
              {
                id: 'status',
                placeholder: '全部状态',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: 'unread', label: '未读' },
                  { value: 'read', label: '已读' },
                  { value: 'archived', label: '已归档' },
                ],
              },
            ]}
          />

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <DataTable
              columns={columns}
              data={items}
              isLoading={notificationsQuery.isLoading}
              emptyMessage="暂无通知记录"
              getRowKey={(row) => row.id}
            />
          </div>

          <PaginationBar
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            isLoading={notificationsQuery.isLoading}
            itemLabel="条通知"
          />
        </div>
      </div>
    </div>
  );
}
