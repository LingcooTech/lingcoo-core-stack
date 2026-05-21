import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { listAppsAdmin } from '@/api/apps';
import {
  createDocPage,
  createDocSpace,
  getDocSpace,
  listDocSpaces,
  updateDocPage,
  updateDocSpace,
} from '@/api/admin';
import type { DocPageTreeNode } from '@/api/types';
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
import { SectionHeader } from '@/components/shared/SectionHeader';
import { cn } from '@/lib/utils';

function flattenDocTree(
  nodes: DocPageTreeNode[],
  depth = 0,
): Array<DocPageTreeNode & { depth: number }> {
  const result: Array<DocPageTreeNode & { depth: number }> = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    result.push(...flattenDocTree(node.children, depth + 1));
  }
  return result;
}

const EMPTY_SPACE_FORM = {
  slug: '',
  title: '',
  description: '',
  iconUrl: '',
  type: 'product' as 'product' | 'app' | 'internal',
  appId: '',
  sortOrder: '0',
  status: 'active' as 'active' | 'hidden' | 'archived',
};

const EMPTY_PAGE_FORM = {
  title: '',
  slug: '',
  summary: '',
  content: '',
  parentId: '',
  sortOrder: '0',
  status: 'draft' as 'draft' | 'published' | 'archived',
  publishedAt: '',
};

export function DocsPage() {
  const qc = useQueryClient();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [spaceForm, setSpaceForm] = useState(EMPTY_SPACE_FORM);
  const [pageForm, setPageForm] = useState(EMPTY_PAGE_FORM);

  const spaceListQuery = useQuery({
    queryKey: ['admin-doc-spaces'],
    queryFn: () => listDocSpaces(),
  });
  const appsQuery = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });
  const selectedSpaceQuery = useQuery({
    queryKey: ['admin-doc-space', selectedSpaceId],
    queryFn: () => getDocSpace(selectedSpaceId!),
    enabled: Boolean(selectedSpaceId),
  });

  useEffect(() => {
    const firstId = spaceListQuery.data?.items[0]?.id;
    if (!selectedSpaceId && firstId) {
      setSelectedSpaceId(firstId);
    }
  }, [selectedSpaceId, spaceListQuery.data?.items]);

  useEffect(() => {
    if (!selectedSpaceQuery.data?.space) {
      if (!selectedSpaceId) {
        setSpaceForm(EMPTY_SPACE_FORM);
      }
      return;
    }

    const space = selectedSpaceQuery.data.space;
    setSpaceForm({
      slug: space.slug,
      title: space.title,
      description: space.description ?? '',
      iconUrl: space.iconUrl ?? '',
      type: space.type,
      appId: space.appId ?? '',
      sortOrder: String(space.sortOrder),
      status: space.status,
    });
  }, [selectedSpaceId, selectedSpaceQuery.data?.space]);

  useEffect(() => {
    if (!selectedSpaceQuery.data?.pages?.length) {
      setSelectedPageId(null);
      setPageForm(EMPTY_PAGE_FORM);
      return;
    }

    const currentPage = selectedSpaceQuery.data.pages.find((page) => page.id === selectedPageId);
    if (currentPage) {
      return;
    }

    setSelectedPageId(selectedSpaceQuery.data.pages[0].id);
  }, [selectedPageId, selectedSpaceQuery.data?.pages]);

  useEffect(() => {
    const currentPage = selectedSpaceQuery.data?.pages?.find((page) => page.id === selectedPageId);
    if (!currentPage) {
      if (!selectedPageId) {
        setPageForm(EMPTY_PAGE_FORM);
      }
      return;
    }

    setPageForm({
      title: currentPage.title,
      slug: currentPage.slug,
      summary: currentPage.summary ?? '',
      content: currentPage.content,
      parentId: currentPage.parentId ?? '',
      sortOrder: String(currentPage.sortOrder),
      status: currentPage.status,
      publishedAt: currentPage.publishedAt ? currentPage.publishedAt.slice(0, 16) : '',
    });
  }, [selectedPageId, selectedSpaceQuery.data?.pages]);

  const flatTree = useMemo(
    () => flattenDocTree(selectedSpaceQuery.data?.tree ?? []),
    [selectedSpaceQuery.data?.tree],
  );

  const saveSpaceMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        slug: spaceForm.slug,
        title: spaceForm.title,
        description: spaceForm.description || undefined,
        iconUrl: spaceForm.iconUrl || undefined,
        type: spaceForm.type,
        appId: spaceForm.appId || undefined,
        sortOrder: Number.parseInt(spaceForm.sortOrder || '0', 10) || 0,
        status: spaceForm.status,
      };

      return selectedSpaceId ? updateDocSpace(selectedSpaceId, payload) : createDocSpace(payload);
    },
    onSuccess: async (space: any) => {
      toast.success(selectedSpaceId ? '文档空间已保存' : '文档空间已创建');
      await qc.invalidateQueries({ queryKey: ['admin-doc-spaces'] });
      setSelectedSpaceId(space.id);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存文档空间失败'),
  });

  const savePageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSpaceId) {
        throw new Error('请先创建或选择文档空间');
      }

      const payload = {
        spaceId: selectedSpaceId,
        parentId: pageForm.parentId || undefined,
        slug: pageForm.slug,
        title: pageForm.title,
        summary: pageForm.summary || undefined,
        content: pageForm.content,
        sortOrder: Number.parseInt(pageForm.sortOrder || '0', 10) || 0,
        status: pageForm.status,
        publishedAt: pageForm.publishedAt
          ? new Date(pageForm.publishedAt).toISOString()
          : undefined,
      };

      return selectedPageId ? updateDocPage(selectedPageId, payload) : createDocPage(payload);
    },
    onSuccess: async (page: any) => {
      toast.success(selectedPageId ? '文档页面已保存' : '文档页面已创建');
      await qc.invalidateQueries({ queryKey: ['admin-doc-space', selectedSpaceId] });
      setSelectedPageId(page.id);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存文档页面失败'),
  });

  return (
    <div>
      <SectionHeader sectionKey="docs" />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '文档空间', value: String(spaceListQuery.data?.items.length ?? 0) },
            { label: '当前空间页面数', value: String(selectedSpaceQuery.data?.pages.length ?? 0) },
            {
              label: '已发布页面',
              value: String(
                selectedSpaceQuery.data?.pages.filter((page) => page.status === 'published')
                  .length ?? 0,
              ),
            },
            {
              label: '已关联应用',
              value: String(spaceListQuery.data?.items.filter((space) => space.appId).length ?? 0),
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
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px,minmax(0,1fr)]">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">文档空间</CardTitle>
                  <CardDescription>每个产品或应用一个文档空间。</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedSpaceId(null);
                    setSelectedPageId(null);
                    setSpaceForm(EMPTY_SPACE_FORM);
                    setPageForm(EMPTY_PAGE_FORM);
                  }}
                >
                  新建
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(spaceListQuery.data?.items ?? []).map((space) => (
                <button
                  key={space.id}
                  type="button"
                  className={cn(
                    'w-full rounded-xl border px-3 py-3 text-left transition',
                    selectedSpaceId === space.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-border bg-card hover:border-border hover:bg-muted',
                  )}
                  onClick={() => {
                    setSelectedSpaceId(space.id);
                    setSelectedPageId(null);
                  }}
                >
                  <p className="text-sm font-semibold">{space.title}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      selectedSpaceId === space.id ? 'text-white/70' : 'text-muted-foreground',
                    )}
                  >
                    /docs/{space.slug} · {space.pageCount} pages
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border bg-card shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {selectedSpaceId ? '编辑文档空间' : '新建文档空间'}
                    </CardTitle>
                    <CardDescription>定义文档空间的基础信息和关联应用。</CardDescription>
                  </div>
                  {selectedSpaceQuery.data?.space ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to={`/docs/${selectedSpaceQuery.data.space.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        预览
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>标题</Label>
                    <Input
                      value={spaceForm.title}
                      onChange={(event) =>
                        setSpaceForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>slug</Label>
                    <Input
                      value={spaceForm.slug}
                      onChange={(event) =>
                        setSpaceForm((prev) => ({ ...prev, slug: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select
                      value={spaceForm.type}
                      onValueChange={(value) =>
                        setSpaceForm((prev) => ({ ...prev, type: value as typeof prev.type }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">产品</SelectItem>
                        <SelectItem value="app">应用</SelectItem>
                        <SelectItem value="internal">内部</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>状态</Label>
                    <Select
                      value={spaceForm.status}
                      onValueChange={(value) =>
                        setSpaceForm((prev) => ({ ...prev, status: value as typeof prev.status }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">启用</SelectItem>
                        <SelectItem value="hidden">隐藏</SelectItem>
                        <SelectItem value="archived">归档</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>排序</Label>
                    <Input
                      value={spaceForm.sortOrder}
                      onChange={(event) =>
                        setSpaceForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>关联应用</Label>
                  <Select
                    value={spaceForm.appId || '__none__'}
                    onValueChange={(value) =>
                      setSpaceForm((prev) => ({
                        ...prev,
                        appId: value === '__none__' ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">不关联应用</SelectItem>
                      {(appsQuery.data?.items ?? []).map((app) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>图标 URL</Label>
                  <Input
                    value={spaceForm.iconUrl}
                    onChange={(event) =>
                      setSpaceForm((prev) => ({ ...prev, iconUrl: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea
                    rows={3}
                    value={spaceForm.description}
                    onChange={(event) =>
                      setSpaceForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>

                <Button
                  onClick={() => saveSpaceMutation.mutate()}
                  disabled={saveSpaceMutation.isPending}
                >
                  {saveSpaceMutation.isPending ? '保存中...' : '保存文档空间'}
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[280px,minmax(0,1fr)]">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">页面树</CardTitle>
                      <CardDescription>维护左侧目录结构。</CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedSpaceId}
                      onClick={() => {
                        setSelectedPageId(null);
                        setPageForm(EMPTY_PAGE_FORM);
                      }}
                    >
                      新建
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {flatTree.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      className={cn(
                        'block w-full rounded-xl px-3 py-2 text-left transition',
                        selectedPageId === page.id ? 'bg-slate-900 text-white' : 'hover:bg-muted',
                      )}
                      style={{ paddingLeft: `${12 + page.depth * 14}px` }}
                      onClick={() => setSelectedPageId(page.id)}
                    >
                      <p className="text-sm font-medium">{page.title}</p>
                      <p
                        className={cn(
                          'mt-0.5 text-[11px]',
                          selectedPageId === page.id ? 'text-white/70' : 'text-muted-foreground',
                        )}
                      >
                        {page.path}
                      </p>
                    </button>
                  ))}
                  {flatTree.length === 0 ? (
                    <p className="text-muted-foreground text-sm">当前空间还没有文档页面。</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    {selectedPageId ? '编辑文档页面' : '新建文档页面'}
                  </CardTitle>
                  <CardDescription>Markdown 正文会用于前台文档详情页展示。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>标题</Label>
                      <Input
                        value={pageForm.title}
                        onChange={(event) =>
                          setPageForm((prev) => ({ ...prev, title: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>slug</Label>
                      <Input
                        value={pageForm.slug}
                        onChange={(event) =>
                          setPageForm((prev) => ({ ...prev, slug: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>父级页面</Label>
                      <Select
                        value={pageForm.parentId || '__root__'}
                        onValueChange={(value) =>
                          setPageForm((prev) => ({
                            ...prev,
                            parentId: value === '__root__' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__root__">根级页面</SelectItem>
                          {flatTree
                            .filter((page) => page.id !== selectedPageId)
                            .map((page) => (
                              <SelectItem key={page.id} value={page.id}>
                                {page.title}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>状态</Label>
                      <Select
                        value={pageForm.status}
                        onValueChange={(value) =>
                          setPageForm((prev) => ({ ...prev, status: value as typeof prev.status }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">草稿</SelectItem>
                          <SelectItem value="published">已发布</SelectItem>
                          <SelectItem value="archived">归档</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>排序</Label>
                      <Input
                        value={pageForm.sortOrder}
                        onChange={(event) =>
                          setPageForm((prev) => ({ ...prev, sortOrder: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>摘要</Label>
                    <Textarea
                      rows={3}
                      value={pageForm.summary}
                      onChange={(event) =>
                        setPageForm((prev) => ({ ...prev, summary: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>正文内容</Label>
                    <Textarea
                      rows={22}
                      className="font-mono text-sm"
                      value={pageForm.content}
                      onChange={(event) =>
                        setPageForm((prev) => ({ ...prev, content: event.target.value }))
                      }
                    />
                  </div>

                  <Button
                    onClick={() => savePageMutation.mutate()}
                    disabled={savePageMutation.isPending || !selectedSpaceId}
                  >
                    {savePageMutation.isPending ? '保存中...' : '保存文档页面'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
