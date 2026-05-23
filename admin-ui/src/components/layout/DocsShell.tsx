import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { getPublicSiteSettings } from '@/api/settings';
import { Container } from '@/components/layout/Container';
import { RouteSlot } from '@/components/layout/RouteSlot';
import { DocsCommandPalette, DocsSearchTrigger } from '@/components/docs/DocsCommandPalette';
import { SpaceSelector } from '@/components/docs/SpaceSelector';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY, getSiteDisplayName } from '@/lib/site-settings';
import { getInitials } from '@/lib/utils';

export function DocsShell() {
  const location = useLocation();
  const params = useParams<{ spaceSlug?: string }>();
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const siteName = getSiteDisplayName(siteSettings);
  const currentSpaceSlug = useMemo(() => {
    if (params.spaceSlug) return params.spaceSlug;
    const match = location.pathname.match(/^\/docs\/([^/]+)/);
    return match?.[1] ?? '';
  }, [params.spaceSlug, location.pathname]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfcfe_0%,#f4f7fb_100%)] dark:bg-[linear-gradient(180deg,hsl(222.2_84%_4.9%)_0%,hsl(217.2_32.6%_10%)_100%)]">
      <header className="bg-card/92 border-border/80 sticky top-0 z-30 border-b backdrop-blur-xl">
        <Container className="py-2">
          <div className="flex min-h-[52px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/docs" className="flex min-w-0 items-center gap-3">
                {siteSettings?.logoUrl ? (
                  <img
                    src={siteSettings.logoUrl}
                    alt={siteName}
                    className="border-border bg-card h-9 w-9 rounded-xl border object-contain p-1.5 shadow-sm"
                  />
                ) : (
                  <div className="from-primary shadow-primary/20 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br to-blue-500 text-sm font-semibold text-white shadow-sm">
                    {getInitials(siteName)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[14px] font-semibold tracking-tight">
                    {siteName}
                  </p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[11px]">
                    <BookOpen className="h-3 w-3" />
                    <span>文档中心</span>
                  </div>
                </div>
              </Link>
              <ChevronRight className="text-muted-foreground/40 hidden h-4 w-4 sm:block" />
              <div className="hidden sm:block">
                <SpaceSelector currentSlug={currentSpaceSlug} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden lg:block">
                <DocsSearchTrigger onOpen={() => setSearchOpen(true)} />
              </div>
              <ThemeToggle />
              <Button variant="outline" asChild className="hidden rounded-full px-3 sm:inline-flex">
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

      <DocsCommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
