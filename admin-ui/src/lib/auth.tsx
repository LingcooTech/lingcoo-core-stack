import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CurrentUser } from '@lingcoo/contracts';
import { getCurrentUser, logoutSession } from '@/api/auth';
import { clearToken } from '@/api/client';
import { toast } from 'sonner';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';
import { canAccessAdminConsole, normalizeRole } from '@/lib/rbac';

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isEmailVerified: boolean;
  login: (user: CurrentUser) => void;
  logout: () => Promise<void>;
  setEmailVerified: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const client = useQueryClient();
  const generation = useRef(0);
  const login = useCallback(
    (current: CurrentUser) => {
      generation.current++;
      clearToken();
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== PUBLIC_SITE_SETTINGS_QUERY_KEY[0],
      });
      client.getMutationCache().clear();
      setUser(current);
      setLoading(false);
    },
    [client],
  );
  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出登录失败，请重试');
    }
  }, []);
  const setEmailVerified = useCallback(
    () => setUser((previous) => (previous ? { ...previous, emailVerified: true } : previous)),
    [],
  );
  useEffect(() => {
    clearToken();
    let active = true;
    const expired = () => {
      generation.current++;
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== PUBLIC_SITE_SETTINGS_QUERY_KEY[0],
      });
      client.getMutationCache().clear();
      setUser(null);
      setLoading(false);
    };
    const refresh = async () => {
      const current = ++generation.current;
      try {
        const response = await getCurrentUser();
        if (active && current === generation.current) setUser(response.user);
      } catch {
        if (active && current === generation.current) setUser(null);
      } finally {
        if (active && current === generation.current) setLoading(false);
      }
    };
    window.addEventListener('stack:session-expired', expired);
    window.addEventListener('focus', refresh);
    void refresh();
    return () => {
      active = false;
      window.removeEventListener('stack:session-expired', expired);
      window.removeEventListener('focus', refresh);
    };
  }, [client]);
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isAdmin: canAccessAdminConsole(normalizeRole(user?.role)),
        isEmailVerified: user?.emailVerified ?? false,
        login,
        logout,
        setEmailVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
