import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, FileText } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { getPublicSiteSettings } from '@/api/settings';
import { Container } from '@/components/layout/Container';
import { RouteSlot } from '@/components/layout/RouteSlot';
import { Button } from '@/components/ui/button';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY, getSiteDisplayName } from '@/lib/site-settings';
import { cn, getInitials } from '@/lib/utils';

function DocsNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'inline-flex items-center rounded-full px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-600 hover:bg-white/80 hover:text-slate-900',
        )
      }
    >
      {label}
    </NavLink>
  );
}

export function DocsShell() {
  const location = useLocation();
  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const siteName = getSiteDisplayName(siteSettings);
  const isDocsHome = location.pathname === '/docs';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfcfe_0%,#f4f7fb_100%)]">
      <header className="bg-white/92 sticky top-0 z-30 border-b border-slate-200/80 backdrop-blur-xl">
        <Container className="py-2">
          <div className="flex min-h-[52px] items-center justify-between gap-4">
            <Link to="/docs" className="flex min-w-0 items-center gap-3">
              {siteSettings?.logoUrl ? (
                <img
                  src={siteSettings.logoUrl}
                  alt={siteName}
                  className="h-9 w-9 rounded-2xl border border-slate-200 bg-white object-contain p-1.5 shadow-sm"
                />
              ) : (
                <div className="from-primary shadow-primary/20 flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br to-blue-500 text-sm font-semibold text-white shadow-sm">
                  {getInitials(siteName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-tight text-slate-900">
                  {siteName}
                </p>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                  <BookOpen className="h-3 w-3" />
                  <span>文档中心</span>
                </div>
              </div>
            </Link>

            <nav className="hidden items-center gap-1.5 lg:flex">
              <DocsNavLink to="/docs" label="Docs" />
              <DocsNavLink to="/apps" label="Apps" />
              <DocsNavLink to="/content" label="Content" />
            </nav>

            <div className="flex items-center gap-2">
              {!isDocsHome ? (
                <Button variant="ghost" asChild className="hidden rounded-full px-3 sm:inline-flex">
                  <Link to="/docs">
                    <FileText className="h-4 w-4" />
                    全部文档
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" asChild className="rounded-full px-3">
                <a href="/api-docs" target="_blank" rel="noreferrer">
                  API Docs
                  <ChevronRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </Container>
      </header>

      <main className="px-4 py-6 sm:px-5 md:px-6 xl:px-8">
        <div className="mx-auto w-full max-w-[1520px]">
          <RouteSlot />
        </div>
      </main>
    </div>
  );
}
