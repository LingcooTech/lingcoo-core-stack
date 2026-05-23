import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listPublishedContent } from '@/api/content';
import { EmptyState } from '@/components/portal/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 12;

export function ContentHubPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch]);

  const query = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
    }),
    [deferredSearch, page],
  );

  const contentQuery = useQuery({
    queryKey: ['public-content', query],
    queryFn: () => listPublishedContent(query),
  });

  const items = contentQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <section className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.14em]">
            内容中心
          </p>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            文章、观点与教程
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-7">
            汇集产品动态、观点文章、操作教程与最佳实践，帮助用户更好地理解和使用平台。
          </p>
        </div>

        <div className="mt-5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索文章标题、摘要或作者..."
            className="h-10 max-w-xl"
          />
        </div>
      </section>

      {contentQuery.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="border-border bg-card rounded-xl">
              <CardContent className="space-y-3 p-5">
                <div className="bg-muted h-5 w-2/3 animate-pulse rounded" />
                <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-4/5 animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无内容"
          description="当前还没有已发布内容，请稍后再来查看。"
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/content/${item.slug}`}
              className="border-border bg-card hover:border-border block rounded-xl border p-5 shadow-sm shadow-slate-900/5 transition"
            >
              <div className="space-y-3">
                <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                  <span>{item.authorName || '匿名作者'}</span>
                  <span>{formatTime(item.publishedAt || item.createdAt)}</span>
                </div>
                <h2 className="text-foreground line-clamp-2 text-xl font-semibold tracking-tight">
                  {item.title}
                </h2>
                <p className="text-muted-foreground line-clamp-3 text-sm leading-7">
                  {item.excerpt || '暂无摘要。'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {contentQuery.data && contentQuery.data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span className="text-muted-foreground text-sm">第 {page} 页</span>
          <Button
            variant="outline"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page * PAGE_SIZE >= contentQuery.data.total}
          >
            下一页
          </Button>
        </div>
      ) : null}
    </div>
  );
}
