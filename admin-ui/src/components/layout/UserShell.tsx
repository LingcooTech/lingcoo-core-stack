import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Package2,
  Settings,
  ShoppingBag,
  UserCircle2,
  X,
} from 'lucide-react';

import type { SiteNavigationItem } from '@/api/types';
import { getCurrentUser } from '@/api/auth';
import { getPublicSiteSettings } from '@/api/settings';
import { getMyNotificationUnreadCount } from '@/api/user';
import { Container } from '@/components/layout/Container';
import { RouteSlot } from '@/components/layout/RouteSlot';
import { ConsumerFooter } from '@/components/portal/ConsumerFooter';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getNormalizedInternalPath,
  getSiteDisplayName,
  getSiteHeaderNavigation,
  isExternalSiteUrl,
  isInternalSiteUrl,
  PUBLIC_SITE_SETTINGS_QUERY_KEY,
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

  return (
    pathname === normalizedPath ||
    (normalizedPath !== '/' && pathname.startsWith(`${normalizedPath}/`))
  );
}

function hasActiveNavigationItem(item: SiteNavigationItem, pathname: string) {
  return (
    isActiveSiteUrl(item.url, pathname) ||
    item.children.some((child) => isActiveSiteUrl(child.url, pathname))
  );
}

function desktopNavItemClass(isActive: boolean) {
  return cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium transition-all duration-200',
    isActive
      ? 'bg-white text-slate-900 shadow-sm'
      : 'text-gray-600 hover:bg-white/80 hover:text-slate-900',
  );
}

export function UserShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, logout, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const { data: currentUserData } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const { data: unreadNotificationData } = useQuery({
    queryKey: ['my-notifications', 'unread-count'],
    queryFn: getMyNotificationUnreadCount,
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const siteName = getSiteDisplayName(siteSettings);
  const headerNavigation = getSiteHeaderNavigation(siteSettings);
  const currentUser = currentUserData?.user ?? null;
  const unreadNotificationCount = unreadNotificationData?.unreadCount ?? 0;
  const accountName =
    currentUser?.displayName?.trim() || user?.email?.split('@')[0]?.trim() || '个人账户';
  const accountEmail = currentUser?.email || user?.email || '';

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
      <header className="bg-white/88 sticky top-0 z-30 border-b border-white/70 shadow-sm shadow-slate-900/5 backdrop-blur-xl">
        <Container className="py-1.5">
          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <div className="min-w-0 flex-1 lg:max-w-[220px]">
              <Link to="/" className="flex items-center gap-2.5">
                {siteSettings?.logoUrl ? (
                  <img
                    src={siteSettings.logoUrl}
                    alt={siteName}
                    className="h-9 w-9 rounded-2xl border border-gray-200/90 bg-white object-contain p-1.5 shadow-sm"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-950 via-gray-800 to-blue-600 text-[13px] font-semibold tracking-wide text-white shadow-lg shadow-gray-900/15">
                    {getInitials(siteName)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold tracking-tight text-gray-900">
                    {siteName}
                  </p>
                </div>
              </Link>
            </div>

            <nav
              className="hidden flex-1 items-center justify-center gap-1.5 lg:flex"
              aria-label="主导航"
            >
              {headerNavigation.map((item) => {
                const isActive = hasActiveNavigationItem(item, location.pathname);

                if (item.children.length > 0) {
                  return (
                    <DropdownMenu key={`${item.label}:${item.url}`}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className={desktopNavItemClass(isActive)}>
                          {item.label}
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="center"
                        sideOffset={10}
                        className="w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_48px_-24px_rgba(15,23,42,0.24)]"
                      >
                        {item.url ? (
                          <>
                            <DropdownMenuItem
                              className="rounded-xl px-3 py-2.5 text-[14px]"
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
                            className="rounded-xl px-3 py-2.5 text-[14px]"
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
                      className={desktopNavItemClass(isActive)}
                    >
                      {item.label}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={`${item.label}:${item.url}`}
                    to={item.url}
                    className={({ isActive: currentActive }) => desktopNavItemClass(currentActive)}
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
                className="h-8 w-8 rounded-full lg:hidden"
                onClick={() => setMobileMenuOpen((current) => !current)}
                aria-label={mobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
              <span className="hidden lg:inline-flex">
                <ThemeToggle />
              </span>
              {isAuthenticated ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative hidden h-9 w-9 rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900 lg:inline-flex"
                  onClick={() => navigate('/account?tab=notifications')}
                  aria-label="打开消息通知"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  ) : null}
                </Button>
              ) : null}
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="focus-visible:ring-primary inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/90 py-1 pl-1.5 pr-2 shadow-sm transition hover:border-slate-300 hover:bg-white hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      aria-label="打开用户菜单"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarFallback>{getInitials(accountName)}</AvatarFallback>
                      </Avatar>
                      <span className="hidden max-w-[96px] truncate text-[13px] font-medium text-slate-900 sm:block">
                        {accountName}
                      </span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={10}
                    className="w-[320px] rounded-xl border border-slate-200 bg-white p-0 shadow-lg"
                  >
                    <DropdownMenuLabel className="px-0 py-0">
                      <div className="relative rounded-t-xl bg-gradient-to-b from-green-50 to-emerald-50/50 px-5 py-5">
                        <button
                          type="button"
                          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-900"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            navigate('/account?tab=profile');
                          }}
                          aria-label="打开账户设置"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <div className="flex flex-col items-center text-center">
                          <Avatar className="h-20 w-20 shadow-sm ring-4 ring-white/80">
                            <AvatarFallback className="text-lg">
                              {getInitials(accountName)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
                            {accountName}
                          </p>
                          {accountEmail ? (
                            <p className="mt-1 text-sm text-slate-600">{accountEmail}</p>
                          ) : null}
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <div className="px-3 py-3">
                      <div className="space-y-1">
                        <DropdownMenuItem
                          className="rounded-2xl px-3 py-3 text-[15px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=notifications');
                          }}
                        >
                          <Bell className="h-4 w-4 text-slate-500" />
                          消息通知
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-2xl px-3 py-3 text-[15px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=profile');
                          }}
                        >
                          <UserCircle2 className="h-4 w-4 text-slate-500" />
                          个人资料
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-2xl px-3 py-3 text-[15px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=orders');
                          }}
                        >
                          <ShoppingBag className="h-4 w-4 text-slate-500" />
                          我的订单
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-2xl px-3 py-3 text-[15px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=apps');
                          }}
                        >
                          <Package2 className="h-4 w-4 text-slate-500" />
                          我的应用
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-2xl px-3 py-3 text-[15px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/tickets');
                          }}
                        >
                          <CircleHelp className="h-4 w-4 text-slate-500" />
                          我的工单
                        </DropdownMenuItem>
                      </div>

                      <DropdownMenuSeparator className="my-3" />

                      {isAdmin ? (
                        <DropdownMenuItem
                          className="rounded-2xl px-3 py-3 text-[15px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/admin');
                          }}
                        >
                          <LayoutDashboard className="h-4 w-4 text-slate-500" />
                          管理后台
                        </DropdownMenuItem>
                      ) : null}

                      <DropdownMenuSeparator className="my-3" />

                      <DropdownMenuItem
                        className="rounded-2xl px-3 py-3 text-[15px] text-rose-600 focus:bg-rose-50 focus:text-rose-600"
                        onSelect={(event) => {
                          event.preventDefault();
                          logout();
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        退出登录
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    asChild
                    className="hidden h-9 rounded-full px-4 sm:inline-flex"
                  >
                    <Link to="/login">
                      <LogIn className="h-4 w-4" />
                      登录
                    </Link>
                  </Button>
                  <Button asChild className="hidden h-9 rounded-full px-4 sm:inline-flex">
                    <Link to="/register">注册</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          {mobileMenuOpen ? (
            <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg shadow-slate-900/5 lg:hidden">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  导航
                </p>
                <div className="space-y-2">
                  {headerNavigation.map((item, index) =>
                    item.children.length > 0 ? (
                      <Accordion
                        key={`${item.label}:${index}`}
                        type="single"
                        collapsible
                        className="rounded-lg border border-gray-100 px-4"
                      >
                        <AccordionItem value={`mobile-nav-${index}`} className="border-b-0">
                          <AccordionTrigger className="py-3 text-sm font-medium text-slate-900 hover:no-underline">
                            {item.label}
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pb-3">
                            {item.url ? (
                              <button
                                type="button"
                                className="hover:text-primary block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-50"
                                onClick={() => handleSiteNavigation(item.url, item.openInNewTab)}
                              >
                                进入 {item.label}
                              </button>
                            ) : null}
                            {item.children.map((child) => (
                              <button
                                key={`${item.label}:${child.label}:${child.url}`}
                                type="button"
                                className="hover:text-primary block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition hover:bg-gray-50"
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
                        className="hover:text-primary block rounded-lg border border-gray-100 px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-gray-50"
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
                            isActive
                              ? 'border-primary/20 bg-primary/5 text-primary'
                              : 'hover:text-primary text-slate-900 hover:bg-gray-50',
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    ),
                  )}
                </div>

                {isAuthenticated ? (
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      账户
                    </p>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="relative bg-gradient-to-b from-green-50 to-emerald-50/50 px-4 py-4">
                        <button
                          type="button"
                          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-900"
                          onClick={() => navigate('/account?tab=profile')}
                          aria-label="打开账户设置"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-14 w-14 shadow-sm ring-4 ring-white/80">
                            <AvatarFallback className="text-sm">
                              {getInitials(accountName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold tracking-tight text-slate-900">
                              {accountName}
                            </p>
                            {accountEmail ? (
                              <p className="mt-1 truncate text-sm text-slate-600">{accountEmail}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 px-3 py-3">
                        <button
                          type="button"
                          className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                          onClick={() => navigate('/account?tab=notifications')}
                        >
                          <Bell className="h-4 w-4 text-slate-500" />
                          消息通知
                          {unreadNotificationCount > 0 ? (
                            <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                          onClick={() => navigate('/account?tab=profile')}
                        >
                          <UserCircle2 className="h-4 w-4 text-slate-500" />
                          个人资料
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                          onClick={() => navigate('/account?tab=orders')}
                        >
                          <ShoppingBag className="h-4 w-4 text-slate-500" />
                          我的订单
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                          onClick={() => navigate('/account?tab=apps')}
                        >
                          <Package2 className="h-4 w-4 text-slate-500" />
                          我的应用
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                          onClick={() => navigate('/tickets')}
                        >
                          <CircleHelp className="h-4 w-4 text-slate-500" />
                          我的工单
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                          onClick={() => navigate('/account?tab=profile')}
                        >
                          <Settings className="h-4 w-4 text-slate-500" />
                          设置
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="hover:text-primary flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-900 transition hover:bg-slate-50"
                            onClick={() => navigate('/admin')}
                          >
                            <LayoutDashboard className="h-4 w-4 text-slate-500" />
                            管理后台
                          </button>
                        ) : null}
                        <div className="mx-1 border-t border-slate-100" />
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-rose-600 transition hover:bg-rose-50"
                          onClick={logout}
                        >
                          <LogOut className="h-4 w-4" />
                          退出登录
                        </button>
                      </div>
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
              <p className="text-amber-800/80">
                请先完成邮箱验证，部分需要实名用户确认的接口会拒绝访问。
              </p>
            </div>
            <Button asChild size="sm">
              <Link to={`/verify-email?next=${encodeURIComponent(location.pathname)}`}>
                立即验证
              </Link>
            </Button>
          </Container>
        </div>
      ) : null}

      <Container as="main" className="py-6">
        <RouteSlot />
      </Container>

      <ConsumerFooter siteSettings={siteSettings} />
    </div>
  );
}
