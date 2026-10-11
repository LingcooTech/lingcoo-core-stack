import { Alert, Button, Empty, Skeleton } from 'antd';
import type { ReactNode } from 'react';
export function AsyncState({
  loading,
  error,
  empty,
  emptyText = '暂无数据',
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div
        role="status"
        aria-label="正在准备内容"
        aria-busy="true"
        className="page-skeleton"
        style={{ minHeight: 240, padding: 24 }}
      >
        <div aria-hidden="true">
          <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 5 }} />
        </div>
      </div>
    );
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        title="加载失败"
        description={error.message}
        action={onRetry && <Button onClick={onRetry}>重试</Button>}
      />
    );
  if (empty) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  return children;
}
