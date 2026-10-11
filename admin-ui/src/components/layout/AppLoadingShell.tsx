import { Container } from './Container';
import { PageSkeleton } from './PageSkeleton';
import { Skeleton } from '@/components/shared/Skeleton';

/** Lightweight shell before UI chunks/auth are ready. Never contains account data or menus. */
export function AppLoadingShell({ pathname = window.location.pathname }: { pathname?: string }) {
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');
  const login = pathname === '/admin/login';
  if (admin)
    return (
      <div
        data-loading-shell="admin"
        className="startup-admin min-h-screen bg-[#f4f6fa] dark:bg-black"
      >
        {!login && (
          <aside
            aria-hidden="true"
            className="fixed inset-y-0 left-0 hidden w-60 space-y-6 border-r border-border bg-card p-5 lg:block"
          >
            <Skeleton className="h-9 w-full" />
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </aside>
        )}
        <div className={login ? '' : 'lg:ml-60'}>
          <div
            aria-hidden="true"
            className="flex h-16 items-center justify-between border-b border-border bg-card px-6"
          >
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          <main className={login ? 'mx-auto max-w-lg p-6' : 'p-4 lg:p-6'}>
            <PageSkeleton pathname={pathname} />
          </main>
        </div>
      </div>
    );
  return (
    <div data-loading-shell="portal" className="min-h-screen bg-background">
      <header aria-hidden="true" className="border-b border-border bg-card">
        <Container className="flex h-14 items-center justify-between gap-6">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="hidden h-8 w-64 lg:block" />
          <Skeleton className="h-8 w-16" />
        </Container>
      </header>
      <Container as="main" className="py-6">
        <PageSkeleton pathname={pathname} />
      </Container>
      <footer aria-hidden="true" className="mt-12 border-t border-border py-8">
        <Container>
          <Skeleton className="h-8 w-40" />
        </Container>
      </footer>
    </div>
  );
}
