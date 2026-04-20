import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
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

import { getPublicSiteSettings } from '@/api/settings';
import { DocsShell } from '@/components/layout/DocsShell';
import { Shell } from '@/components/layout/Shell';
import { UserShell } from '@/components/layout/UserShell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY, syncDocumentFavicon } from '@/lib/site-settings';
import { AccountCenterPage } from '@/pages/AccountCenterPage';
import { AppCatalogPage } from '@/pages/AppCatalogPage';
import { AppEditPage } from '@/pages/AppEditPage';
import { AppsPage } from '@/pages/AppsPage';
import { AiTranslateWorkflowPrivacyPage } from '@/pages/AiTranslateWorkflowPrivacyPage';
import { AiTranslateWorkflowSupportPage } from '@/pages/AiTranslateWorkflowSupportPage';
import { ContentDetailPage } from '@/pages/ContentDetailPage';
import { ContentEditPage } from '@/pages/ContentEditPage';
import { ContentHubPage } from '@/pages/ContentHubPage';
import { DocsHubPage } from '@/pages/DocsHubPage';
import { DocsPage } from '@/pages/DocsPage';
import { DocsSpacePage } from '@/pages/DocsSpacePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DeploymentsPage } from '@/pages/DeploymentsPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { HomePage } from '@/pages/HomePage';
import { InstallsPage } from '@/pages/InstallsPage';
import { LicensesPage } from '@/pages/LicensesPage';
import { LoginPage } from '@/pages/LoginPage';
import { ContentPage } from '@/pages/ContentPage';
import { ObservabilityPage } from '@/pages/ObservabilityPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { SecretsPage } from '@/pages/SecretsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UserAuthPage } from '@/pages/UserAuthPage';
import { UsersPage } from '@/pages/UsersPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000
    }
  }
});

function SiteAppearanceSync() {
  const { data } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000
  });

  useEffect(() => {
    syncDocumentFavicon(data?.faviconUrl);
  }, [data?.faviconUrl]);

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

  if (siteSettingsQuery.isLoading && !siteSettingsQuery.data) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_24%),linear-gradient(180deg,#fcfdff_0%,#f5f8fc_48%,#f7f9fc_100%)]">
        <div className="mx-auto flex min-h-screen max-w-6xl items-start justify-center px-4 pt-24 sm:px-6">
          <div className="w-full max-w-xl rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-sm shadow-slate-900/5 backdrop-blur">
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
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}

function ProtectedAdminRoute() {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<UserShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/apps" element={<HomePage />} />
        <Route path="/apps/ai-translate-workflow/privacy" element={<AiTranslateWorkflowPrivacyPage />} />
        <Route path="/apps/ai-translate-workflow/support" element={<AiTranslateWorkflowSupportPage />} />
        <Route path="/apps/:appCode" element={<AppCatalogPage />} />
        <Route path="/content" element={<ContentHubPage />} />
        <Route path="/content/:slug" element={<ContentDetailPage />} />
        <Route path="/login" element={<UserAuthPage mode="login" />} />
        <Route path="/register" element={<UserAuthPage mode="register" />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route element={<ProtectedUserRoute />}>
          <Route path="/account" element={<AccountCenterPage />} />
          <Route path="/notifications" element={<Navigate to="/account?tab=notifications" replace />} />
          <Route path="/orders" element={<Navigate to="/account?tab=orders" replace />} />
          <Route path="/access" element={<Navigate to="/account?tab=apps" replace />} />
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
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/catalog" element={<Navigate to="/admin/apps" replace />} />
          <Route path="/admin/apps" element={<AppsPage />} />
          <Route path="/admin/apps/new" element={<AppEditPage />} />
          <Route path="/admin/apps/:appCode/edit" element={<AppEditPage />} />
          <Route path="/admin/content" element={<ContentPage />} />
          <Route path="/admin/content/new" element={<ContentEditPage />} />
          <Route path="/admin/content/:contentId/edit" element={<ContentEditPage />} />
          <Route path="/admin/docs" element={<DocsPage />} />
          <Route path="/admin/secrets" element={<SecretsPage />} />
          <Route path="/admin/orders" element={<OrdersPage />} />
          <Route path="/admin/payments" element={<PaymentsPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/licenses" element={<LicensesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/installs" element={<InstallsPage />} />
          <Route path="/admin/notifications" element={<NotificationsPage />} />
          <Route path="/admin/delivery" element={<Navigate to="/admin/apps" replace />} />
          <Route path="/admin/observability" element={<ObservabilityPage />} />
          <Route path="/admin/operations" element={<Navigate to="/admin/orders" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SiteSettingsBootstrap>
          <SiteAppearanceSync />
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </SiteSettingsBootstrap>
      </AuthProvider>
    </QueryClientProvider>
  );
}
