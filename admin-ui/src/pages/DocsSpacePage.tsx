import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, FileText, LoaderCircle } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { getPublicDocPage } from '@/api/docs';
import type { DocPageTreeNode } from '@/api/types';
import { EmptyState } from '@/components/portal/EmptyState';
import { Button } from '@/components/ui/button';
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

function extractToc(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#{2,4}\s+/.test(line))
    .map((line) => {
      const matched = line.match(/^(#{2,4})\s+(.+)$/);
      const level = matched?.[1]?.length ?? 2;
      const text = matched?.[2]?.trim() ?? '';
      const id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return { level, text, id };
    })
    .filter((item) => item.text && item.id);
}

function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function DocsSpacePage() {
  const params = useParams<{ spaceSlug: string; '*': string }>();
  const location = useLocation();
  const currentPath = params['*']?.trim() || '';

  const pageQuery = useQuery({
    queryKey: ['public-doc-page', params.spaceSlug, currentPath],
    queryFn: () => getPublicDocPage(params.spaceSlug ?? '', currentPath),
    enabled: Boolean(params.spaceSlug),
  });

  const toc = useMemo(
    () => (pageQuery.data?.page?.content ? extractToc(pageQuery.data.page.content) : []),
    [pageQuery.data?.page?.content],
  );

  if (pageQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="text-primary h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!pageQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild className="text-muted-foreground px-0">
          <Link to="/docs">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回文档中心
          </Link>
        </Button>
        <EmptyState icon={FileText} title="文档不存在" description="当前文档空间或页面不存在。" />
      </div>
    );
  }

  const { space, tree, page, previousPage, nextPage } = pageQuery.data;
  const flatTree = flattenDocTree(tree);

  return (
    <div className="space-y-5">
      <Button variant="ghost" asChild className="text-muted-foreground px-0">
        <Link to="/docs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回文档中心
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-[260px,minmax(0,1fr),220px]">
        <aside className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border border-b px-4 py-4">
            <p className="text-foreground text-sm font-semibold">{space.title}</p>
            {space.description ? (
              <p className="text-muted-foreground mt-1 text-xs leading-5">{space.description}</p>
            ) : null}
          </div>
          <nav className="space-y-1 px-2 py-3">
            {flatTree.map((item) => {
              const href = `/docs/${space.slug}/${item.path}`;
              const isActive = page.path === item.path;
              return (
                <Link
                  key={item.id}
                  to={href}
                  className={cn(
                    'block rounded-xl px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  style={{ paddingLeft: `${12 + item.depth * 14}px` }}
                >
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-5">
          <header className="border-border bg-card rounded-xl border px-5 py-5 shadow-sm">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Link to="/docs" className="hover:text-foreground">
                文档中心
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span>{space.title}</span>
            </div>
            <h1 className="text-foreground mt-3 text-3xl font-semibold tracking-tight">
              {page.title}
            </h1>
            {page.summary ? (
              <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-7">
                {page.summary}
              </p>
            ) : null}
          </header>

          <section className="border-border bg-card rounded-xl border px-6 py-6 shadow-sm">
            <div className="prose prose-slate prose-headings:font-semibold prose-a:text-primary prose-p:leading-relaxed max-w-none">
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>,
                  h3: ({ children }) => <h3 id={headingId(String(children))}>{children}</h3>,
                  h4: ({ children }) => <h4 id={headingId(String(children))}>{children}</h4>,
                }}
              >
                {page.content}
              </ReactMarkdown>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {previousPage ? (
              <Button variant="outline" asChild>
                <Link to={`/docs/${space.slug}/${previousPage.path}`}>
                  上一页：{previousPage.title}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {nextPage ? (
              <Button variant="outline" asChild>
                <Link to={`/docs/${space.slug}/${nextPage.path}`}>下一页：{nextPage.title}</Link>
              </Button>
            ) : null}
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="border-border bg-card sticky top-20 rounded-xl border px-4 py-4 shadow-sm">
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.16em]">
              目录
            </p>
            <div className="mt-3 space-y-2">
              {toc.length === 0 ? (
                <p className="text-muted-foreground text-sm">当前页暂无二级标题。</p>
              ) : (
                toc.map((item) => (
                  <a
                    key={item.id}
                    href={`${location.pathname}#${item.id}`}
                    className="text-muted-foreground hover:text-foreground block text-sm transition"
                    style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
                  >
                    {item.text}
                  </a>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
