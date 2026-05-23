import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, LoaderCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { getPublishedContent } from '@/api/content';
import { EmptyState } from '@/components/portal/EmptyState';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/utils';

export function ContentDetailPage() {
  const params = useParams<{ slug: string }>();
  const contentQuery = useQuery({
    queryKey: ['public-content-item', params.slug],
    queryFn: () => getPublishedContent(params.slug ?? ''),
    enabled: Boolean(params.slug),
  });

  if (contentQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="text-primary h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!contentQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild className="text-muted-foreground px-0">
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

  return (
    <article className="space-y-6">
      <Button variant="ghost" asChild className="text-muted-foreground px-0">
        <Link to="/content">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回内容中心
        </Link>
      </Button>

      <header className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <div className="space-y-3">
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
            <span>{item.authorName || '匿名作者'}</span>
            <span className="text-slate-300">•</span>
            <span>{formatTime(item.publishedAt || item.createdAt)}</span>
          </div>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">{item.title}</h1>
          {item.excerpt ? (
            <p className="text-muted-foreground max-w-3xl text-sm leading-7">{item.excerpt}</p>
          ) : null}
        </div>
      </header>

      <section className="border-border bg-card rounded-xl border p-6 shadow-sm">
        <div className="prose prose-slate dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
            {item.content}
          </ReactMarkdown>
        </div>
      </section>
    </article>
  );
}
