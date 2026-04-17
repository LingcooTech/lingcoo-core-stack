import { Boxes, LayoutDashboard, LogIn, LogOut, ReceiptText, Rocket, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { getPublicSiteSettings } from '@/api/settings';
import { Container } from '@/components/layout/Container';
import { ConsumerFooter } from '@/components/portal/ConsumerFooter';
import { Button } from '@/components/ui/button';
import { userSectionMeta, type UserSectionKey } from '@/lib/user-foundation';
import { getSiteDisplayName, PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';
import { useAuth } from '@/lib/auth';
import { cn, getInitials } from '@/lib/utils';

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
  const { data: siteSettings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000
  });
  const siteName = getSiteDisplayName(siteSettings);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#edf3f8_42%,#f7fafc_100%)]">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm shadow-sm">
        <Container className="py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* 左侧: Logo 区域 (1/5) */}
            <div className="flex items-center justify-between w-full lg:w-1/5 lg:justify-start">
              <Link to="/" className="flex items-center gap-3">
                {siteSettings?.logoUrl ? (
                  <img
                    src={siteSettings.logoUrl}
                    alt={siteName}
                    className="h-11 w-11 rounded-lg border border-gray-200 bg-white object-contain p-1 shadow-sm"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-gray-950 via-gray-800 to-blue-600 text-sm font-semibold tracking-wide text-white shadow-lg shadow-gray-900/15">
                    {getInitials(siteName)}
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Consumer Portal</p>
                  <p className="text-base font-semibold tracking-tight text-gray-900">{siteName}</p>
                </div>
              </Link>
            </div>

            {/* 中间: 导航菜单 (3/5) - 桌面端显示 */}
            <nav className="hidden lg:flex items-center justify-center w-full lg:w-3/5 gap-6"
                 aria-label="主导航">
              {navItems.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'inline-flex items-center gap-2 text-base font-normal whitespace-nowrap transition-colors duration-200',
                        isActive 
                          ? 'text-primary font-medium' 
                          : 'text-gray-600 hover:text-primary'
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            {/* 右侧: 工具区域 (1/5) */}
            <div className="flex flex-wrap items-center justify-end gap-2 w-full lg:w-1/5">
              <div className="hidden rounded-lg border border-gray-200/80 bg-gray-50/80 px-3 py-2 text-right lg:block">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Consumer Portal</p>
                <p className="text-xs font-semibold text-slate-900">应用发现 · 购买授权 · 部署交付</p>
              </div>
              {isAuthenticated ? (
                <>
                  <div className="hidden rounded-lg border border-gray-200 bg-white px-3 py-2 text-right sm:block">
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

          {/* 移动端导航菜单 */}
          <nav className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 lg:hidden" aria-label="移动端导航">
            {navItems.map((item) => {
              const Icon = iconMap[item.icon];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition-all hover:border-slate-300 hover:text-slate-900',
                      isActive && 'border-slate-900 bg-gray-900 text-white hover:border-slate-900 hover:text-white'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </Container>
      </header>

      {isAuthenticated && user && !user.emailVerified ? (
        <div className="border-b border-amber-200 bg-amber-50/90">
          <Container className="flex items-center justify-between gap-4 py-3 text-sm">
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

      <Container as="main" className="py-10">
        <Outlet />
      </Container>

      <ConsumerFooter siteSettings={siteSettings} />
    </div>
  );
}
