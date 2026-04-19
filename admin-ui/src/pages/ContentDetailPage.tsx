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
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

  return (
    <article className="space-y-6">
      <Button variant="ghost" asChild className="px-0 text-muted-foreground">
        <Link to="/content">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回内容中心
        </Link>
      </Button>

      <header className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>{item.authorName || '匿名作者'}</span>
            <span className="text-slate-300">•</span>
            <span>{formatTime(item.publishedAt || item.createdAt)}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{item.title}</h1>
          {item.excerpt ? <p className="max-w-3xl text-sm leading-7 text-slate-600">{item.excerpt}</p> : null}
        </div>
      </header>

      <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5">
        <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:leading-relaxed">
          <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
            {item.content}
          </ReactMarkdown>
        </div>
      </section>
    </article>
  );
}
