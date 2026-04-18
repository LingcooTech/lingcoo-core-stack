import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth';
import { adminNavigationGroups, adminSectionMeta, type AdminSectionKey } from '@/lib/foundation';
import { cn, getInitials } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

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
      <div className={cn('px-4 pt-5 pb-4 flex-shrink-0', collapsed ? 'space-y-3' : 'flex items-center gap-3')}>
        <div className={cn('flex items-center gap-3', collapsed ? 'justify-center' : 'min-w-0')}>
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-white text-sm font-semibold shadow-sm shadow-primary/20">
            FD
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-foreground leading-tight">fd-core-stack</p>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900',
            collapsed ? 'mx-auto flex' : 'ml-auto flex-shrink-0',
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
                    'mb-1 flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all',
                    'text-sm font-semibold no-underline',
                    isActive
                      ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm'
                      : 'border-transparent text-slate-600 hover:bg-white hover:border-slate-200 hover:text-slate-900 hover:shadow-sm'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold border transition-colors',
                      isActive
                        ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
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
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-md p-2 hover:bg-white transition-colors cursor-pointer',
            collapsed ? 'justify-center' : ''
          )}
          onClick={logout}
          title="退出登录"
        >
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="text-xs">{getInitials(user?.email)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="text-xs font-bold text-foreground truncate flex-1">{user?.email ?? '管理员'}</span>
              <LogOut className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
