import {
  App,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  Space,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  DownOutlined,
  BulbOutlined,
  LogoutOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '@/api/auth';
import { getPublicSiteSettings } from '@/api/settings';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { adminNavigationGroups, adminSectionMeta, resolveAdminSection } from '@/lib/foundation';
import { hasPermission, normalizeRole, roleLabels } from '@/lib/rbac';
import { getSiteDisplayName, PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';
import { getInitials } from '@/lib/utils';
import { resolveIcon } from '@/lib/section-icons';
import { AdminUiProvider } from './AdminUiProvider';
import { AdminDraftGuard } from './AdminDraftGuard';
import { AdminCommandPalette } from './AdminCommandPalette';
import { PageTitleContext } from './page-context';
import { AsyncState } from './AsyncState';

export function AdminShell() {
  return (
    <AdminUiProvider>
      <AdminDraftGuard>
        <AdminLayout />
      </AdminDraftGuard>
    </AdminUiProvider>
  );
}
function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { message } = App.useApp();
  const { resolvedTheme, setTheme } = useTheme();
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const { data: settings } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  const { data: profile } = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
    enabled: !!user,
    staleTime: 60_000,
  });
  const name = profile?.user?.displayName?.trim() || user?.email?.split('@')[0] || '管理员';
  const sectionKey = resolveAdminSection(location.pathname);
  const section = sectionKey ? adminSectionMeta[sectionKey] : undefined;
  const role = normalizeRole(user?.role);
  const go = (href: string) => {
    setMobileOpen(false);
    void Promise.resolve(navigate(href)).catch((error: unknown) => {
      void message.error(error instanceof Error ? error.message : '页面跳转失败');
    });
  };
  const items: MenuProps['items'] = adminNavigationGroups
    .map((group) => ({
      key: group.label,
      label: group.label,
      icon: (() => {
        const Icon = resolveIcon(adminSectionMeta[group.items[0]!].icon);
        return <Icon size={16} />;
      })(),
      children: group.items
        .filter((key) => hasPermission(role, adminSectionMeta[key].permission))
        .map((key) => {
          const meta = adminSectionMeta[key];
          return { key: meta.href, label: meta.navTitle };
        }),
    }))
    .filter((group) => group.children.length > 0);
  useEffect(() => {
    if (!collapsed && section)
      setOpenKeys((current) => [...new Set([...current, section.groupLabel])]);
  }, [collapsed, section]);
  const accountItems: MenuProps['items'] = [
    ...[
      ['/account?tab=profile', '个人资料'],
      ['/account?tab=orders', '我的订单'],
      ['/account?tab=apps', '我的应用'],
      ['/tickets', '我的工单'],
    ].map(([key, label]) => ({ key: key!, label })),
    ...(hasPermission(role, 'settings.manage')
      ? [{ key: '/admin/settings', label: '系统设置' }]
      : []),
    { key: 'help', label: '帮助文档' },
    { type: 'divider' },
    { key: 'logout', label: '退出登录', danger: true, icon: <LogoutOutlined /> },
  ];
  const accountMenu: MenuProps = {
    items: accountItems,
    onClick: ({ key }) => {
      if (key === 'help') window.open('/api-docs', '_blank', 'noopener,noreferrer');
      else if (key === 'logout')
        void logout().catch((error: unknown) => {
          void message.error(error instanceof Error ? error.message : '退出登录失败，请重试');
        });
      else go(key);
    },
  };
  const accountMenuContent = (menu: ReactNode) => (
    <div className="admin-account-menu">
      <div className="admin-account-menu__identity">
        <Avatar className="admin-account__avatar" size={38} icon={<UserOutlined />} />
        <div className="admin-account-menu__copy">
          <strong>{name}</strong>
          <span>{user?.email}</span>
          <span>{roleLabels[role]}</span>
        </div>
      </div>
      {menu}
    </div>
  );
  const navigation = (small: boolean) => {
    const compact = !small && collapsed;
    return (
      <div className="admin-navigation-layout">
        <div className={`admin-brand ${compact ? 'admin-brand--collapsed' : ''}`}>
          <Link className="admin-brand__link" to="/" aria-label="返回应用中心">
            {!compact && settings?.logoUrl ? (
              <img
                className="admin-brand__full-logo"
                src={settings.logoUrl}
                alt={getSiteDisplayName(settings)}
              />
            ) : (
              <>
                <Avatar
                  className="brand-mark brand-mark--compact"
                  shape="square"
                  src={settings?.faviconUrl || settings?.logoUrl || undefined}
                >
                  {getInitials(getSiteDisplayName(settings))}
                </Avatar>
                {!compact && (
                  <div className="admin-brand__copy">
                    <strong>{getSiteDisplayName(settings)}</strong>
                    <span>Admin Console</span>
                  </div>
                )}
              </>
            )}
          </Link>
          {!small && (
            <Tooltip title={collapsed ? '打开边栏' : '收起边栏'} placement="right">
              <Button
                type="text"
                className="admin-brand__toggle"
                aria-label={collapsed ? '打开边栏' : '收起边栏'}
                icon={
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path d="M9 3v18" stroke="currentColor" strokeWidth="2" />
                  </svg>
                }
                onClick={() => setCollapsed(!collapsed)}
              />
            </Tooltip>
          )}
        </div>
        <Menu
          mode="inline"
          inlineIndent={14}
          inlineCollapsed={compact}
          selectedKeys={section ? [section.href] : []}
          openKeys={compact ? undefined : openKeys}
          onOpenChange={setOpenKeys}
          items={items}
          onClick={({ key }) => go(key)}
          className="admin-navigation"
        />
        <div className={`admin-sider__footer ${compact ? 'admin-sider__footer--collapsed' : ''}`}>
          <Dropdown
            trigger={['click']}
            placement="topLeft"
            menu={accountMenu}
            popupRender={accountMenuContent}
          >
            <Button
              className={`admin-sider-user ${compact ? 'admin-sider-user--collapsed' : ''}`}
              type="text"
              aria-label="管理员账户"
            >
              <Avatar className="admin-account__avatar" size={34} icon={<UserOutlined />} />
              {!compact && (
                <span className="admin-sider-user__copy">
                  <strong>{name}</strong>
                  <span>{user?.email}</span>
                </span>
              )}
              {!compact && <DownOutlined className="admin-account__chevron" />}
            </Button>
          </Dropdown>
        </div>
      </div>
    );
  };
  return (
    <PageTitleContext.Provider value={setPageTitle}>
      <Layout className="admin-layout">
        {screens.lg && (
          <Layout.Sider
            width={240}
            collapsedWidth={72}
            collapsed={collapsed}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            className={`admin-sider ${resolvedTheme === 'dark' ? 'admin-sider--dark' : ''}`}
          >
            {navigation(false)}
          </Layout.Sider>
        )}
        <Drawer
          open={!screens.lg && mobileOpen}
          onClose={() => setMobileOpen(false)}
          placement="left"
          size={280}
          styles={{ body: { padding: 0, overflow: 'hidden' }, header: { display: 'none' } }}
        >
          {navigation(true)}
        </Drawer>
        <Layout
          className="admin-main"
          style={{ marginInlineStart: screens.lg ? (collapsed ? 72 : 240) : 0 }}
        >
          <Layout.Header
            className={`admin-header ${resolvedTheme === 'dark' ? 'admin-header--dark' : ''}`}
          >
            <Space className="admin-header__title">
              {!screens.lg && (
                <Button
                  type="text"
                  icon={<MenuUnfoldOutlined />}
                  aria-label="打开侧边栏"
                  onClick={() => setMobileOpen(true)}
                />
              )}
              <div className="admin-header__context">
                <h1>{pageTitle || section?.title || '管理后台'}</h1>
              </div>
            </Space>
            <div className="admin-header__actions">
              <Button
                className="admin-search-trigger"
                icon={<SearchOutlined />}
                aria-label="搜索页面"
                onClick={() => setCommandOpen(true)}
              >
                {screens.md && (
                  <>
                    <span>搜索页面、资源…</span>
                    <kbd>⌘K</kbd>
                  </>
                )}
              </Button>
              <div className="admin-header__utilities">
                <Tooltip title={resolvedTheme === 'light' ? '切换深色主题' : '切换浅色主题'}>
                  <Button
                    type="text"
                    icon={resolvedTheme === 'light' ? <MoonOutlined /> : <BulbOutlined />}
                    aria-label="切换主题"
                    onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
                  />
                </Tooltip>
              </div>
              <Dropdown
                menu={accountMenu}
                trigger={['click']}
                placement="bottomRight"
                popupRender={accountMenuContent}
              >
                <Button type="text" className="admin-account" aria-label="打开账户菜单">
                  <Space>
                    <Avatar className="admin-account__avatar" size={32} icon={<UserOutlined />} />
                    {screens.lg && (
                      <>
                        <span className="admin-account__copy">
                          <strong>{name}</strong>
                        </span>
                        <DownOutlined className="admin-account__chevron" />
                      </>
                    )}
                  </Space>
                </Button>
              </Dropdown>
            </div>
          </Layout.Header>
          <Layout.Content className="admin-content">
            <ErrorBoundary
              key={location.pathname}
              fallbackRender={({ error, resetErrorBoundary }) => (
                <AsyncState
                  error={error instanceof Error ? error : new Error('页面加载失败')}
                  onRetry={resetErrorBoundary}
                >
                  {null}
                </AsyncState>
              )}
            >
              <Suspense fallback={<AsyncState loading>{null}</AsyncState>}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </Layout.Content>
        </Layout>
      </Layout>
      <AdminCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </PageTitleContext.Provider>
  );
}
