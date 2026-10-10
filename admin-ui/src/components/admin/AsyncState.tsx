import { Alert, Button, Empty, Flex, Spin } from 'antd';
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
      <Flex justify="center" align="center" style={{ minHeight: 160 }}>
        <Spin description="加载中" />
      </Flex>
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
