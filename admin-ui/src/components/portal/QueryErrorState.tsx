import { AlertCircle, FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';

export function QueryErrorState({
  error,
  retry,
  busy = false,
  backTo,
  backLabel = '返回列表',
}: {
  error?: unknown;
  retry: () => void;
  busy?: boolean;
  backTo?: string;
  backLabel?: string;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div role="alert" className="rounded-xl border border-border bg-card">
      <EmptyState
        icon={notFound ? FileQuestion : AlertCircle}
        title={notFound ? '内容不存在或暂未发布' : '暂时无法加载'}
        description={notFound ? '请返回列表查看其他内容。' : '请检查网络连接，或稍后重新加载。'}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {!notFound && (
              <Button variant="outline" onClick={retry} disabled={busy}>
                {busy ? '正在重试…' : '重新加载'}
              </Button>
            )}
            {backTo && (
              <Button variant="ghost" asChild>
                <Link to={backTo}>{backLabel}</Link>
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
