import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogIn, LogOut, Menu, X } from 'lucide-react';

import type { SiteNavigationItem } from '@/api/types';
import { getPublicSiteSettings } from '@/api/settings';
import { Container } from '@/components/layout/Container';
import { ConsumerFooter } from '@/components/portal/ConsumerFooter';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  getNormalizedInternalPath,
  getSiteDisplayName,
  getSiteHeaderNavigation,
  isExternalSiteUrl,
  isInternalSiteUrl,
  PUBLIC_SITE_SETTINGS_QUERY_KEY
} from '@/lib/site-settings';
import { useAuth } from '@/lib/auth';
import { cn, getInitials } from '@/lib/utils';

function isActiveSiteUrl(url: string, pathname: string) {
  if (!isInternalSiteUrl(url)) {
    return false;
  }

  const normalizedPath = getNormalizedInternalPath(url);
  if (!normalizedPath) {
    return false;
  }

  return pathname === normalizedPath || (normalizedPath !== '/' && pathname.startsWith(`${normalizedPath}/`));
}

function hasActiveNavigationItem(item: SiteNavigationItem, pathname: string) {
  return isActiveSiteUrl(item.url, pathname) || item.children.some((child) => isActiveSiteUrl(child.url, pathname));
}

export function UserShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, logout, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000
  });
  const siteName = getSiteDisplayName(siteSettings);
  const headerNavigation = getSiteHeaderNavigation(siteSettings);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleSiteNavigation = (url: string, openInNewTab = false) => {
    if (!url) {
      return;
    }

    if (openInNewTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (isInternalSiteUrl(url)) {
      navigate(url);
      return;
    }

    window.location.assign(url);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_22%),linear-gradient(180deg,#fcfdff_0%,#f5f8fc_46%,#f7f9fc_100%)]">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/88 shadow-sm shadow-slate-900/5 backdrop-blur-xl">
        <Container className="py-2.5">
          <div className="flex min-h-[52px] items-center justify-between gap-4">
            <div className="min-w-0 flex-1 lg:max-w-[220px]">
              <Link to="/" className="flex items-center gap-3">
                {siteSettings?.logoUrl ? (
                  <img
                    src={siteSettings.logoUrl}
                    alt={siteName}
                    className="h-10 w-10 rounded-2xl border border-gray-200/90 bg-white object-contain p-1.5 shadow-sm"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-950 via-gray-800 to-blue-600 text-sm font-semibold tracking-wide text-white shadow-lg shadow-gray-900/15">
                    {getInitials(siteName)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-gray-900">{siteName}</p>
                </div>
              </Link>
            </div>

            <nav className="hidden flex-1 items-center justify-center gap-5 lg:flex" aria-label="主导航">
              {headerNavigation.map((item) => {
                const isActive = hasActiveNavigationItem(item, location.pathname);

                if (item.children.length > 0) {
                  return (
                    <DropdownMenu key={`${item.label}:${item.url}`}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center gap-1 text-[14px] font-medium whitespace-nowrap transition-colors duration-200',
                            isActive ? 'text-primary' : 'text-gray-600 hover:text-primary'
                          )}
                        >
                          {item.label}
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-56">
                        {item.url ? (
                          <>
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                handleSiteNavigation(item.url, item.openInNewTab);
                              }}
                            >
                              {item.label}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        {item.children.map((child) => (
                          <DropdownMenuItem
                            key={`${item.label}:${child.label}:${child.url}`}
                            onSelect={(event) => {
                              event.preventDefault();
                              handleSiteNavigation(child.url, child.openInNewTab);
                            }}
                          >
                            {child.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                if (item.openInNewTab || isExternalSiteUrl(item.url)) {
                  return (
                    <a
                      key={`${item.label}:${item.url}`}
                      href={item.url}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                      className={cn(
                        'text-[14px] font-medium whitespace-nowrap transition-colors duration-200',
                        isActive ? 'text-primary' : 'text-gray-600 hover:text-primary'
                      )}
                    >
                      {item.label}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={`${item.label}:${item.url}`}
                    to={item.url}
                    className={({ isActive: currentActive }) =>
                      cn(
                        'text-[14px] font-medium whitespace-nowrap transition-colors duration-200',
                        currentActive ? 'text-primary' : 'text-gray-600 hover:text-primary'
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="flex flex-1 items-center justify-end gap-2 lg:max-w-[220px]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full lg:hidden"
                onClick={() => setMobileMenuOpen((current) => !current)}
                aria-label={mobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative rounded-full border border-gray-200/90 bg-white p-1 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      aria-label="打开用户菜单"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(user?.email)}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-gray-900 text-white">
                        <ChevronDown className="h-2.5 w-2.5" />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="px-2 py-2">
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">{user?.email}</p>
                        <p className="text-[11px] text-muted-foreground">账户</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        navigate('/account?tab=profile');
                      }}
                    >
                      个人中心
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        navigate('/account?tab=orders');
                      }}
                    >
                      我的订单
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        navigate('/account?tab=apps');
                      }}
                    >
                      我的应用
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isAdmin ? (
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          navigate('/admin');
                        }}
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        管理后台
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        logout();
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      退出
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button variant="ghost" asChild className="hidden sm:inline-flex">
                    <Link to="/login">
                      <LogIn className="h-4 w-4" />
                      登录
                    </Link>
                  </Button>
                  <Button asChild className="hidden sm:inline-flex">
                    <Link to="/register">注册</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg shadow-slate-900/5 lg:hidden">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">导航</p>
                <div className="space-y-2">
                  {headerNavigation.map((item, index) =>
                    item.children.length > 0 ? (
                      <Accordion key={`${item.label}:${index}`} type="single" collapsible className="rounded-lg border border-gray-100 px-4">
                        <AccordionItem value={`mobile-nav-${index}`} className="border-b-0">
                          <AccordionTrigger className="py-3 text-sm font-medium text-slate-900 hover:no-underline">
                            {item.label}
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pb-3">
                            {item.url ? (
                              <button
                                type="button"
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-50 hover:text-primary"
                                onClick={() => handleSiteNavigation(item.url, item.openInNewTab)}
                              >
                                进入 {item.label}
                              </button>
                            ) : null}
                            {item.children.map((child) => (
                              <button
                                key={`${item.label}:${child.label}:${child.url}`}
                                type="button"
                                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-50 hover:text-primary"
                                onClick={() => handleSiteNavigation(child.url, child.openInNewTab)}
                              >
                                {child.label}
                              </button>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    ) : isExternalSiteUrl(item.url) || item.openInNewTab ? (
                      <a
                        key={`${item.label}:${item.url}`}
                        href={item.url}
                        target={item.openInNewTab ? '_blank' : undefined}
                        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                        className="block rounded-lg border border-gray-100 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-gray-50 hover:text-primary"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <NavLink
                        key={`${item.label}:${item.url}`}
                        to={item.url}
                        className={({ isActive }) =>
                          cn(
                            'block rounded-lg border border-gray-100 px-4 py-3 text-sm font-medium transition',
                            isActive ? 'border-primary/20 bg-primary/5 text-primary' : 'text-slate-900 hover:bg-gray-50 hover:text-primary'
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    )
                  )}
                </div>

                {isAuthenticated ? (
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">账户</p>
                    <div className="grid gap-2">
                      <button
                        type="button"
                        className="block rounded-lg border border-gray-100 px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-gray-50 hover:text-primary"
                        onClick={() => navigate('/account?tab=profile')}
                      >
                        个人中心
                      </button>
                      <button
                        type="button"
                        className="block rounded-lg border border-gray-100 px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-gray-50 hover:text-primary"
                        onClick={() => navigate('/account?tab=orders')}
                      >
                        我的订单
                      </button>
                      <button
                        type="button"
                        className="block rounded-lg border border-gray-100 px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-gray-50 hover:text-primary"
                        onClick={() => navigate('/account?tab=apps')}
                      >
                        我的应用
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="block rounded-lg border border-gray-100 px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-gray-50 hover:text-primary"
                          onClick={() => navigate('/admin')}
                        >
                          管理后台
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="block rounded-lg border border-gray-100 px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:bg-gray-50 hover:text-primary"
                        onClick={logout}
                      >
                        退出登录
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 border-t border-gray-100 pt-3 sm:hidden">
                    <Button variant="ghost" asChild className="flex-1">
                      <Link to="/login">登录</Link>
                    </Button>
                    <Button asChild className="flex-1">
                      <Link to="/register">注册</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Container>
      </header>

      {isAuthenticated && user && !user.emailVerified ? (
        <div className="border-b border-amber-200 bg-amber-50/90">
          <Container className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <div>
              <p className="font-bold text-amber-900">邮箱尚未验证</p>
              <p className="text-amber-800/80">请先完成邮箱验证，部分需要实名用户确认的接口会拒绝访问。</p>
            </div>
            <Button asChild size="sm">
              <Link to={`/verify-email?next=${encodeURIComponent(location.pathname)}`}>立即验证</Link>
            </Button>
          </Container>
        </div>
      ) : null}

      <Container as="main" className="py-6">
        <Outlet />
      </Container>

      <ConsumerFooter siteSettings={siteSettings} />
    </div>
  );
}
