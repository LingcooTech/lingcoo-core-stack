import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import { Shell } from '@/components/layout/Shell';
import { UserShell } from '@/components/layout/UserShell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ApplicationDetailPage } from '@/pages/ApplicationDetailPage';
import { ApplicationsPage } from '@/pages/ApplicationsPage';
import { AppCatalogPage } from '@/pages/AppCatalogPage';
import { AuthorizationTemplatesPage } from '@/pages/AuthorizationTemplatesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DeploymentsPage } from '@/pages/DeploymentsPage';
import { EventsPage } from '@/pages/EventsPage';
import { HomePage } from '@/pages/HomePage';
import { InstallsPage } from '@/pages/InstallsPage';
import { LicensesPage } from '@/pages/LicensesPage';
import { LoginPage } from '@/pages/LoginPage';
import { LogsPage } from '@/pages/LogsPage';
import { MyAccessPage } from '@/pages/MyAccessPage';
import { MyOrdersPage } from '@/pages/MyOrdersPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { PricingPage } from '@/pages/PricingPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
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
