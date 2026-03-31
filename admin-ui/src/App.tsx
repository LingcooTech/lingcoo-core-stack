import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Outlet, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import { Shell } from '@/components/layout/Shell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppsPage } from '@/pages/AppsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LicensesPage } from '@/pages/LicensesPage';
import { LoginPage } from '@/pages/LoginPage';
import { ObservabilityPage } from '@/pages/ObservabilityPage';
import { OperationsPage } from '@/pages/OperationsPage';
import { PaymentsPage } from '@/pages/PaymentsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000
    }
  }
});

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/payments" element={<PaymentsPage />} />
          <Route path="/admin/apps" element={<AppsPage />} />
          <Route path="/admin/licenses" element={<LicensesPage />} />
          <Route path="/admin/operations" element={<OperationsPage />} />
          <Route path="/admin/observability" element={<ObservabilityPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
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
