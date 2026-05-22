import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Package2,
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
import { useAuth } from '@/lib/auth';
import { adminNavigationGroups, adminSectionMeta, resolveAdminSection } from '@/lib/foundation';
import { getSiteDisplayName, PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';
import { cn, getInitials } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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

  return (
    <aside
      className={cn(
        'bg-muted/40 border-border sticky top-0 flex h-screen flex-col overflow-hidden border-r transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-[240px]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'group/brand relative shrink-0 px-3 pb-3 pt-4',
          collapsed ? 'space-y-0' : 'flex items-center gap-2.5',
        )}
      >
        <div className={cn('flex items-center gap-2.5', collapsed ? 'justify-center' : 'min-w-0')}>
          <div className="shrink-0">
            {siteSettings?.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteName}
                className="border-border bg-card h-8 w-8 rounded-lg border object-contain p-1"
              />
            ) : (
              <div className="from-primary flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br to-blue-500 text-[11px] font-semibold text-white">
                {getInitials(siteName)}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-foreground truncate text-[13px] font-semibold leading-tight tracking-tight">
                {siteName}
              </p>
              <p className="text-muted-foreground/80 mt-0.5 text-[10px]">Admin Console</p>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'text-muted-foreground hover:bg-muted hover:text-foreground h-7 w-7 rounded-md',
            collapsed
              ? 'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100'
              : 'ml-auto shrink-0',
          )}
          onClick={onToggle}
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-2">
        {adminNavigationGroups.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <p className="text-muted-foreground/60 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
                {group.label}
              </p>
            )}
            {group.items.map((key) => {
              const meta = adminSectionMeta[key];
              const isActive = currentSection === key;
              return (
                <Link
                  key={key}
                  to={meta.href}
                  title={collapsed ? meta.navTitle : undefined}
                  className={cn(
                    'relative mb-0.5 flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium no-underline transition-colors',
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                  )}
                >
                  {isActive && !collapsed ? (
                    <span className="bg-primary absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r" />
                  ) : null}
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center text-[11px] transition-colors',
                      isActive ? 'text-primary' : 'text-muted-foreground/80',
                    )}
                  >
                    {meta.icon}
                  </span>
                  {!collapsed && <span className="truncate">{meta.navTitle}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </ScrollArea>

      {/* User */}
      <div className="border-border shrink-0 border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'hover:bg-card/80 w-full rounded-md text-left transition-colors',
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
                    <p className="text-foreground truncate text-[13px] font-medium leading-tight">
                      {accountName}
                    </p>
                    {accountEmail ? (
                      <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
                        {accountEmail}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="text-muted-foreground/60 h-3.5 w-3.5 shrink-0" />
                </>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={collapsed ? 'start' : 'end'}
            side="top"
            className="border-border bg-card w-[260px] rounded-lg border p-1 shadow-lg"
          >
            <DropdownMenuLabel className="px-2 pb-2 pt-2">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs">{getInitials(accountName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-semibold leading-tight">
                    {accountName}
                  </p>
                  {accountEmail ? (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">{accountEmail}</p>
                  ) : null}
                  <p className="text-muted-foreground/70 mt-0.5 text-[10px] font-medium uppercase tracking-wider">
                    {user?.role === 'admin' ? '管理员' : '用户'}
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
                    navigate('/account?tab=profile');
                  }}
                >
                  <UserCircle2 className="text-muted-foreground h-4 w-4" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/account?tab=orders');
                  }}
                >
                  <ShoppingBag className="text-muted-foreground h-4 w-4" />
                  我的订单
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/account?tab=apps');
                  }}
                >
                  <Package2 className="text-muted-foreground h-4 w-4" />
                  我的应用
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/tickets');
                  }}
                >
                  <CircleHelp className="text-muted-foreground h-4 w-4" />
                  我的工单
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-1" />

              <div className="space-y-1">
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/admin');
                  }}
                >
                  <LayoutDashboard className="text-muted-foreground h-4 w-4" />
                  后台首页
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/admin/settings');
                  }}
                >
                  <Settings className="text-muted-foreground h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-md px-2.5 py-2 text-[13px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    window.open('/api-docs', '_blank', 'noopener,noreferrer');
                  }}
                >
                  <CircleHelp className="text-muted-foreground h-4 w-4" />
                  帮助
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-1" />

              <DropdownMenuItem
                className="rounded-md px-2.5 py-2 text-[13px] text-rose-600 focus:bg-rose-50 focus:text-rose-600"
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
      </div>
    </aside>
  );
}
