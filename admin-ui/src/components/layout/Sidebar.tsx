import { runAsync } from '@/lib/async-events';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Package2,
  PanelLeft,
  Settings,
  ShoppingBag,
  UserCircle2,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/api/auth';
import { getPublicSiteSettings } from '@/api/settings';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/lib/auth';
import { adminNavigationGroups, adminSectionMeta, resolveAdminSection } from '@/lib/foundation';
import { hasPermission, normalizeRole, roleLabels } from '@/lib/rbac';
import { resolveIcon } from '@/lib/section-icons';
import { getSiteDisplayName, PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';
import { cn, getInitials } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  showCollapseToggle?: boolean;
}

export function Sidebar({ collapsed, onToggle, showCollapseToggle = true }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const { data: currentUserData } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const siteName = getSiteDisplayName(siteSettings);
  const currentUser = currentUserData?.user ?? null;
  const accountName =
    currentUser?.displayName?.trim() || user?.email?.split('@')[0]?.trim() || '管理员账户';
  const accountEmail = currentUser?.email || user?.email || '';

  const currentSection = resolveAdminSection(location.pathname);
  const currentRole = normalizeRole(user?.role);
  const visibleNavigationGroups = adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((key) =>
        hasPermission(currentRole, adminSectionMeta[key].permission),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col overflow-hidden border-r border-border bg-muted/40 transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'group/brand relative shrink-0 px-3 pt-4 pb-3',
          collapsed ? 'space-y-0' : 'flex items-center gap-2.5',
        )}
      >
        <Link
          to="/"
          className={cn(
            'flex items-center gap-2.5 no-underline',
            collapsed ? 'justify-center' : 'min-w-0 flex-1',
          )}
          aria-label="返回控制台"
        >
          <div className="shrink-0">
            {siteSettings?.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteName}
                className="h-8 w-8 rounded-lg border border-border bg-card object-contain p-1"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-blue-500 text-[11px] font-semibold text-white">
                {getInitials(siteName)}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] leading-tight font-semibold tracking-tight text-foreground">
                {siteName}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/80">Admin Console</p>
            </div>
          )}
        </Link>
        {showCollapseToggle ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
                  collapsed
                    ? 'absolute inset-x-3 top-4 z-10 h-8 w-auto bg-background opacity-0 shadow-sm group-hover/brand:opacity-100'
                    : 'ml-auto h-7 w-7 shrink-0',
                )}
                onClick={onToggle}
                aria-label={collapsed ? '打开边栏' : '收起边栏'}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {collapsed ? '打开边栏' : '收起边栏'}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Nav */}
      <ScrollArea className={cn('flex-1 px-2', collapsed && 'pt-2')}>
        {visibleNavigationGroups.map((group) => (
          <div key={group.label} className={cn(collapsed ? 'mb-2 space-y-2' : 'mb-3')}>
            {!collapsed && (
              <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/60 uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((key) => {
              const meta = adminSectionMeta[key];
              const Icon = resolveIcon(meta.icon);
              const isActive = currentSection === key;
              const link = (
                <Link
                  key={key}
                  to={meta.href}
                  className={cn(
                    'relative flex items-center rounded-md no-underline transition-colors',
                    collapsed
                      ? 'mb-0 h-10 justify-center px-1'
                      : 'mb-0.5 h-9 gap-2.5 px-2.5 text-[13px] font-medium',
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                  )}
                >
                  {isActive && !collapsed ? (
                    <span className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                  ) : null}
                  <Icon
                    className={cn(
                      'shrink-0',
                      collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4',
                      isActive ? 'text-primary' : 'text-muted-foreground/70',
                    )}
                    strokeWidth={1.75}
                  />
                  {!collapsed ? <span className="truncate">{meta.navTitle}</span> : null}
                </Link>
              );
              if (collapsed) {
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {meta.navTitle}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </div>
        ))}
      </ScrollArea>

      {/* User */}
      <div className="shrink-0 border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full rounded-md text-left transition-colors hover:bg-card/80',
                collapsed
                  ? 'flex items-center justify-center p-1.5'
                  : 'flex items-center gap-2.5 px-2 py-1.5',
              )}
              title={collapsed ? (user?.email ?? '管理员') : undefined}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px]">{getInitials(accountName)}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-tight font-medium text-foreground">
                      {accountName}
                    </p>
                    {accountEmail ? (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {accountEmail}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                </>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={collapsed ? 'start' : 'end'}
            side="top"
            className="w-[260px] rounded-lg border border-border bg-card p-1 shadow-lg"
          >
            <DropdownMenuLabel className="px-2 pt-2 pb-2">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs">{getInitials(accountName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-tight font-semibold text-foreground">
                    {accountName}
                  </p>
                  {accountEmail ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{accountEmail}</p>
                  ) : null}
                  <p className="mt-0.5 text-[10px] font-medium tracking-wider text-muted-foreground/70 uppercase">
                    {roleLabels[normalizeRole(user?.role)]}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="py-1">
              <div className="space-y-0.5">
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    runAsync(() => navigate('/account?tab=profile'));
                  }}
                >
                  <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    runAsync(() => navigate('/account?tab=orders'));
                  }}
                >
                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                  我的订单
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    runAsync(() => navigate('/account?tab=apps'));
                  }}
                >
                  <Package2 className="h-4 w-4 text-muted-foreground" />
                  我的应用
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    runAsync(() => navigate('/tickets'));
                  }}
                >
                  <CircleHelp className="h-4 w-4 text-muted-foreground" />
                  我的工单
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-1" />

              <div className="space-y-1">
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    runAsync(() => navigate('/admin'));
                  }}
                >
                  <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                  后台首页
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    runAsync(() => navigate('/admin/settings'));
                  }}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    window.open('/api-docs', '_blank', 'noopener,noreferrer');
                  }}
                >
                  <CircleHelp className="h-4 w-4 text-muted-foreground" />
                  帮助
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                className="rounded-md px-2.5 py-2 text-[13px] text-rose-600 focus:bg-rose-50 focus:text-rose-600"
                onSelect={(event) => {
                  event.preventDefault();
                  runAsync(() => logout());
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
