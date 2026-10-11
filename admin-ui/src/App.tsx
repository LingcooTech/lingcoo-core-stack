import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { lazyNamed, lazyRoute, preloadRouteElements } from '@/lib/lazy-route';
import { AppLoadingShell } from '@/components/layout/AppLoadingShell';
import { PageSkeleton } from '@/components/layout/PageSkeleton';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  matchRoutes,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { getPublicSiteSettings } from '@/api/settings';
import { EmptyState } from '@/components/portal/EmptyState';
import { AuthProvider, useAuth } from '@/lib/auth';
import {
  adminSectionMeta,
  listAllowedAdminSectionKeys,
  type AdminSectionKey,
} from '@/lib/foundation';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import {
  PUBLIC_SITE_SETTINGS_QUERY_KEY,
  syncBrandPrimaryColor,
  syncDocumentFavicon,
} from '@/lib/site-settings';
import { ThemeProvider } from '@/lib/theme';

const Shell = lazyNamed(() => import('@/components/admin/AdminShell'), 'AdminShell');
const UserShell = lazyNamed(() => import('@/components/layout/UserShell'), 'UserShell');
const DocsShell = lazyNamed(() => import('@/components/layout/DocsShell'), 'DocsShell');
const PortalUiProvider = lazyNamed(
  () => import('@/components/portal/PortalUiProvider'),
  'PortalUiProvider',
);
const AccountCenterPage = lazyNamed(() => import('@/pages/AccountCenterPage'), 'AccountCenterPage');
const AppCatalogPage = lazyNamed(() => import('@/pages/AppCatalogPage'), 'AppCatalogPage');
const AppEditPage = lazyNamed(() => import('@/pages/AppEditPage'), 'AppEditPage');
const AppsPage = lazyNamed(() => import('@/pages/AppsPage'), 'AppsPage');
const AiTranslateWorkflowPrivacyPage = lazyNamed(
  () => import('@/pages/AiTranslateWorkflowPrivacyPage'),
  'AiTranslateWorkflowPrivacyPage',
);
const AiTranslateWorkflowSupportPage = lazyNamed(
  () => import('@/pages/AiTranslateWorkflowSupportPage'),
  'AiTranslateWorkflowSupportPage',
);
const ContentDetailPage = lazyNamed(() => import('@/pages/ContentDetailPage'), 'ContentDetailPage');
const ContentEditPage = lazyNamed(() => import('@/pages/ContentEditPage'), 'ContentEditPage');
const ContentHubPage = lazyNamed(() => import('@/pages/ContentHubPage'), 'ContentHubPage');
const CreateTicketPage = lazyNamed(() => import('@/pages/CreateTicketPage'), 'CreateTicketPage');
const DocsHubPage = lazyNamed(() => import('@/pages/DocsHubPage'), 'DocsHubPage');
const DocsPage = lazyNamed(() => import('@/pages/DocsPage'), 'DocsPage');
const DocsSpacePage = lazyNamed(() => import('@/pages/DocsSpacePage'), 'DocsSpacePage');
const DashboardPage = lazyNamed(() => import('@/pages/DashboardPage'), 'DashboardPage');
const DeploymentsPage = lazyNamed(() => import('@/pages/DeploymentsPage'), 'DeploymentsPage');
const ForgotPasswordPage = lazyNamed(
  () => import('@/pages/ForgotPasswordPage'),
  'ForgotPasswordPage',
);
const HomePage = lazyNamed(() => import('@/pages/HomePage'), 'HomePage');
const AdminDeploymentsPage = lazyNamed(
  () => import('@/pages/AdminDeploymentsPage'),
  'AdminDeploymentsPage',
);
const HostingPage = lazyNamed(() => import('@/pages/HostingPage'), 'HostingPage');
const InstallsPage = lazyNamed(() => import('@/pages/InstallsPage'), 'InstallsPage');
const LicensesPage = lazyNamed(() => import('@/pages/LicensesPage'), 'LicensesPage');
const LoginPage = lazyNamed(() => import('@/pages/LoginPage'), 'LoginPage');
const MyTicketsPage = lazyNamed(() => import('@/pages/MyTicketsPage'), 'MyTicketsPage');
const ContentPage = lazyNamed(() => import('@/pages/ContentPage'), 'ContentPage');
const ObservabilityPage = lazyNamed(() => import('@/pages/ObservabilityPage'), 'ObservabilityPage');
const NotificationsPage = lazyNamed(() => import('@/pages/NotificationsPage'), 'NotificationsPage');
const OrdersPage = lazyNamed(() => import('@/pages/OrdersPage'), 'OrdersPage');
const PaymentsPage = lazyNamed(() => import('@/pages/PaymentsPage'), 'PaymentsPage');
const SecretsPage = lazyNamed(() => import('@/pages/SecretsPage'), 'SecretsPage');
const StoragePage = lazyNamed(() => import('@/pages/StoragePage'), 'StoragePage');
const SettingsPage = lazyNamed(() => import('@/pages/SettingsPage'), 'SettingsPage');
const TicketsPage = lazyNamed(() => import('@/pages/TicketsPage'), 'TicketsPage');
const UsersPage = lazyNamed(() => import('@/pages/UsersPage'), 'UsersPage');
const VerifyEmailPage = lazyNamed(() => import('@/pages/VerifyEmailPage'), 'VerifyEmailPage');

// UserAuthPage 接收 mode prop，单独 lazy 拿到组件类型后再用
const UserAuthPage = lazyRoute<{ mode: 'login' | 'register' }>(() =>
  import('@/pages/UserAuthPage').then((m) => ({ default: m.UserAuthPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function SiteAppearanceSync() {
  const { data } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    syncDocumentFavicon(data?.faviconUrl);
  }, [data?.faviconUrl]);

  useEffect(() => {
    syncBrandPrimaryColor(data?.brandPrimaryColor);
  }, [data?.brandPrimaryColor]);

  return null;
}

function ProtectedUserRoute() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageSkeleton pathname={location.pathname} />;
  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <Outlet />;
}

function ProtectedAdminRoute() {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) return <AppLoadingShell />;
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function ProtectedAdminSectionRoute({
  sectionKey,
  children,
}: {
  sectionKey: AdminSectionKey;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);

  if (hasPermission(role, adminSectionMeta[sectionKey].permission)) {
    return <>{children}</>;
  }

  const fallbackSection = listAllowedAdminSectionKeys((permission) =>
    hasPermission(role, permission),
  )[0];
  if (fallbackSection) {
    return <Navigate to={adminSectionMeta[fallbackSection].href} replace />;
  }

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <EmptyState
          icon={ShieldAlert}
          title="无权限访问"
          description="当前账户没有访问该后台模块的权限，请联系管理员调整角色。"
        />
      </div>
    </div>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<PortalUiProvider />}>
        <Route element={<UserShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/apps" element={<HomePage />} />
          <Route
            path="/apps/ai-translate-workflow/privacy"
            element={<AiTranslateWorkflowPrivacyPage />}
          />
          <Route
            path="/apps/ai-translate-workflow/support"
            element={<AiTranslateWorkflowSupportPage />}
          />
          <Route path="/apps/:appCode" element={<AppCatalogPage />} />
          <Route path="/content" element={<ContentHubPage />} />
          <Route path="/content/:slug" element={<ContentDetailPage />} />
          <Route path="/login" element={<UserAuthPage mode="login" />} />
          <Route path="/register" element={<UserAuthPage mode="register" />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route element={<ProtectedUserRoute />}>
            <Route path="/account" element={<AccountCenterPage />} />
            <Route
              path="/notifications"
              element={<Navigate to="/account?tab=notifications" replace />}
            />
            <Route path="/orders" element={<Navigate to="/account?tab=orders" replace />} />
            <Route path="/access" element={<Navigate to="/account?tab=apps" replace />} />
            <Route path="/tickets" element={<MyTicketsPage />} />
            <Route path="/tickets/new" element={<CreateTicketPage />} />
            <Route path="/deploy" element={<DeploymentsPage />} />
          </Route>
        </Route>
        <Route element={<DocsShell />}>
          <Route path="/docs" element={<DocsHubPage />} />
          <Route path="/docs/:spaceSlug" element={<DocsSpacePage />} />
          <Route path="/docs/:spaceSlug/*" element={<DocsSpacePage />} />
        </Route>
      </Route>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route element={<Shell />}>
          <Route
            path="/admin"
            element={
              <ProtectedAdminSectionRoute sectionKey="dashboard">
                <DashboardPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route path="/admin/catalog" element={<Navigate to="/admin/apps" replace />} />
          <Route
            path="/admin/apps"
            element={
              <ProtectedAdminSectionRoute sectionKey="apps">
                <AppsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/apps/new"
            element={
              <ProtectedAdminSectionRoute sectionKey="apps">
                <AppEditPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/apps/:appCode/edit"
            element={
              <ProtectedAdminSectionRoute sectionKey="apps">
                <AppEditPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/content"
            element={
              <ProtectedAdminSectionRoute sectionKey="content">
                <ContentPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/content/new"
            element={
              <ProtectedAdminSectionRoute sectionKey="content">
                <ContentEditPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/content/:contentId/edit"
            element={
              <ProtectedAdminSectionRoute sectionKey="content">
                <ContentEditPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/storage"
            element={
              <ProtectedAdminSectionRoute sectionKey="storage">
                <StoragePage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/docs"
            element={
              <ProtectedAdminSectionRoute sectionKey="docs">
                <DocsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/secrets"
            element={
              <ProtectedAdminSectionRoute sectionKey="secrets">
                <SecretsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedAdminSectionRoute sectionKey="orders">
                <OrdersPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/payments"
            element={
              <ProtectedAdminSectionRoute sectionKey="payments">
                <PaymentsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedAdminSectionRoute sectionKey="settings">
                <SettingsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/licenses"
            element={
              <ProtectedAdminSectionRoute sectionKey="licenses">
                <LicensesPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/tickets"
            element={
              <ProtectedAdminSectionRoute sectionKey="tickets">
                <TicketsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedAdminSectionRoute sectionKey="users">
                <UsersPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/installs"
            element={
              <ProtectedAdminSectionRoute sectionKey="installs">
                <InstallsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <ProtectedAdminSectionRoute sectionKey="notifications">
                <NotificationsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/hosting"
            element={
              <ProtectedAdminSectionRoute sectionKey="hosting">
                <HostingPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route
            path="/admin/deployments"
            element={
              <ProtectedAdminSectionRoute sectionKey="deployments">
                <AdminDeploymentsPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route path="/admin/delivery" element={<Navigate to="/admin/apps" replace />} />
          <Route
            path="/admin/observability"
            element={
              <ProtectedAdminSectionRoute sectionKey="observability">
                <ObservabilityPage />
              </ProtectedAdminSectionRoute>
            }
          />
          <Route path="/admin/operations" element={<Navigate to="/admin/orders" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
);

// Start shell/provider/page imports together, without waiting for settings or authentication.
function preloadCurrentBranch() {
  const location = router.state.navigation.location ?? router.state.location;
  preloadRouteElements(
    (matchRoutes(router.routes, location) ?? []).map(({ route }) => route.element),
  );
}
preloadCurrentBranch();
router.subscribe(preloadCurrentBranch);

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary
            fallbackRender={() => (
              <div role="alert" className="mx-auto max-w-lg space-y-4 p-8">
                <h1 className="text-xl font-semibold">页面加载失败</h1>
                <p>请检查网络连接后重试。</p>
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-2"
                  onClick={() => window.location.reload()}
                >
                  重新加载
                </button>
              </div>
            )}
          >
            <SiteAppearanceSync />
            <Suspense fallback={<AppLoadingShell />}>
              <RouterProvider router={router} />
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
