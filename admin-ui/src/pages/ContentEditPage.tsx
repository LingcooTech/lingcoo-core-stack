import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { createContent, getContent, updateContent } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type ContentStatus = 'draft' | 'published' | 'archived';
type ContentSourceType = 'manual' | 'wordpress' | 'notion' | 'wechat';

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverUrl: '',
  authorName: '',
  status: 'draft' as ContentStatus,
  sourceType: 'manual' as ContentSourceType,
  sourceId: '',
  sourceUrl: '',
};

export function ContentEditPage() {
  const { contentId } = useParams<{ contentId: string }>();
  const isCreateMode = !contentId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);

  const contentQuery = useQuery({
    queryKey: ['admin-content-item', contentId],
    queryFn: () => getContent(contentId!),
    enabled: Boolean(contentId),
  });

  useEffect(() => {
    if (!contentQuery.data) {
      return;
    }

    setForm({
      title: contentQuery.data.title,
      slug: contentQuery.data.slug,
      excerpt: contentQuery.data.excerpt ?? '',
      content: contentQuery.data.content,
      coverUrl: contentQuery.data.coverUrl ?? '',
      authorName: contentQuery.data.authorName ?? '',
      status: contentQuery.data.status,
      sourceType: contentQuery.data.sourceType,
      sourceId: contentQuery.data.sourceId ?? '',
      sourceUrl: contentQuery.data.sourceUrl ?? '',
    });
  }, [contentQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        sourceType: form.sourceType,
        status: form.status,
      };

      return isCreateMode
        ? createContent(payload)
        : updateContent(contentId!, payload);
    },
    onSuccess: async (item) => {
      toast.success(isCreateMode ? '内容已创建' : '内容已保存');
      await qc.invalidateQueries({ queryKey: ['admin-content'] });
      navigate(`/admin/content/${item.id}/edit`, { replace: true });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存失败'),
  });

  return (
    <div className="space-y-4">
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {isCreateMode ? '新建内容' : '编辑内容'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              支持手动创建内容，也支持对导入内容做二次编辑。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/content">返回列表</Link>
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? '保存中...' : '保存内容'}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-6">
        <Card className="border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>标题、slug、来源和发布状态。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>标题</Label>
                <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>slug</Label>
                <Input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ContentStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="published">已发布</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>来源类型</Label>
                <Select
                  value={form.sourceType}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, sourceType: value as ContentSourceType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">手动</SelectItem>
                    <SelectItem value="wordpress">WordPress</SelectItem>
                    <SelectItem value="notion">Notion</SelectItem>
                    <SelectItem value="wechat">微信公众号</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>作者</Label>
                <Input value={form.authorName} onChange={(event) => setForm((prev) => ({ ...prev, authorName: event.target.value }))} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>来源 ID</Label>
                <Input value={form.sourceId} onChange={(event) => setForm((prev) => ({ ...prev, sourceId: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>来源链接</Label>
                <Input value={form.sourceUrl} onChange={(event) => setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>封面图</Label>
              <Input value={form.coverUrl} onChange={(event) => setForm((prev) => ({ ...prev, coverUrl: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>摘要</Label>
              <Textarea
                rows={4}
                value={form.excerpt}
                onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>正文内容</CardTitle>
            <CardDescription>当前阶段直接维护 Markdown / HTML 正文。</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={22}
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
