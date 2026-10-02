import { lazy, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { ShieldAlert } from 'lucide-react';

import { getPublicSiteSettings } from '@/api/settings';
import { DocsShell } from '@/components/layout/DocsShell';
import { Shell } from '@/components/layout/Shell';
import { UserShell } from '@/components/layout/UserShell';
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
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * lazyNamed —— React.lazy 要求 default export，但本项目所有页面都是 named
 * export（`export function FooPage`），用此 helper 包装一次。
 */
function lazyNamed<T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
): ComponentType {
  return lazy(() => loader().then((mod) => ({ default: mod[name] as ComponentType })));
}

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
const SettingsPage = lazyNamed(() => import('@/pages/SettingsPage'), 'SettingsPage');
const TicketsPage = lazyNamed(() => import('@/pages/TicketsPage'), 'TicketsPage');
const UsersPage = lazyNamed(() => import('@/pages/UsersPage'), 'UsersPage');
const VerifyEmailPage = lazyNamed(() => import('@/pages/VerifyEmailPage'), 'VerifyEmailPage');

// UserAuthPage 接收 mode prop，单独 lazy 拿到组件类型后再用
const UserAuthPage = lazy(() =>
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

function SiteSettingsBootstrap({ children }: { children: ReactNode }) {
  const siteSettingsQuery = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    syncDocumentFavicon(siteSettingsQuery.data?.faviconUrl);
  }, [siteSettingsQuery.data?.faviconUrl]);

  useEffect(() => {
    syncBrandPrimaryColor(siteSettingsQuery.data?.brandPrimaryColor);
  }, [siteSettingsQuery.data?.brandPrimaryColor]);

  if (siteSettingsQuery.isLoading && !siteSettingsQuery.data) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_24%),linear-gradient(180deg,#fcfdff_0%,#f5f8fc_48%,#f7f9fc_100%)]">
        <div className="mx-auto flex min-h-screen max-w-6xl items-start justify-center px-4 pt-24 sm:px-6">
          <div className="w-full max-w-xl rounded-2xl border border-white/70 bg-white/80 p-6 shadow-md backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedUserRoute() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div role="status">正在验证登录状态…</div>;
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
  if (isLoading) return <div role="status">正在验证登录状态…</div>;
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

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <AuthProvider>
            <SiteSettingsBootstrap>
              <SiteAppearanceSync />
              <RouterProvider router={router} />
              <Toaster position="top-right" richColors />
            </SiteSettingsBootstrap>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
