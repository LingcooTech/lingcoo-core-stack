import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
 * 目前仅做客户端反馈提示；后续可接入 /v1/docs/feedback 端点持久化。
 */
export function DocsFeedback({ spaceSlug, pagePath, editUrl }: DocsFeedbackProps) {
  const [submitted, setSubmitted] = useState<'helpful' | 'unhelpful' | null>(null);

  const handleSubmit = (kind: 'helpful' | 'unhelpful') => {
    if (submitted) return;
    setSubmitted(kind);
    toast.success(kind === 'helpful' ? '感谢反馈！' : '已记录，会尽快改进');
    // 留点 hook 给未来后端：console 中带上必要 context，便于 debug
    if (process.env.NODE_ENV !== 'production') {
      console.info('[docs-feedback]', { spaceSlug, pagePath, kind });
    }
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
            disabled={Boolean(submitted)}
            onClick={() => handleSubmit('helpful')}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            有用
          </Button>
          <Button
            variant={submitted === 'unhelpful' ? 'default' : 'outline'}
            size="sm"
            disabled={Boolean(submitted)}
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
