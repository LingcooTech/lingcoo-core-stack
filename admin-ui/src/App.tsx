import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import { Shell } from '@/components/layout/Shell';
import { UserShell } from '@/components/layout/UserShell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppCatalogPage } from '@/pages/AppCatalogPage';
import { AppEditPage } from '@/pages/AppEditPage';
import { AppsPage } from '@/pages/AppsPage';
import { CatalogPage } from '@/pages/CatalogPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DeliveryPage } from '@/pages/DeliveryPage';
import { DeploymentsPage } from '@/pages/DeploymentsPage';
import { HomePage } from '@/pages/HomePage';
import { InstallsPage } from '@/pages/InstallsPage';
import { LicensesPage } from '@/pages/LicensesPage';
import { LoginPage } from '@/pages/LoginPage';
import { MyAccessPage } from '@/pages/MyAccessPage';
import { MyOrdersPage } from '@/pages/MyOrdersPage';
import { ObservabilityPage } from '@/pages/ObservabilityPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { SecretsPage } from '@/pages/SecretsPage';
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
          <Route path="/admin/catalog" element={<CatalogPage />} />
          <Route path="/admin/apps" element={<AppsPage />} />
          <Route path="/admin/apps/:appCode/edit" element={<AppEditPage />} />
          <Route path="/admin/secrets" element={<SecretsPage />} />
          <Route path="/admin/orders" element={<OrdersPage />} />
          <Route path="/admin/payments" element={<PaymentsPage />} />
          <Route path="/admin/licenses" element={<LicensesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/installs" element={<InstallsPage />} />
          <Route path="/admin/delivery" element={<DeliveryPage />} />
          <Route path="/admin/observability" element={<ObservabilityPage />} />
          <Route path="/admin/operations" element={<Navigate to="/admin/orders" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
