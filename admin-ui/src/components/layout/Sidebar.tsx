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
        'border-border sticky top-0 flex h-screen flex-col overflow-hidden border-r bg-[#f7f8fb] transition-all duration-200',
        collapsed ? 'w-[84px]' : 'w-[268px]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'group/brand relative shrink-0 px-4 pb-4 pt-5',
          collapsed ? 'space-y-0' : 'flex items-center gap-3',
        )}
      >
        <div className={cn('flex items-center gap-3', collapsed ? 'justify-center' : 'min-w-0')}>
          <div className="shrink-0">
            {siteSettings?.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteName}
                className="border-border bg-card h-10 w-10 rounded-2xl border object-contain p-1.5 shadow-sm"
              />
            ) : (
              <div className="from-primary shadow-primary/20 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br to-blue-500 text-sm font-semibold text-white shadow-sm">
                {getInitials(siteName)}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-foreground truncate text-base font-semibold leading-tight tracking-tight">
                {siteName}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">Admin Console</p>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground h-8 w-8 rounded-full border',
            collapsed
              ? 'absolute right-3 top-1/2 -translate-y-1/2 opacity-0 shadow-sm transition-opacity duration-150 group-hover/brand:opacity-100'
              : 'ml-auto shrink-0',
          )}
          onClick={onToggle}
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-2">
        {adminNavigationGroups.map((group) => (
          <div key={group.label} className="mb-2.5">
            {!collapsed && (
              <p className="text-muted-foreground/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
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
                    'relative mb-1 flex min-h-[46px] items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all',
                    'text-sm font-semibold no-underline',
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'text-muted-foreground hover:border-border hover:bg-card hover:text-foreground border-transparent hover:shadow-sm',
                  )}
                >
                  {isActive && !collapsed ? (
                    <span className="bg-card/70 absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full" />
                  ) : null}
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-semibold transition-colors',
                      isActive
                        ? 'bg-card/10 border-white/10 text-white shadow-sm'
                        : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {meta.icon}
                  </span>
                  {!collapsed && (
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">
                        {meta.navTitle}
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </ScrollArea>

      {/* User */}
      <div className="border-border shrink-0 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'border-border/90 bg-card/95 hover:border-border hover:bg-card w-full rounded-2xl border text-left shadow-sm transition',
                collapsed
                  ? 'flex items-center justify-center p-2.5'
                  : 'flex items-center gap-3 px-3 py-2.5',
              )}
              title={collapsed ? (user?.email ?? '管理员') : undefined}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs">{getInitials(accountName)}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-semibold">{accountName}</p>
                    {accountEmail ? (
                      <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                        {accountEmail}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {user?.role === 'admin' ? '管理员' : '用户'}
                    </p>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4" />
                </>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={collapsed ? 'start' : 'end'}
            side="top"
            className="border-border bg-card w-[300px] rounded-xl border p-0 shadow-lg"
          >
            <DropdownMenuLabel className="px-0 py-0">
              <div className="relative rounded-t-xl bg-gradient-to-b from-green-50 to-emerald-50/50 px-5 py-5">
                <button
                  type="button"
                  className="bg-card/90 text-muted-foreground hover:bg-card hover:text-foreground absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 shadow-sm transition"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    navigate('/admin/settings');
                  }}
                  aria-label="打开设置"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <div className="flex flex-col items-center text-center">
                  <Avatar className="h-[72px] w-[72px] shadow-sm ring-4 ring-white/80">
                    <AvatarFallback className="text-lg">{getInitials(accountName)}</AvatarFallback>
                  </Avatar>
                  <p className="text-foreground mt-3 text-lg font-semibold tracking-tight">
                    {accountName}
                  </p>
                  {accountEmail ? (
                    <p className="text-muted-foreground mt-1 text-sm">{accountEmail}</p>
                  ) : null}
                  <p className="text-muted-foreground mt-1 text-xs font-medium">
                    {user?.role === 'admin' ? '管理员' : '用户'}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <div className="px-3 py-3">
              <div className="space-y-1">
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/account?tab=profile');
                  }}
                >
                  <UserCircle2 className="text-muted-foreground h-4 w-4" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/account?tab=orders');
                  }}
                >
                  <ShoppingBag className="text-muted-foreground h-4 w-4" />
                  我的订单
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/account?tab=apps');
                  }}
                >
                  <Package2 className="text-muted-foreground h-4 w-4" />
                  我的应用
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/tickets');
                  }}
                >
                  <CircleHelp className="text-muted-foreground h-4 w-4" />
                  我的工单
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="my-3" />

              <div className="space-y-1">
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/admin');
                  }}
                >
                  <LayoutDashboard className="text-muted-foreground h-4 w-4" />
                  后台首页
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    navigate('/admin/settings');
                  }}
                >
                  <Settings className="text-muted-foreground h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-2xl px-3 py-3 text-[15px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    window.open('/api-docs', '_blank', 'noopener,noreferrer');
                  }}
                >
                  <CircleHelp className="text-muted-foreground h-4 w-4" />
                  帮助
                </DropdownMenuItem>
              </div>

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
      </div>
    </aside>
  );
}
