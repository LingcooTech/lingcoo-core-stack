import { Suspense } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

function RouteLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-4">
        <div className="bg-muted h-7 w-1/3 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-2/3 animate-pulse rounded-md" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function RouteErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-12">
      <div className="border-destructive/25 bg-card w-full max-w-md rounded-xl border p-6 text-center shadow-sm">
        <div className="bg-destructive/10 text-destructive mx-auto flex h-12 w-12 items-center justify-center rounded-full">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-foreground mt-4 text-lg font-semibold">页面加载失败</h2>
        <p className="text-muted-foreground mt-2 break-all text-sm">
          {error instanceof Error ? error.message : '未知错误，请稍后重试或返回首页。'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
            <RotateCcw className="h-3.5 w-3.5" />
            重试
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/">返回首页</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * RouteSlot：替代 <Outlet />，为子路由提供统一的
 * - Suspense fallback（lazy 加载时的占位）
 * - ErrorBoundary（页面级错误隔离，路由切换时自动重置）
 */
export function RouteSlot() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname} FallbackComponent={RouteErrorFallback}>
      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}
