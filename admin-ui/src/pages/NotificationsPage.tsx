import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listAdminNotifications, publishAnnouncement } from '@/api/admin';
import type { AdminNotificationItem } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTableState } from '@/hooks/useTableState';
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
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: PAGE_SIZE,
    knownFilters: ['status', 'category'],
  });
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);
  const categoryValues = useMemo(() => filters.category ?? [], [filters.category]);
  const deferredSearch = useDeferredValue(search);

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    level: 'info' as 'info' | 'success' | 'warning' | 'error',
    ctaLabel: '',
    ctaUrl: '',
  });

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      // 后端单值，多选时取首项
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
          <p className="text-foreground text-sm font-semibold">{row.title}</p>
          <p className="text-muted-foreground line-clamp-2 text-sm">{row.body}</p>
          {typeof row.meta?.broadcastId === 'string' ? (
            <p className="text-muted-foreground font-mono text-[10px]">
              广播 ID: {row.meta.broadcastId}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'user',
      header: '接收用户',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-foreground text-sm font-medium">{row.user?.email ?? '—'}</p>
          {row.user?.displayName ? (
            <p className="text-muted-foreground text-xs">{row.user.displayName}</p>
          ) : null}
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
          <p className="text-muted-foreground text-[11px]">{row.sourceEventName ?? 'manual'}</p>
        </div>
      ),
    },
    {
      key: 'time',
      header: '时间',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-foreground text-xs">{formatTime(row.createdAt)}</p>
          <p className="text-muted-foreground text-[11px]">
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
              <a
                href={row.ctaUrl}
                target={row.ctaUrl.startsWith('/') ? undefined : '_blank'}
                rel="noreferrer"
              >
                {row.ctaLabel}
              </a>
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">无 CTA</span>
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
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">发布公告</CardTitle>
              <CardDescription>
                发布后会作为站内通知发送给所有活跃用户，并直接出现在用户消息中心。
              </CardDescription>
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
              {
                label: '当前页未读',
                value: String(items.filter((item) => item.status === 'unread').length),
                note: '当前页里尚未被用户读取的通知',
              },
              {
                label: '当前页公告',
                value: String(items.filter((item) => item.category === 'announcement').length),
                note: '当前页里来自后台公告广播的通知',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="border-border bg-card rounded-xl border px-4 py-4 shadow-sm"
              >
                <p className="text-muted-foreground text-sm font-medium">{item.label}</p>
                <p className="text-foreground mt-1.5 text-[1.75rem] font-semibold tracking-tight">
                  {item.value}
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-foreground text-lg font-semibold">通知记录</h2>
              <p className="text-muted-foreground text-sm">
                查看系统发出的用户通知，包括事件通知和管理员公告。
              </p>
            </div>
          </div>

          <FilterChipBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="搜索标题、正文、用户邮箱..."
            chips={
              [
                {
                  id: 'category',
                  label: '分类',
                  values: categoryValues,
                  onChange: (next) => setFilter('category', next),
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
                  label: '状态',
                  values: statusValues,
                  onChange: (next) => setFilter('status', next),
                  options: [
                    { value: 'unread', label: '未读' },
                    { value: 'read', label: '已读' },
                    { value: 'archived', label: '已归档' },
                  ],
                },
              ] satisfies FilterChipConfig[]
            }
            onClearAll={clearFilters}
          />

          <div className="border-border bg-card overflow-hidden rounded-lg border">
            <DataTable
              columns={columns}
              data={items}
              isLoading={notificationsQuery.isLoading}
              emptyMessage="暂无通知记录"
              getRowId={(row) => row.id}
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
