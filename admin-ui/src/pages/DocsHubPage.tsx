import { useQuery } from '@tanstack/react-query';
import { BookOpen, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listPublicDocSpaces } from '@/api/docs';
import { EmptyState } from '@/components/portal/EmptyState';
import { Card, CardContent } from '@/components/ui/card';

export function DocsHubPage() {
  const docsQuery = useQuery({
    queryKey: ['public-doc-spaces'],
    queryFn: listPublicDocSpaces,
  });

  const items = docsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <section className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.14em]">
            文档中心
          </p>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            产品文档与开发指南
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-7">
            统一汇集 fd-core-stack 本身以及各应用的产品文档、接入说明、安装指南与常见问题。
          </p>
        </div>
      </section>

      {docsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoaderCircle className="text-primary h-8 w-8 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="暂无文档空间"
          description="当前还没有公开文档空间，请稍后再来查看。"
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((space) => (
            <Link
              key={space.id}
              to={`/docs/${space.slug}`}
              className="border-border bg-card hover:border-border block rounded-xl border p-5 shadow-sm shadow-slate-900/5 transition"
            >
              <Card className="border-0 shadow-none">
                <CardContent className="space-y-3 p-0">
                  <div className="flex items-center gap-3">
                    {space.iconUrl ? (
                      <img
                        src={space.iconUrl}
                        alt={space.title}
                        className="border-border bg-card h-10 w-10 rounded-xl border object-contain p-1.5"
                      />
                    ) : (
                      <div className="bg-muted text-foreground flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold">
                        {space.title.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-lg font-semibold tracking-tight">
                        {space.title}
                      </p>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider">
                        {space.pageCount} pages
                      </p>
                    </div>
                  </div>
                  <p className="text-muted-foreground line-clamp-3 text-sm leading-7">
                    {space.description || '该文档空间暂未补充说明。'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
