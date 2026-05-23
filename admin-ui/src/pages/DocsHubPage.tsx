import { useQuery } from '@tanstack/react-query';
import { BookOpen, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listPublicDocSpaces } from '@/api/docs';
import { EmptyState } from '@/components/portal/EmptyState';

export function DocsHubPage() {
  const docsQuery = useQuery({
    queryKey: ['public-doc-spaces'],
    queryFn: listPublicDocSpaces,
  });

  const items = docsQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-3 pt-2">
        <div className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
          <BookOpen className="h-3.5 w-3.5" />
          文档中心
        </div>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl">
          产品文档与开发指南
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[15px] leading-7">
          统一汇集 fd-core-stack 本身以及各应用的产品文档、接入说明、安装指南与常见问题。
        </p>
        {items.length > 0 && (
          <p className="text-muted-foreground text-[12px] tabular-nums">
            共 {items.length} 个文档空间
          </p>
        )}
      </header>

      {docsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoaderCircle className="text-muted-foreground h-7 w-7 animate-spin" />
        </div>
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
              className="border-border bg-card hover:border-foreground/20 group flex flex-col gap-3 rounded-xl border p-5 no-underline transition-colors"
            >
              <div className="flex items-start gap-3">
                {space.iconUrl ? (
                  <img
                    src={space.iconUrl}
                    alt={space.title}
                    className="border-border bg-card h-10 w-10 shrink-0 rounded-lg border object-contain p-1.5"
                  />
                ) : (
                  <div className="bg-muted text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
                    {space.title.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-[15px] font-semibold tracking-tight">
                    {space.title}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                    {space.pageCount} 页文档
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground line-clamp-3 text-[13px] leading-6">
                {space.description || '该文档空间暂未补充说明。'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
