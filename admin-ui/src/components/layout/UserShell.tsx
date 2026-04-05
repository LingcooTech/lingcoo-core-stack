import { Boxes, LayoutDashboard, LogIn, LogOut, ReceiptText, Rocket, ShieldCheck } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { userSectionMeta, type UserSectionKey } from '@/lib/user-foundation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

const iconMap = {
  BX: Boxes,
  RC: ReceiptText,
  SH: ShieldCheck,
  DP: Rocket
};

const navItems: Array<{ key: UserSectionKey; to: string; label: string; note: string; icon: keyof typeof iconMap }> = [
  { key: 'discover', to: userSectionMeta.discover.href, label: userSectionMeta.discover.navTitle, note: userSectionMeta.discover.navNote, icon: 'BX' },
  { key: 'orders', to: userSectionMeta.orders.href, label: userSectionMeta.orders.navTitle, note: userSectionMeta.orders.navNote, icon: 'RC' },
  { key: 'access', to: userSectionMeta.access.href, label: userSectionMeta.access.navTitle, note: userSectionMeta.access.navNote, icon: 'SH' },
  { key: 'deploy', to: userSectionMeta.deploy.href, label: userSectionMeta.deploy.navTitle, note: userSectionMeta.deploy.navNote, icon: 'DP' }
];

export function UserShell() {
  const location = useLocation();
  const { isAuthenticated, isAdmin, logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_45%),linear-gradient(180deg,#f8fbff_0%,#edf2f7_100%)]">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-sm font-black text-white shadow-lg shadow-primary/20">
                FD
              </div>
              <div>
                <p className="text-sm font-black tracking-tight">FD Stack</p>
                <p className="text-[11px] text-muted-foreground">应用中心</p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900',
                        isActive && 'bg-slate-900 text-white hover:bg-slate-900 hover:text-white'
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <div className="hidden rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right sm:block">
                  <p className="text-xs font-bold text-slate-900">{user?.email}</p>
                  <p className="text-[11px] text-muted-foreground">{isAdmin ? '管理员已登录' : '用户中心已登录'}</p>
                </div>
                {isAdmin ? (
                  <Button variant="outline" asChild>
                    <Link to="/admin">
                      <LayoutDashboard className="h-4 w-4" />
                      管理后台
                    </Link>
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                  退出
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/login">
                    <LogIn className="h-4 w-4" />
                    登录
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/register">注册</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {isAuthenticated && user && !user.emailVerified ? (
        <div className="border-b border-amber-200 bg-amber-50/90">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 text-sm sm:px-6">
            <div>
              <p className="font-bold text-amber-900">邮箱尚未验证</p>
              <p className="text-amber-800/80">请先完成邮箱验证，部分需要实名用户确认的接口会拒绝访问。</p>
            </div>
            <Button asChild size="sm">
              <Link to={`/verify-email?next=${encodeURIComponent(location.pathname)}`}>立即验证</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
