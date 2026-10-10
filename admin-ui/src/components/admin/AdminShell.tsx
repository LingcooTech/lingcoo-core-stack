import {
  App,
  Avatar,
  Breadcrumb,
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
  DesktopOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SearchOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Suspense, useState } from 'react';
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
  const { theme, setTheme } = useTheme();
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
      type: 'group' as const,
      key: group.label,
      label: group.label,
      children: group.items
        .filter((key) => hasPermission(role, adminSectionMeta[key].permission))
        .map((key) => {
          const meta = adminSectionMeta[key];
          const Icon = resolveIcon(meta.icon);
          return { key: meta.href, label: meta.navTitle, icon: <Icon size={16} /> };
        }),
    }))
    .filter((group) => group.children.length > 0);
  const themeItems: MenuProps['items'] = [
    { key: 'light', label: '浅色', icon: <SunOutlined /> },
    { key: 'dark', label: '深色', icon: <MoonOutlined /> },
    { key: 'system', label: '跟随系统', icon: <DesktopOutlined /> },
  ];
  const accountItems: MenuProps['items'] = [
    {
      key: 'identity',
      label: (
        <>
          <strong>{name}</strong>
          <br />
          {user?.email}
          <br />
          {roleLabels[role]}
        </>
      ),
      disabled: true,
    },
    { type: 'divider' },
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
  const navigation = (small: boolean) => (
    <div className="admin-navigation">
      <div className={`admin-brand${!small && collapsed ? 'admin-brand--collapsed' : ''}`}>
        <Link to="/" aria-label="返回应用中心">
          <Avatar shape="square" src={settings?.logoUrl || undefined}>
            {getInitials(getSiteDisplayName(settings))}
          </Avatar>
          {(small || !collapsed) && <strong>{getSiteDisplayName(settings)}</strong>}
        </Link>
        {!small && (
          <Tooltip title={collapsed ? '打开边栏' : '收起边栏'}>
            <Button
              type="text"
              aria-label={collapsed ? '打开边栏' : '收起边栏'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
          </Tooltip>
        )}
      </div>
      <Menu
        mode="inline"
        inlineCollapsed={!small && collapsed}
        selectedKeys={section ? [section.href] : []}
        items={items}
        onClick={({ key }) => go(key)}
        className="admin-navigation__menu"
      />
      <Dropdown
        trigger={['click']}
        menu={{
          items: accountItems,
          onClick: ({ key }) => {
            if (key === 'help') window.open('/api-docs', '_blank', 'noopener,noreferrer');
            else if (key === 'logout')
              void logout().catch((error: unknown) => {
                void message.error(error instanceof Error ? error.message : '退出登录失败，请重试');
              });
            else if (key !== 'identity') go(key);
          },
        }}
      >
        <Button
          className="admin-account"
          type="text"
          icon={
            <Avatar size="small" icon={<UserOutlined />}>
              {getInitials(name)}
            </Avatar>
          }
          aria-label="管理员账户"
        >
          {(small || !collapsed) && <span className="admin-account__name">{name}</span>}
        </Button>
      </Dropdown>
    </div>
  );
  return (
    <PageTitleContext.Provider value={setPageTitle}>
      <Layout className="admin-layout">
        {screens.lg && (
          <Layout.Sider
            width={240}
            collapsedWidth={72}
            collapsed={collapsed}
            theme="light"
            className="admin-sider"
          >
            {navigation(false)}
          </Layout.Sider>
        )}
        <Drawer
          open={!screens.lg && mobileOpen}
          onClose={() => setMobileOpen(false)}
          placement="left"
          size={260}
          title="管理导航"
          styles={{ body: { padding: 0 } }}
        >
          {navigation(true)}
        </Drawer>
        <Layout className="admin-main">
          <Layout.Header className="admin-header">
            <Space className="admin-header__title">
              {!screens.lg && (
                <Button
                  type="text"
                  icon={<MenuUnfoldOutlined />}
                  aria-label="打开侧边栏"
                  onClick={() => setMobileOpen(true)}
                />
              )}
              <Breadcrumb
                items={[
                  ...(section ? [{ title: section.groupLabel }] : []),
                  { title: pageTitle || section?.title || '管理后台' },
                ]}
              />
            </Space>
            <Space>
              <Button
                icon={<SearchOutlined />}
                aria-label="搜索页面"
                onClick={() => setCommandOpen(true)}
              >
                {screens.md ? '搜索 · ⌘K' : null}
              </Button>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: themeItems,
                  selectedKeys: [theme],
                  onClick: ({ key }) => {
                    if (key === 'light' || key === 'dark' || key === 'system') setTheme(key);
                  },
                }}
              >
                <Button
                  type="text"
                  icon={
                    theme === 'dark' ? (
                      <MoonOutlined />
                    ) : theme === 'system' ? (
                      <DesktopOutlined />
                    ) : (
                      <SunOutlined />
                    )
                  }
                  aria-label="切换主题"
                />
              </Dropdown>
            </Space>
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
