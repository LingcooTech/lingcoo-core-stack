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

function flattenDocTree(nodes: DocPageTreeNode[], depth = 0): Array<DocPageTreeNode & { depth: number }> {
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
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pageQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
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
      <Button variant="ghost" asChild className="px-0 text-muted-foreground">
        <Link to="/docs">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回文档中心
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-[260px,minmax(0,1fr),220px]">
        <aside className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm shadow-slate-900/5">
          <div className="border-b border-gray-100 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">{space.title}</p>
            {space.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{space.description}</p> : null}
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
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
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
          <header className="rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm shadow-slate-900/5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link to="/docs" className="hover:text-slate-900">文档中心</Link>
              <ChevronRight className="h-3 w-3" />
              <span>{space.title}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{page.title}</h1>
            {page.summary ? <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{page.summary}</p> : null}
          </header>

          <section className="rounded-2xl border border-gray-200 bg-white px-6 py-6 shadow-sm shadow-slate-900/5">
            <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-primary prose-p:leading-relaxed">
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
                <Link to={`/docs/${space.slug}/${previousPage.path}`}>上一页：{previousPage.title}</Link>
              </Button>
            ) : <span />}
            {nextPage ? (
              <Button variant="outline" asChild>
                <Link to={`/docs/${space.slug}/${nextPage.path}`}>下一页：{nextPage.title}</Link>
              </Button>
            ) : null}
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">目录</p>
            <div className="mt-3 space-y-2">
              {toc.length === 0 ? (
                <p className="text-sm text-slate-500">当前页暂无二级标题。</p>
              ) : (
                toc.map((item) => (
                  <a
                    key={item.id}
                    href={`${location.pathname}#${item.id}`}
                    className="block text-sm text-slate-600 transition hover:text-slate-900"
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
