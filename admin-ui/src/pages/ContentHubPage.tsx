import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listPublishedContent } from '@/api/content';
import { getPublicSiteSettings } from '@/api/settings';
import { EmptyState } from '@/components/portal/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY, getContentHubContent } from '@/lib/site-settings';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 12;

export function ContentHubPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch]);

  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const hub = getContentHubContent(siteSettings);

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
  const total = contentQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header className="space-y-3 pt-2">
        <div className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
          <FileText className="h-3.5 w-3.5" />
          {hub.eyebrow}
        </div>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl">
          {hub.title}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[15px] leading-7">{hub.description}</p>
      </header>

      <div className="border-border bg-card/50 sticky top-12 z-10 -mx-1 flex items-center gap-3 border-b px-1 py-2 backdrop-blur-md">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground/60 pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索文章标题、摘要或作者..."
            className="h-9 pl-9 text-[13px]"
          />
        </div>
        {total > 0 && (
          <span className="text-muted-foreground shrink-0 text-[12px] tabular-nums">
            共 {total} 篇
          </span>
        )}
      </div>

      {contentQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="border-border bg-card rounded-xl border p-5">
              <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
              <div className="bg-muted mt-3 h-5 w-3/4 animate-pulse rounded" />
              <div className="bg-muted mt-3 h-3 w-full animate-pulse rounded" />
              <div className="bg-muted mt-2 h-3 w-4/5 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search ? '没找到匹配的内容' : '暂无内容'}
          description={
            search
              ? `"${search}" 没有命中已发布的内容，换个关键词试试。`
              : '当前还没有已发布内容，请稍后再来查看。'
          }
          action={
            search ? (
              <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                清除搜索
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/content/${item.slug}`}
              className="border-border bg-card hover:border-foreground/20 group flex flex-col gap-3 rounded-xl border p-5 no-underline transition-colors"
            >
              <div className="text-muted-foreground flex items-center justify-between gap-3 text-[11px] tabular-nums">
                <span className="truncate">{item.authorName || '匿名作者'}</span>
                <span className="shrink-0">{formatTime(item.publishedAt || item.createdAt)}</span>
              </div>
              <h2 className="text-foreground line-clamp-2 text-[16px] font-semibold leading-snug tracking-tight">
                {item.title}
              </h2>
              <p className="text-muted-foreground line-clamp-3 flex-1 text-[13px] leading-6">
                {item.excerpt || '暂无摘要。'}
              </p>
              <div className="text-muted-foreground/60 group-hover:text-foreground inline-flex items-center gap-1 text-[11px] font-medium transition-colors">
                阅读全文
                <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="text-muted-foreground flex items-center justify-center gap-4 text-[12px] tabular-nums">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span>
            第 {page} / {totalPages} 页
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page >= totalPages}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
