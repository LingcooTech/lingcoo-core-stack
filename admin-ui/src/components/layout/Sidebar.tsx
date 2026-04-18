import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  LogOut,
  Settings,
  UserCircle2,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
import { adminNavigationGroups, adminSectionMeta, type AdminSectionKey } from '@/lib/foundation';
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
  const siteName = getSiteDisplayName(siteSettings);

  const currentSection = Object.entries(adminSectionMeta).find(
    ([, meta]) => meta.href === location.pathname || location.pathname.startsWith(meta.href + '/')
  )?.[0] as AdminSectionKey | undefined;

  return (
    <aside
      className={cn(
        'sticky top-0 h-screen flex flex-col bg-[#f7f8fb] border-r border-border overflow-hidden transition-all duration-200',
        collapsed ? 'w-[84px]' : 'w-[268px]'
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'group/brand relative px-4 pt-5 pb-4 flex-shrink-0',
          collapsed ? 'space-y-0' : 'flex items-center gap-3',
        )}
      >
        <div className={cn('flex items-center gap-3', collapsed ? 'justify-center' : 'min-w-0')}>
          <div className="flex-shrink-0">
            {siteSettings?.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt={siteName}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white object-contain p-1.5 shadow-sm"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-sm font-semibold text-white shadow-sm shadow-primary/20">
                {getInitials(siteName)}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-foreground leading-tight">{siteName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Admin Console</p>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900',
            collapsed
              ? 'absolute right-3 top-1/2 -translate-y-1/2 opacity-0 shadow-sm transition-opacity duration-150 group-hover/brand:opacity-100'
              : 'ml-auto flex-shrink-0',
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
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
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
                    'relative mb-1 flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all',
                    'text-sm font-semibold no-underline',
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-transparent text-slate-600 hover:bg-white hover:border-slate-200 hover:text-slate-900 hover:shadow-sm'
                  )}
                >
                  {isActive && !collapsed ? (
                    <span className="absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-white/70" />
                  ) : null}
                  <span
                    className={cn(
                      'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold border transition-colors',
                      isActive
                        ? 'bg-white/10 border-white/10 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500'
                    )}
                  >
                    {meta.icon}
                  </span>
                  {!collapsed && (
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{meta.navTitle}</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </ScrollArea>

      {/* User */}
      <div className="flex-shrink-0 border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50',
                collapsed ? 'flex items-center justify-center p-2.5' : 'flex items-center gap-3 px-3 py-3',
              )}
              title={collapsed ? (user?.email ?? '管理员') : undefined}
            >
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarFallback className="text-xs">{getInitials(user?.email)}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{user?.email ?? '管理员'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{user?.role === 'admin' ? '管理员' : '用户'}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={collapsed ? 'start' : 'end'}
            side="top"
            className="w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
          >
            <DropdownMenuLabel className="px-3 py-3 text-left">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">{getInitials(user?.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{user?.email ?? '管理员'}</p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">{user?.role === 'admin' ? '管理员' : '用户'}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                navigate('/account?tab=profile');
              }}
            >
              <UserCircle2 className="h-4 w-4" />
              个人资料
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                navigate('/admin/settings');
              }}
            >
              <Settings className="h-4 w-4" />
              设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                window.open('/docs', '_blank', 'noopener,noreferrer');
              }}
            >
              <CircleHelp className="h-4 w-4" />
              帮助
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
