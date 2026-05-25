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
      ? 'bg-card text-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-card/80 hover:text-foreground',
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_22%),linear-gradient(180deg,#fcfdff_0%,#f5f8fc_46%,#f7f9fc_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.06),_transparent_24%),linear-gradient(180deg,hsl(222.2_84%_4.9%)_0%,hsl(217.2_32.6%_10%)_46%,hsl(222.2_84%_4.9%)_100%)]">
      <header className="bg-card/88 border-border sticky top-0 z-30 border-b backdrop-blur-xl">
        <Container className="py-1.5">
          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <div className="min-w-0 flex-1 lg:max-w-[220px]">
              <Link to="/" className="flex items-center gap-2.5">
                {siteSettings?.logoUrl ? (
                  <img
                    src={siteSettings.logoUrl}
                    alt={siteName}
                    className="border-border/90 bg-card h-9 w-9 rounded-xl border object-contain p-1.5 shadow-sm"
                  />
                ) : (
                  <div className="bg-foreground text-background flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-semibold tracking-wide">
                    {getInitials(siteName)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[14px] font-semibold tracking-tight">
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
                        className="border-border bg-card w-60 rounded-xl border p-2 shadow-[0_20px_48px_-24px_rgba(15,23,42,0.24)]"
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
                  className="text-muted-foreground hover:bg-card hover:text-foreground relative hidden h-9 w-9 rounded-full transition lg:inline-flex"
                  onClick={() => navigate('/account?tab=notifications')}
                  aria-label="打开消息通知"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationCount > 0 ? (
                    <span className="bg-destructive text-destructive-foreground absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold">
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
                      className="focus-visible:ring-primary hover:bg-card hidden items-center gap-2 rounded-full py-1 pl-1.5 pr-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 lg:inline-flex"
                      aria-label="打开用户菜单"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarFallback>{getInitials(accountName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-foreground hidden max-w-[96px] truncate text-[13px] font-medium sm:block">
                        {accountName}
                      </span>
                      <span className="text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={10}
                    className="border-border bg-card w-[280px] rounded-xl border p-0 shadow-lg"
                  >
                    <DropdownMenuLabel className="px-0 py-0">
                      <div className="relative rounded-t-xl bg-gradient-to-b from-green-50 to-emerald-50/50 px-4 py-4">
                        <button
                          type="button"
                          className="bg-card/90 text-muted-foreground hover:bg-card hover:text-foreground border-border absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
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
                          <Avatar className="h-14 w-14 shadow-sm ring-[3px] ring-white/80">
                            <AvatarFallback className="text-base">
                              {getInitials(accountName)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-foreground mt-2 text-lg font-semibold tracking-tight">
                            {accountName}
                          </p>
                          {accountEmail ? (
                            <p className="text-muted-foreground mt-0.5 text-xs">{accountEmail}</p>
                          ) : null}
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <div className="px-2 py-2">
                      <div className="space-y-0.5">
                        <DropdownMenuItem
                          className="rounded-lg px-3 py-2.5 text-[14px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=notifications');
                          }}
                        >
                          <Bell className="text-muted-foreground h-4 w-4" />
                          消息通知
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-lg px-3 py-2.5 text-[14px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=profile');
                          }}
                        >
                          <UserCircle2 className="text-muted-foreground h-4 w-4" />
                          个人资料
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-lg px-3 py-2.5 text-[14px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=orders');
                          }}
                        >
                          <ShoppingBag className="text-muted-foreground h-4 w-4" />
                          我的订单
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-lg px-3 py-2.5 text-[14px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/account?tab=apps');
                          }}
                        >
                          <Package2 className="text-muted-foreground h-4 w-4" />
                          我的应用
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="rounded-lg px-3 py-2.5 text-[14px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/tickets');
                          }}
                        >
                          <CircleHelp className="text-muted-foreground h-4 w-4" />
                          我的工单
                        </DropdownMenuItem>
                      </div>

                      <DropdownMenuSeparator className="my-2" />

                      {isAdmin ? (
                        <DropdownMenuItem
                          className="rounded-lg px-3 py-2.5 text-[14px]"
                          onSelect={(event) => {
                            event.preventDefault();
                            navigate('/admin');
                          }}
                        >
                          <LayoutDashboard className="text-muted-foreground h-4 w-4" />
                          管理后台
                        </DropdownMenuItem>
                      ) : null}

                      <DropdownMenuSeparator className="my-2" />

                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive rounded-lg px-3 py-2.5 text-[14px]"
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
            <div className="border-border bg-card mt-3 rounded-xl border p-4 shadow-lg lg:hidden">
              <div className="space-y-3">
                <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                  导航
                </p>
                <div className="space-y-2">
                  {headerNavigation.map((item, index) =>
                    item.children.length > 0 ? (
                      <Accordion
                        key={`${item.label}:${index}`}
                        type="single"
                        collapsible
                        className="border-border rounded-lg border px-4"
                      >
                        <AccordionItem value={`mobile-nav-${index}`} className="border-b-0">
                          <AccordionTrigger className="text-foreground py-3 text-sm font-medium hover:no-underline">
                            {item.label}
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pb-3">
                            {item.url ? (
                              <button
                                type="button"
                                className="hover:text-primary text-muted-foreground hover:bg-muted block w-full rounded-lg px-3 py-2 text-left text-sm transition"
                                onClick={() => handleSiteNavigation(item.url, item.openInNewTab)}
                              >
                                进入 {item.label}
                              </button>
                            ) : null}
                            {item.children.map((child) => (
                              <button
                                key={`${item.label}:${child.label}:${child.url}`}
                                type="button"
                                className="hover:text-primary text-muted-foreground hover:bg-muted block w-full rounded-lg px-3 py-2 text-left text-sm transition"
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
                        className="hover:text-primary border-border text-foreground hover:bg-muted block rounded-lg border px-4 py-3 text-sm font-medium transition"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <NavLink
                        key={`${item.label}:${item.url}`}
                        to={item.url}
                        className={({ isActive }) =>
                          cn(
                            'border-border block rounded-lg border px-4 py-3 text-sm font-medium transition',
                            isActive
                              ? 'border-primary/20 bg-primary/5 text-primary'
                              : 'hover:text-primary text-foreground hover:bg-muted',
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    ),
                  )}
                </div>

                {isAuthenticated ? (
                  <div className="border-border space-y-2 border-t pt-3">
                    <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                      账户
                    </p>
                    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
                      <div className="relative bg-gradient-to-b from-green-50 to-emerald-50/50 px-3 py-3">
                        <button
                          type="button"
                          className="bg-card/90 text-muted-foreground hover:bg-card hover:text-foreground border-border absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border transition-colors"
                          onClick={() => navigate('/account?tab=profile')}
                          aria-label="打开账户设置"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-11 w-11 shadow-sm ring-[3px] ring-white/80">
                            <AvatarFallback className="text-sm">
                              {getInitials(accountName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-foreground truncate text-sm font-semibold tracking-tight">
                              {accountName}
                            </p>
                            {accountEmail ? (
                              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                {accountEmail}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-0.5 px-2 py-2">
                        <button
                          type="button"
                          className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                          onClick={() => navigate('/account?tab=notifications')}
                        >
                          <Bell className="text-muted-foreground h-4 w-4" />
                          消息通知
                          {unreadNotificationCount > 0 ? (
                            <span className="bg-destructive text-destructive-foreground ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold">
                              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                          onClick={() => navigate('/account?tab=profile')}
                        >
                          <UserCircle2 className="text-muted-foreground h-4 w-4" />
                          个人资料
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                          onClick={() => navigate('/account?tab=orders')}
                        >
                          <ShoppingBag className="text-muted-foreground h-4 w-4" />
                          我的订单
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                          onClick={() => navigate('/account?tab=apps')}
                        >
                          <Package2 className="text-muted-foreground h-4 w-4" />
                          我的应用
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                          onClick={() => navigate('/tickets')}
                        >
                          <CircleHelp className="text-muted-foreground h-4 w-4" />
                          我的工单
                        </button>
                        <button
                          type="button"
                          className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                          onClick={() => navigate('/account?tab=profile')}
                        >
                          <Settings className="text-muted-foreground h-4 w-4" />
                          设置
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="hover:text-primary text-foreground hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition"
                            onClick={() => navigate('/admin')}
                          >
                            <LayoutDashboard className="text-muted-foreground h-4 w-4" />
                            管理后台
                          </button>
                        ) : null}
                        <div className="border-border mx-1 border-t" />
                        <button
                          type="button"
                          className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition-colors"
                          onClick={logout}
                        >
                          <LogOut className="h-4 w-4" />
                          退出登录
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-border flex gap-2 border-t pt-3 sm:hidden">
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
