import { Skeleton, SkeletonAppCard, SkeletonList } from '@/components/shared/Skeleton';

/** Content-only placeholder: the surrounding navigation remains mounted. */
export function PageSkeleton({ pathname = '/' }: { pathname?: string }) {
  const catalog = pathname === '/' || pathname === '/apps' || pathname === '/content';
  const detail = pathname.startsWith('/apps/');
  return (
    <div
      role="status"
      aria-label="正在准备内容"
      aria-busy="true"
      className="page-skeleton min-w-0 space-y-6"
    >
      <div aria-hidden="true" className="space-y-6">
        <div className="space-y-3 py-4">
          <Skeleton className="h-8 w-2/5 max-w-80" />
          <Skeleton className="h-4 w-3/5 max-w-lg" />
        </div>
        {catalog ? (
          <>
            <Skeleton className="h-10 w-full" />
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <SkeletonAppCard key={index} />
              ))}
            </div>
          </>
        ) : detail ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <SkeletonList items={4} />
        )}
      </div>
    </div>
  );
}
