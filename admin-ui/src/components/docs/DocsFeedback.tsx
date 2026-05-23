import { useMutation } from '@tanstack/react-query';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { submitDocFeedback } from '@/api/docs';
import { Button } from '@/components/ui/button';

interface DocsFeedbackProps {
  /** 用于上报与去重 */
  spaceSlug: string;
  pagePath: string;
  /** 配置过的「在 GitHub 编辑」base URL，例如 https://github.com/foo/docs/edit/main/<path>.md */
  editUrl?: string | null;
}

/**
 * 文档页底部反馈条：👍 / 👎 + （可选）GitHub 编辑链接。
 * 点击会写入 doc_feedback 表，后续可在管理后台聚合查看。
 */
export function DocsFeedback({ spaceSlug, pagePath, editUrl }: DocsFeedbackProps) {
  const [submitted, setSubmitted] = useState<'helpful' | 'unhelpful' | null>(null);

  const mutation = useMutation({
    mutationFn: submitDocFeedback,
    onSuccess: (_data, variables) => {
      setSubmitted(variables.helpful ? 'helpful' : 'unhelpful');
      toast.success(variables.helpful ? '感谢反馈！' : '已记录，会尽快改进');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '反馈提交失败');
    },
  });

  const handleSubmit = (kind: 'helpful' | 'unhelpful') => {
    if (submitted || mutation.isPending) return;
    mutation.mutate({ spaceSlug, pagePath, helpful: kind === 'helpful' });
  };

  return (
    <div className="border-border mt-12 rounded-2xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-foreground text-sm font-medium">本页对你有帮助吗？</p>
          {submitted ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {submitted === 'helpful' ? '已收到正向反馈' : '已记录待改进'}
            </p>
          ) : (
            <p className="text-muted-foreground mt-1 text-xs">你的反馈会帮助我们改进文档质量。</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={submitted === 'helpful' ? 'default' : 'outline'}
            size="sm"
            disabled={Boolean(submitted) || mutation.isPending}
            onClick={() => handleSubmit('helpful')}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            有用
          </Button>
          <Button
            variant={submitted === 'unhelpful' ? 'default' : 'outline'}
            size="sm"
            disabled={Boolean(submitted) || mutation.isPending}
            onClick={() => handleSubmit('unhelpful')}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            待改进
          </Button>
          {editUrl ? (
            <Button asChild variant="ghost" size="sm">
              <a href={editUrl} target="_blank" rel="noopener noreferrer">
                在 GitHub 编辑
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
