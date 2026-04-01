import { apiClient, setToken } from './client';
import type { AuthResponse, BootstrapStatus } from './types';

export async function bootstrapStatus(): Promise<BootstrapStatus> {
  return apiClient<BootstrapStatus>('/v1/admin/bootstrap-status');
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await apiClient<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setToken(response.token);
  return response;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await apiClient<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setToken(response.token);
  return response;
}

export async function getCurrentUser() {
  return apiClient<{
    authenticated: boolean;
    user: {
      id: string;
      email: string;
      displayName: string | null;
      role: string;
    };
  }>('/v1/me');
}
