import { usePageMetadata } from '@/lib/use-page-metadata';
import { QueryErrorState } from '@/components/portal/QueryErrorState';
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
  usePageMetadata('内容中心');
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
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <FileText className="h-3.5 w-3.5" />
          {hub.eyebrow}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {hub.title}
        </h1>
        <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">{hub.description}</p>
      </header>

      <div className="sticky top-12 z-10 -mx-1 flex items-center gap-3 border-b border-border bg-card/50 px-1 py-2 backdrop-blur-md">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索文章标题、摘要或作者"
            placeholder="搜索文章标题、摘要或作者..."
            className="h-9 pl-9 text-[13px]"
          />
        </div>
        {total > 0 && (
          <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
            共 {total} 篇
          </span>
        )}
      </div>

      {contentQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-5">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : contentQuery.isError ? (
        <QueryErrorState retry={() => void contentQuery.refetch()} busy={contentQuery.isFetching} />
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
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 no-underline transition-colors hover:border-foreground/20"
            >
              <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground tabular-nums">
                <span className="truncate">{item.authorName || '匿名作者'}</span>
                <span className="shrink-0">{formatTime(item.publishedAt || item.createdAt)}</span>
              </div>
              <h2 className="line-clamp-2 text-[16px] leading-snug font-semibold tracking-tight text-foreground">
                {item.title}
              </h2>
              <p className="line-clamp-3 flex-1 text-[13px] leading-6 text-muted-foreground">
                {item.excerpt || '暂无摘要。'}
              </p>
              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                阅读全文
                <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 text-[12px] text-muted-foreground tabular-nums">
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
