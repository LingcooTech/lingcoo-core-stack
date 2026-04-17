import { LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth';
import { adminNavigationGroups, adminSectionMeta, type AdminSectionKey } from '@/lib/foundation';
import { cn, getInitials } from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const currentSection = Object.entries(adminSectionMeta).find(
    ([, meta]) => meta.href === location.pathname || location.pathname.startsWith(meta.href + '/')
  )?.[0] as AdminSectionKey | undefined;

  return (
    <aside
      className={cn(
        'sticky top-0 h-screen flex flex-col bg-[#f3f5f8] border-r border-border overflow-hidden transition-all duration-200',
        collapsed ? 'w-[84px]' : 'w-[268px]'
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex-shrink-0 w-10 h-10 rounded-md bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-white text-sm font-semibold shadow-lg shadow-primary/20">
          FD
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-foreground leading-tight">fd-core-stack</p>
            <p className="text-xs text-muted-foreground">管理后台</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-2">
        {adminNavigationGroups.map((group) => (
          <div key={group.label} className="mb-2">
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
                  className={cn(
                    'flex items-start gap-2.5 min-h-[52px] px-3 py-2.5 rounded-md border transition-colors mb-0.5',
                    'text-sm font-bold text-foreground no-underline',
                    isActive
                      ? 'bg-blue-50 border-blue-100 text-primary'
                      : 'border-transparent hover:bg-white hover:border-border'
                  )}
                >
                  <span
                    className={cn(
                      'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold border',
                      isActive
                        ? 'bg-blue-100 border-blue-200 text-primary'
                        : 'bg-white border-border text-muted-foreground'
                    )}
                  >
                    {meta.icon}
                  </span>
                  {!collapsed && (
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{meta.navTitle}</span>
                      <span className="block text-xs text-muted-foreground font-medium mt-0.5 leading-snug">
                        {meta.navNote}
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
