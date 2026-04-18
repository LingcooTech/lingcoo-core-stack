import { apiClient, setToken } from './client';
import type {
  AuthResponse,
  BootstrapStatus,
  ChangePasswordResponse,
  CurrentUserProfile,
  ForgotPasswordResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  UpdateCurrentUserResponse,
  VerifyEmailResponse
} from './types';

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
    user: CurrentUserProfile;
  }>('/v1/me');
}

export async function updateCurrentUser(displayName: string): Promise<UpdateCurrentUserResponse> {
  return apiClient<UpdateCurrentUserResponse>('/v1/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName })
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ChangePasswordResponse> {
  return apiClient<ChangePasswordResponse>('/v1/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
  });
}

export async function verifyEmail(code: string): Promise<VerifyEmailResponse> {
  return apiClient<VerifyEmailResponse>('/v1/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}

export async function resendVerification(): Promise<ResendVerificationResponse> {
  return apiClient<ResendVerificationResponse>('/v1/auth/resend-verification', { method: 'POST' });
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  return apiClient<ForgotPasswordResponse>('/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<ResetPasswordResponse> {
  return apiClient<ResetPasswordResponse>('/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword })
  });
}
