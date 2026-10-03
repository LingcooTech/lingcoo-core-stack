import { apiClient, clearToken } from './client';
import type { BrowserAuthResponse } from '@lingcoo/contracts';
import type {
  BootstrapStatus,
  ChangePasswordResponse,
  ForgotPasswordResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  UpdateCurrentUserResponse,
  VerifyEmailResponse,
} from './types';

export async function bootstrapStatus(): Promise<BootstrapStatus> {
  return apiClient('GET /v1/admin/bootstrap-status', '/v1/admin/bootstrap-status');
}

export async function login(email: string, password: string): Promise<BrowserAuthResponse> {
  const response = await apiClient('POST /v1/auth/session/login', '/v1/auth/session/login', {
    body: JSON.stringify({ email, password }),
  });
  clearToken();
  return response;
}

export async function register(email: string, password: string): Promise<BrowserAuthResponse> {
  const response = await apiClient('POST /v1/auth/session/register', '/v1/auth/session/register', {
    body: JSON.stringify({ email, password }),
  });
  clearToken();
  return response;
}

export async function getCurrentUser() {
  return apiClient('GET /v1/me', '/v1/me');
}

export async function updateCurrentUser(displayName: string): Promise<UpdateCurrentUserResponse> {
  return apiClient('PATCH /v1/me', '/v1/me', { body: JSON.stringify({ displayName }) });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ChangePasswordResponse> {
  const result = await apiClient('POST /v1/me/change-password', '/v1/me/change-password', {
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
  clearToken();
  window.dispatchEvent(new Event('stack:session-expired'));
  return result;
}

export async function verifyEmail(code: string): Promise<VerifyEmailResponse> {
  return apiClient('POST /v1/auth/verify-email', '/v1/auth/verify-email', {
    body: JSON.stringify({ code }),
  });
}

export async function resendVerification(): Promise<ResendVerificationResponse> {
  return apiClient('POST /v1/auth/resend-verification', '/v1/auth/resend-verification');
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return apiClient('POST /v1/auth/forgot-password', '/v1/auth/forgot-password', {
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetPasswordResponse> {
  return apiClient('POST /v1/auth/reset-password', '/v1/auth/reset-password', {
    body: JSON.stringify({ email, code, newPassword }),
  });
}

export async function logoutSession(): Promise<void> {
  await apiClient('POST /v1/auth/session/logout', '/v1/auth/session/logout');
  clearToken();
  window.dispatchEvent(new Event('stack:session-expired'));
}
