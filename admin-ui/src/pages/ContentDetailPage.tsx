import { usePageMetadata } from '@/lib/use-page-metadata';
import { QueryErrorState } from '@/components/portal/QueryErrorState';
import { handleAsync } from '@/lib/async-events';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock, FileText, Link2, LoaderCircle, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { getPublishedContent, listPublishedContent } from '@/api/content';
import { ArticleToc } from '@/components/portal/ArticleToc';
import { EmptyState } from '@/components/portal/EmptyState';
import { CodeBlock } from '@/components/shared/CodeBlock';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { estimateReadingTime, extractToc, headingId } from '@/lib/markdown';
import { formatTime, getInitials } from '@/lib/utils';

const RELATED_LIMIT = 4;

export function ContentDetailPage() {
  const params = useParams<{ slug: string }>();
  const location = useLocation();

  const contentQuery = useQuery({
    queryKey: ['public-content-item', params.slug],
    queryFn: () => getPublishedContent(params.slug ?? ''),
    enabled: Boolean(params.slug),
  });

  const relatedQuery = useQuery({
    queryKey: ['public-content-related', params.slug],
    queryFn: () => listPublishedContent({ limit: RELATED_LIMIT + 1 }),
    enabled: Boolean(params.slug),
    staleTime: 60_000,
  });

  usePageMetadata(contentQuery.data?.title ?? '内容详情', contentQuery.data?.excerpt || undefined);

  const toc = useMemo(
    () => (contentQuery.data?.content ? extractToc(contentQuery.data.content) : []),
    [contentQuery.data?.content],
  );

  const readingMinutes = useMemo(
    () => (contentQuery.data?.content ? estimateReadingTime(contentQuery.data.content) : 0),
    [contentQuery.data?.content],
  );

  if (contentQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (contentQuery.isError)
    return (
      <QueryErrorState
        error={contentQuery.error}
        retry={() => void contentQuery.refetch()}
        busy={contentQuery.isFetching}
        backTo="/content"
        backLabel="返回内容中心"
      />
    );

  if (!contentQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/content">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回内容中心
          </Link>
        </Button>
        <EmptyState icon={FileText} title="内容不存在" description="当前文章不存在或暂未发布。" />
      </div>
    );
  }

  const item = contentQuery.data;
  const authorName = item.authorName || '匿名作者';
  const publishedAt = item.publishedAt || item.createdAt;
  const related = (relatedQuery.data?.items ?? [])
    .filter((row) => row.slug !== item.slug)
    .slice(0, RELATED_LIMIT);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('文章链接已复制');
    } catch {
      toast.error('复制失败，请手动选择地址栏');
    }
  };

  const handleShareTo = (provider: 'twitter' | 'weibo') => {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(item.title);
    const target =
      provider === 'twitter'
        ? `https://twitter.com/intent/tweet?url=${url}&text=${title}`
        : `https://service.weibo.com/share/share.php?url=${url}&title=${title}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  return (
    <article className="space-y-10">
      <Button variant="ghost" asChild className="px-0 text-muted-foreground">
        <Link to="/content">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回内容中心
        </Link>
      </Button>

      {item.coverUrl ? (
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm">
          <img
            src={item.coverUrl}
            alt={item.title}
            className="aspect-[21/9] w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}

      <header className="mx-auto max-w-[760px] space-y-4">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-foreground md:text-4xl md:leading-[1.2]">
          {item.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[11px]">{getInitials(authorName)}</AvatarFallback>
            </Avatar>
            <span className="font-medium text-foreground">{authorName}</span>
          </div>
          <span className="text-border">·</span>
          <span>{formatTime(publishedAt)}</span>
          {readingMinutes > 0 ? (
            <>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />约 {readingMinutes} 分钟
              </span>
            </>
          ) : null}
        </div>
        {item.excerpt ? (
          <p className="border-l-2 border-l-primary/40 pl-4 text-[15px] leading-7 text-muted-foreground italic">
            {item.excerpt}
          </p>
        ) : null}
      </header>

      <div className="mx-auto max-w-[1040px] lg:grid lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-12">
        <section className="content-body content-body-readable mx-auto">
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
            {item.content}
          </ReactMarkdown>
        </section>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <ArticleToc items={toc} pathname={location.pathname} />
          </div>
        </aside>
      </div>

      <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 sm:flex-nowrap">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Share2 className="h-4 w-4" />
          觉得有帮助？分享给更多人
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAsync(handleCopyLink)}>
            <Link2 className="h-4 w-4" />
            复制链接
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleShareTo('twitter')}>
            X / Twitter
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleShareTo('weibo')}>
            微博
          </Button>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mx-auto max-w-[1040px] space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">相关推荐</h2>
            <Button variant="ghost" asChild size="sm" className="text-muted-foreground">
              <Link to="/content">
                查看全部
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {related.map((row) => (
              <Link
                key={row.id}
                to={`/content/${row.slug}`}
                className="group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-5 no-underline transition-colors hover:border-foreground/20"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground tabular-nums">
                  <span className="truncate">{row.authorName || '匿名作者'}</span>
                  <span className="shrink-0">{formatTime(row.publishedAt || row.createdAt)}</span>
                </div>
                <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight text-foreground">
                  {row.title}
                </h3>
                {row.excerpt ? (
                  <p className="line-clamp-2 flex-1 text-[13px] leading-6 text-muted-foreground">
                    {row.excerpt}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
