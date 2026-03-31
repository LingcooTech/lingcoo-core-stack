import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearToken, getToken, setToken } from '@/api/client';

interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  kind?: string;
  exp?: number;
  iat?: number;
}

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  token: string;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

function tokenToUser(token: string): AuthUser | null {
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    clearToken();
    return null;
  }
  return {
    id: payload.sub,
    email: payload.email ?? payload.sub,
    role: payload.role ?? 'user'
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string>(() => getToken());
  const [user, setUser] = useState<AuthUser | null>(() => tokenToUser(getToken()));

  const login = useCallback((newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
    setUser(tokenToUser(newToken));
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState('');
    setUser(null);
  }, []);

  useEffect(() => {
    const stored = getToken();
    if (stored !== token) {
      setTokenState(stored);
      setUser(tokenToUser(stored));
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
