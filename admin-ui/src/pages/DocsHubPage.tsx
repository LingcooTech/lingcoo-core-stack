import { usePageMetadata } from '@/lib/use-page-metadata';
import { QueryErrorState } from '@/components/portal/QueryErrorState';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listPublicDocSpaces } from '@/api/docs';
import { getPublicSiteSettings } from '@/api/settings';
import { EmptyState } from '@/components/portal/EmptyState';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY, getDocsHubContent } from '@/lib/site-settings';

export function DocsHubPage() {
  usePageMetadata('文档中心');
  const docsQuery = useQuery({
    queryKey: ['public-doc-spaces'],
    queryFn: listPublicDocSpaces,
  });

  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const hub = getDocsHubContent(siteSettings);

  const items = docsQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-3 pt-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <BookOpen className="h-3.5 w-3.5" />
          {hub.eyebrow}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {hub.title}
        </h1>
        <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">{hub.description}</p>
        {items.length > 0 && (
          <p className="text-[12px] text-muted-foreground tabular-nums">
            共 {items.length} 个文档空间
          </p>
        )}
      </header>

      <Link
        to="/developers"
        className="block rounded-xl border border-border bg-card p-5 hover:border-foreground/20"
      >
        <h2 className="text-lg font-semibold">开发者中心</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          接入与交付标准、开发模板、验收清单和 AI 可读文档
        </p>
      </Link>

      {docsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoaderCircle className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : docsQuery.isError ? (
        <QueryErrorState retry={() => void docsQuery.refetch()} busy={docsQuery.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="暂无文档空间"
          description="当前还没有公开文档空间，请稍后再来查看。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((space) => (
            <Link
              key={space.id}
              to={`/docs/${space.slug}`}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 no-underline transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start gap-3">
                {space.iconUrl ? (
                  <img
                    src={space.iconUrl}
                    alt={space.title}
                    className="h-10 w-10 shrink-0 rounded-lg border border-border bg-card object-contain p-1.5"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-foreground">
                    {space.title.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                    {space.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {space.pageCount} 页文档
                  </p>
                </div>
              </div>
              <p className="line-clamp-3 text-[13px] leading-6 text-muted-foreground">
                {space.description || '该文档空间暂未补充说明。'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
