import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className,
  variant = 'default',
  animation = 'pulse',
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-gray-200/60',
        {
          'rounded-md': variant === 'default' || variant === 'rectangular',
          'rounded-full': variant === 'circular',
          'h-4 rounded': variant === 'text',
          'animate-pulse': animation === 'pulse',
          'animate-wave': animation === 'wave',
        },
        className,
      )}
      {...props}
    />
  );
}

// 预设骨架屏组件
export function SkeletonCard() {
  return (
    <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <Skeleton variant="circular" className="h-12 w-12 shrink-0" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-4 flex-1"
              style={{ width: `${60 + ((rowIndex + colIndex) % 4) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonAppCard() {
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-1.5">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-2/3" />
      <div className="border-border mt-4 flex items-end justify-between border-t pt-3">
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

export function SkeletonMetricCard() {
  return (
    <div className="border-border bg-card rounded-lg border px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton variant="circular" className="h-10 w-10" />
      </div>
    </div>
  );
}

export function SkeletonList({ items = 3 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, index) => (
        <div
          key={index}
          className="border-border bg-card flex items-center gap-3 rounded-lg border p-4"
        >
          <Skeleton variant="circular" className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
