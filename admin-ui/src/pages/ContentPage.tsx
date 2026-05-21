import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  importNotionContent,
  importWechatContent,
  importWordPressContent,
  listContent,
} from '@/api/admin';
import type { ContentItem } from '@/api/types';
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
import { useTableState } from '@/hooks/useTableState';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

function getSourceLabel(sourceType: ContentItem['sourceType']) {
  switch (sourceType) {
    case 'wordpress':
      return 'WordPress';
    case 'notion':
      return 'Notion';
    case 'wechat':
      return '微信公众号';
    case 'manual':
    default:
      return '手动';
  }
}

function getStatusTone(status: ContentItem['status']) {
  if (status === 'published') return 'ok' as const;
  if (status === 'draft') return 'warn' as const;
  return 'neutral' as const;
}

export function ContentPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: PAGE_SIZE,
    knownFilters: ['sourceType', 'status'],
  });
  const sourceTypeValues = useMemo(() => filters.sourceType ?? [], [filters.sourceType]);
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);
  const deferredSearch = useDeferredValue(search);

  const [wpForm, setWpForm] = useState({
    postUrl: '',
    status: 'draft' as 'draft' | 'published',
  });
  const [notionForm, setNotionForm] = useState({
    pageUrl: '',
    status: 'draft' as 'draft' | 'published',
  });
  const [wechatForm, setWechatForm] = useState({
    url: '',
    status: 'draft' as 'draft' | 'published',
  });

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      // 后端单值，多选时取首项
      sourceType: sourceTypeValues[0] as 'manual' | 'wordpress' | 'notion' | 'wechat' | undefined,
      status: statusValues[0] as 'draft' | 'published' | 'archived' | undefined,
    }),
    [deferredSearch, page, sourceTypeValues, statusValues],
  );

  const contentQuery = useQuery({
    queryKey: ['admin-content', query],
    queryFn: () => listContent(query),
  });

  const items = contentQuery.data?.items ?? [];
  const total = contentQuery.data?.total ?? 0;
  const draftCount = items.filter((item) => item.status === 'draft').length;
  const publishedCount = items.filter((item) => item.status === 'published').length;
  const importedCount = items.filter((item) => item.importedAt).length;

  const invalidateContent = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-content'] });
  };

  const importWordPressMutation = useMutation({
    mutationFn: importWordPressContent,
    onSuccess: async (item) => {
      toast.success(`已导入 WordPress 文章：${item.title}`);
      await invalidateContent();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'WordPress 导入失败'),
  });

  const importNotionMutation = useMutation({
    mutationFn: importNotionContent,
    onSuccess: async (item) => {
      toast.success(`已导入 Notion 页面：${item.title}`);
      await invalidateContent();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Notion 导入失败'),
  });

  const importWechatMutation = useMutation({
    mutationFn: importWechatContent,
    onSuccess: async (item) => {
      toast.success(`已导入微信公众号文章：${item.title}`);
      await invalidateContent();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '微信公众号导入失败'),
  });

  const columns: Column<ContentItem>[] = [
    {
      key: 'title',
      header: '内容',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{row.title}</p>
          <p className="text-muted-foreground font-mono text-[11px]">{row.slug}</p>
          {row.excerpt ? (
            <p className="line-clamp-2 text-sm text-slate-600">{row.excerpt}</p>
          ) : null}
        </div>
      ),
      className: 'min-w-[360px]',
    },
    {
      key: 'source',
      header: '来源',
      cell: (row) => (
        <div className="space-y-1">
          <StatusPill tone="info" label={getSourceLabel(row.sourceType)} />
          {row.authorName ? (
            <p className="text-muted-foreground text-xs">{row.authorName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => <StatusPill tone={getStatusTone(row.status)} label={row.status} />,
    },
    {
      key: 'publishedAt',
      header: '发布时间',
      cell: (row) => <span className="text-xs text-slate-700">{formatTime(row.publishedAt)}</span>,
    },
    {
      key: 'importedAt',
      header: '导入时间',
      cell: (row) => (
        <span className="text-xs text-slate-700">
          {formatTime(row.importedAt || row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/admin/content/${row.id}/edit`)}
          >
            编辑
          </Button>
          {row.sourceUrl ? (
            <Button size="sm" variant="ghost" asChild>
              <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
                原文
              </a>
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader sectionKey="content" />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '内容总数', value: String(total) },
            { label: '草稿', value: String(draftCount) },
            { label: '已发布', value: String(publishedCount) },
            { label: '已导入', value: String(importedCount) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm"
            >
              <p className="text-sm font-medium text-gray-500">{item.label}</p>
              <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-gray-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">导入与管理</h2>
            <p className="text-muted-foreground text-sm">
              支持导入外部内容，也支持手动创建本地内容。
            </p>
          </div>
          <Button asChild>
            <Link to="/admin/content/new">新建内容</Link>
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">导入 WordPress</CardTitle>
              <CardDescription>
                系统会使用“系统设置”中的 WordPress 连接配置，这里只需输入文章 URL。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>文章 URL</Label>
                <Input
                  placeholder="https://your-site.com/post-slug"
                  value={wpForm.postUrl}
                  onChange={(event) =>
                    setWpForm((prev) => ({ ...prev, postUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>导入状态</Label>
                <Select
                  value={wpForm.status}
                  onValueChange={(value) =>
                    setWpForm((prev) => ({ ...prev, status: value as typeof prev.status }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">保存为草稿</SelectItem>
                    <SelectItem value="published">直接发布</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={importWordPressMutation.isPending}
                onClick={() => importWordPressMutation.mutate(wpForm)}
              >
                {importWordPressMutation.isPending ? '导入中...' : '导入 WordPress 文章'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">导入 Notion</CardTitle>
              <CardDescription>
                系统会使用“系统设置”中的 Notion Token，这里只需输入页面 URL。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>页面 URL</Label>
                <Input
                  placeholder="https://www.notion.so/..."
                  value={notionForm.pageUrl}
                  onChange={(event) =>
                    setNotionForm((prev) => ({ ...prev, pageUrl: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>导入状态</Label>
                <Select
                  value={notionForm.status}
                  onValueChange={(value) =>
                    setNotionForm((prev) => ({ ...prev, status: value as typeof prev.status }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">保存为草稿</SelectItem>
                    <SelectItem value="published">直接发布</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={importNotionMutation.isPending}
                onClick={() => importNotionMutation.mutate(notionForm)}
              >
                {importNotionMutation.isPending ? '导入中...' : '导入 Notion 页面'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">导入微信公众号</CardTitle>
              <CardDescription>
                输入公众号文章链接，系统会抓取标题、摘要和正文 HTML。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>公众号文章 URL</Label>
                <Input
                  placeholder="https://mp.weixin.qq.com/s/..."
                  value={wechatForm.url}
                  onChange={(event) =>
                    setWechatForm((prev) => ({ ...prev, url: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>导入状态</Label>
                <Select
                  value={wechatForm.status}
                  onValueChange={(value) =>
                    setWechatForm((prev) => ({ ...prev, status: value as typeof prev.status }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">保存为草稿</SelectItem>
                    <SelectItem value="published">直接发布</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={importWechatMutation.isPending}
                onClick={() => importWechatMutation.mutate(wechatForm)}
              >
                {importWechatMutation.isPending ? '导入中...' : '导入微信公众号文章'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <FilterChipBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="搜索标题、slug、作者、来源链接..."
            chips={
              [
                {
                  id: 'sourceType',
                  label: '来源',
                  values: sourceTypeValues,
                  onChange: (next) => setFilter('sourceType', next),
                  options: [
                    { value: 'wordpress', label: 'WordPress' },
                    { value: 'notion', label: 'Notion' },
                    { value: 'wechat', label: '微信公众号' },
                  ],
                },
                {
                  id: 'status',
                  label: '状态',
                  values: statusValues,
                  onChange: (next) => setFilter('status', next),
                  options: [
                    { value: 'draft', label: '草稿' },
                    { value: 'published', label: '已发布' },
                    { value: 'archived', label: '已归档' },
                  ],
                },
              ] satisfies FilterChipConfig[]
            }
            onClearAll={clearFilters}
          />

          <div className="border-border overflow-hidden rounded-xl border bg-white">
            <DataTable
              columns={columns}
              data={items}
              isLoading={contentQuery.isLoading}
              emptyMessage="暂无内容"
              getRowId={(row) => row.id}
            />
          </div>

          <PaginationBar
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            isLoading={contentQuery.isLoading}
            itemLabel="篇内容"
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
