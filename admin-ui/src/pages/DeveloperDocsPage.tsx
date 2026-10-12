import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { QueryErrorState } from '@/components/portal/QueryErrorState';
import { Skeleton } from '@/components/shared/Skeleton';
import { usePageMetadata } from '@/lib/use-page-metadata';

const indexSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      path: z.string(),
      url: z.string(),
      sha256: z.string(),
      content: z.string().optional(),
    }),
  ),
});

export function DeveloperDocsPage() {
  usePageMetadata('开发者中心');
  const { documentId = 'quickstart' } = useParams();
  const query = useQuery({
    queryKey: ['developer-documentation'],
    queryFn: async () => {
      const response = await fetch('/developer-docs/index.json');
      if (!response.ok) throw new Error('开发文档加载失败');
      return indexSchema.parse(await response.json());
    },
    staleTime: 60_000,
  });
  const documents = query.data?.items.filter((item) => item.content !== undefined) ?? [];
  const current = documents.find((item) => item.id === documentId);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">开发者中心</h1>
          <p className="mt-2 text-sm text-muted-foreground">应用接入、版本发布与交付验收</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/docs">文档中心</Link>
        </Button>
      </header>
      {query.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : query.isError ? (
        <QueryErrorState retry={() => void query.refetch()} busy={query.isFetching} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="开发文档" className="space-y-1">
            {documents.map((item) => (
              <Link
                key={item.id}
                to={`/developers/${item.id}`}
                aria-current={item.id === documentId ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-sm ${item.id === documentId ? 'bg-muted font-semibold' : 'hover:bg-muted/60'}`}
              >
                {item.title}
              </Link>
            ))}
            <a
              className="block px-3 py-2 text-sm text-muted-foreground underline"
              href="/developer-docs/index.json"
            >
              AI 读取索引（JSON）
            </a>
          </nav>
          {current ? (
            <article className="min-w-0 rounded-xl border border-border bg-card p-5 md:p-8">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <span className="text-xs text-muted-foreground">
                  交付定义版本 1 · 文档随平台发布
                </span>
                <Button variant="outline" size="sm" asChild>
                  <a href={current.url}>原始 Markdown</a>
                </Button>
              </div>
              <div className="content-body max-w-none overflow-x-auto">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) => {
                      if (!href || /^(https?:|#|\/)/.test(href))
                        return <a href={href}>{children}</a>;
                      const url = new URL(
                        href,
                        `https://docs.invalid/developer-docs/${current.path}`,
                      );
                      const target = query.data.items.find((item) => item.url === url.pathname);
                      return target?.content !== undefined ? (
                        <Link to={`/developers/${target.id}${url.hash}`}>{children}</Link>
                      ) : (
                        <a href={url.pathname + url.hash}>{children}</a>
                      );
                    },
                  }}
                >
                  {current.content}
                </ReactMarkdown>
              </div>
            </article>
          ) : (
            <div>
              <p>未找到该开发文档。</p>
              <Link to="/developers">返回开发接入指南</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
