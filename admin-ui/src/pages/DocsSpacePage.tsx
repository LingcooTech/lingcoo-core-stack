import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, FileText, LoaderCircle, Menu } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { getPublicDocPage } from '@/api/docs';
import { ArticleToc } from '@/components/portal/ArticleToc';
import { DocsFeedback } from '@/components/docs/DocsFeedback';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { EmptyState } from '@/components/portal/EmptyState';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { extractToc, headingId } from '@/lib/markdown';

function resolveEditUrl(space: { meta?: Record<string, unknown> }, pagePath: string) {
  const editBase = space.meta?.editBaseUrl;
  if (typeof editBase !== 'string' || !editBase.trim()) return null;
  return `${editBase.replace(/\/$/, '')}/${pagePath}.md`;
}

function buildBreadcrumb(spaceTitle: string, pagePath: string, pageTitle: string) {
  const segments = pagePath.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return [
      { label: spaceTitle, isCurrent: false },
      { label: pageTitle, isCurrent: true },
    ];
  }
  return [
    { label: spaceTitle, isCurrent: false },
    ...segments.slice(0, -1).map((seg) => ({ label: seg, isCurrent: false })),
    { label: pageTitle, isCurrent: true },
  ];
}

export function DocsSpacePage() {
  const params = useParams<{ spaceSlug: string; '*': string }>();
  const location = useLocation();
  const currentPath = params['*']?.trim() || '';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [currentPath]);

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
  const editUrl = resolveEditUrl(space, page.path);
  const breadcrumb = buildBreadcrumb(space.title, page.path, page.title);

  return (
    <div className="min-[960px]:grid min-[960px]:grid-cols-[280px_minmax(0,1fr)] min-[960px]:gap-8 min-[1280px]:grid-cols-[280px_minmax(0,1fr)_220px] min-[1280px]:gap-10">
      <div className="hidden min-[960px]:block">
        <div className="sticky top-[88px] max-h-[calc(100vh-104px)]">
          <DocsSidebar
            spaceTitle={space.title}
            spaceDescription={space.description}
            spaceSlug={space.slug}
            tree={tree}
            currentPath={page.path}
          />
        </div>
      </div>

      <main className="min-w-0 space-y-6 min-[960px]:max-w-none">
        <div className="flex items-center gap-2 min-[960px]:hidden">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-3.5 w-3.5" />
            文档目录
          </Button>
        </div>

        <nav
          className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs"
          aria-label="面包屑"
        >
          <Link to="/docs" className="hover:text-foreground">
            文档中心
          </Link>
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-2">
              <ChevronRight className="h-3 w-3" />
              <span className={crumb.isCurrent ? 'text-foreground font-medium' : ''}>
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>

        <header className="space-y-3">
          <h1 className="text-foreground text-3xl font-semibold leading-tight tracking-tight md:text-4xl md:leading-[1.2]">
            {page.title}
          </h1>
          {page.summary ? (
            <p className="text-muted-foreground text-[15px] leading-7">{page.summary}</p>
          ) : null}
        </header>

        <section className="content-body max-w-none">
          <ReactMarkdown
            rehypePlugins={[rehypeRaw]}
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>,
              h3: ({ children }) => <h3 id={headingId(String(children))}>{children}</h3>,
              h4: ({ children }) => <h4 id={headingId(String(children))}>{children}</h4>,
              code: ({
                inline,
                className,
                children,
                ...rest
              }: {
                inline?: boolean;
                className?: string;
                children?: React.ReactNode;
              } & React.HTMLAttributes<HTMLElement>) => {
                if (inline) {
                  return (
                    <code className={className} {...rest}>
                      {children}
                    </code>
                  );
                }
                const language = /language-(\w+)/.exec(className ?? '')?.[1];
                return <CodeBlock language={language}>{children}</CodeBlock>;
              },
              img: ({ src, alt }) => (
                <img src={src} alt={alt} loading="lazy" className="rounded-xl shadow-sm" />
              ),
            }}
          >
            {page.content}
          </ReactMarkdown>
        </section>

        <DocsFeedback spaceSlug={space.slug} pagePath={page.path} editUrl={editUrl} />

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          {previousPage ? (
            <Button variant="outline" asChild>
              <Link
                to={`/docs/${space.slug}/${previousPage.path}`}
                className="max-w-[280px] text-left"
              >
                <span className="block w-full">
                  <span className="text-muted-foreground block text-[11px]">上一页</span>
                  <span className="block truncate text-sm font-medium">{previousPage.title}</span>
                </span>
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {nextPage ? (
            <Button variant="outline" asChild>
              <Link
                to={`/docs/${space.slug}/${nextPage.path}`}
                className="max-w-[280px] text-right"
              >
                <span className="block w-full">
                  <span className="text-muted-foreground block text-[11px]">下一页</span>
                  <span className="block truncate text-sm font-medium">{nextPage.title}</span>
                </span>
              </Link>
            </Button>
          ) : null}
        </div>
      </main>

      <aside className="hidden min-[1280px]:block">
        <div className="sticky top-[88px]">
          <ArticleToc items={toc} pathname={location.pathname} />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[280px] p-3 min-[960px]:hidden"
          aria-describedby={undefined}
        >
          <div className="h-full pt-2">
            <DocsSidebar
              spaceTitle={space.title}
              spaceDescription={space.description}
              spaceSlug={space.slug}
              tree={tree}
              currentPath={page.path}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
