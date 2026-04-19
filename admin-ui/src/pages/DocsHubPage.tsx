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
      <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5">
        <div className="space-y-2">
          <p className="text-sm font-medium text-sky-700">文档中心</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">产品文档与开发指南</h1>
          <p className="max-w-2xl text-sm leading-7 text-slate-600">
            统一汇集 fd-core-stack 本身以及各应用的产品文档、接入说明、安装指南与常见问题。
          </p>
        </div>
      </section>

      {docsQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
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
              className="block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <Card className="border-0 shadow-none">
                <CardContent className="space-y-3 p-0">
                  <div className="flex items-center gap-3">
                    {space.iconUrl ? (
                      <img src={space.iconUrl} alt={space.title} className="h-10 w-10 rounded-xl border border-gray-200 bg-white object-contain p-1.5" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">
                        {space.title.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold tracking-tight text-slate-900">{space.title}</p>
                      <p className="text-xs uppercase tracking-wider text-slate-400">{space.pageCount} pages</p>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-sm leading-7 text-slate-600">{space.description || '该文档空间暂未补充说明。'}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
