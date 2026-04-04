import type { ComponentType } from 'react';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import { Shell } from '@/components/layout/Shell';
import { UserShell } from '@/components/layout/UserShell';
import { AuthProvider, useAuth } from '@/lib/auth';

function lazyPage<TModule extends Record<string, unknown>, TKey extends keyof TModule & string>(
  loader: () => Promise<TModule>,
  exportName: TKey
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as ComponentType<any> };
  });
}

const ApplicationDetailPage = lazyPage(() => import('@/pages/ApplicationDetailPage'), 'ApplicationDetailPage');
const ApplicationsPage = lazyPage(() => import('@/pages/ApplicationsPage'), 'ApplicationsPage');
const AppCatalogPage = lazyPage(() => import('@/pages/AppCatalogPage'), 'AppCatalogPage');
const AuthorizationTemplatesPage = lazyPage(
  () => import('@/pages/AuthorizationTemplatesPage'),
  'AuthorizationTemplatesPage'
);
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage');
const DeploymentsPage = lazyPage(() => import('@/pages/DeploymentsPage'), 'DeploymentsPage');
const EventsPage = lazyPage(() => import('@/pages/EventsPage'), 'EventsPage');
const HomePage = lazyPage(() => import('@/pages/HomePage'), 'HomePage');
const InstallsPage = lazyPage(() => import('@/pages/InstallsPage'), 'InstallsPage');
const LicensesPage = lazyPage(() => import('@/pages/LicensesPage'), 'LicensesPage');
const LoginPage = lazyPage(() => import('@/pages/LoginPage'), 'LoginPage');
const LogsPage = lazyPage(() => import('@/pages/LogsPage'), 'LogsPage');
const MyAccessPage = lazyPage(() => import('@/pages/MyAccessPage'), 'MyAccessPage');
const MyOrdersPage = lazyPage(() => import('@/pages/MyOrdersPage'), 'MyOrdersPage');
const PaymentsPage = lazyPage(() => import('@/pages/PaymentsPage'), 'PaymentsPage');
const PricingPage = lazyPage(() => import('@/pages/PricingPage'), 'PricingPage');
const ProductDetailPage = lazyPage(() => import('@/pages/ProductDetailPage'), 'ProductDetailPage');
const ProductsPage = lazyPage(() => import('@/pages/ProductsPage'), 'ProductsPage');
const TransactionsPage = lazyPage(() => import('@/pages/TransactionsPage'), 'TransactionsPage');
const UserAuthPage = lazyPage(() => import('@/pages/UserAuthPage'), 'UserAuthPage');
const UsersPage = lazyPage(() => import('@/pages/UsersPage'), 'UsersPage');
const VerifyEmailPage = lazyPage(() => import('@/pages/VerifyEmailPage'), 'VerifyEmailPage');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000
    }
  }
});

function ProtectedUserRoute() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
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

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<UserShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/apps" element={<HomePage />} />
          <Route path="/apps/:appCode" element={<AppCatalogPage />} />
          <Route path="/login" element={<UserAuthPage mode="login" />} />
          <Route path="/register" element={<UserAuthPage mode="register" />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route element={<ProtectedUserRoute />}>
            <Route path="/orders" element={<MyOrdersPage />} />
            <Route path="/access" element={<MyAccessPage />} />
            <Route path="/deploy" element={<DeploymentsPage />} />
          </Route>
        </Route>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<ProtectedAdminRoute />}>
          <Route element={<Shell />}>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/applications" element={<ApplicationsPage />} />
            <Route path="/admin/applications/new" element={<ApplicationDetailPage />} />
            <Route path="/admin/applications/:appCode" element={<ApplicationDetailPage />} />
            <Route path="/admin/products" element={<ProductsPage />} />
            <Route path="/admin/products/new" element={<ProductDetailPage />} />
            <Route path="/admin/products/:productCode" element={<ProductDetailPage />} />
            <Route path="/admin/pricing" element={<PricingPage />} />
            <Route path="/admin/authorization-templates" element={<AuthorizationTemplatesPage />} />
            <Route path="/admin/transactions" element={<TransactionsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/authorizations" element={<LicensesPage />} />
            <Route path="/admin/instances" element={<InstallsPage />} />
            <Route path="/admin/events" element={<EventsPage />} />
            <Route path="/admin/logs" element={<LogsPage />} />
            <Route path="/admin/settings/payments" element={<PaymentsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Loading</p>
        <p className="mt-3 text-base font-bold text-slate-900">页面资源加载中</p>
        <p className="mt-2 text-sm text-slate-500">首次打开某个模块时会按需加载对应代码。</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
