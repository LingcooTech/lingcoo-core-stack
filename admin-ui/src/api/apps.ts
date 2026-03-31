import { apiClient } from './client';
import type { AppSecretCreated, AppWithDetails } from './types';

export async function listAppsAdmin(): Promise<{ items: AppWithDetails[] }> {
  return apiClient<{ items: AppWithDetails[] }>('/v1/admin/apps');
}

export interface UpsertAppInput {
  name: string;
  description?: string;
  type: string;
  status: string;
  productCodes: string[];
  planConfigs?: Array<{
    code: string;
    priceAmount: number;
    currency: string;
    status: string;
  }>;
  meta?: Record<string, unknown>;
}

export async function upsertApp(appCode: string, payload: UpsertAppInput): Promise<AppWithDetails> {
  return apiClient<AppWithDetails>(`/v1/admin/apps/${encodeURIComponent(appCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function createAppSecret(appCode: string, expiresAt?: string): Promise<AppSecretCreated> {
  return apiClient<AppSecretCreated>(`/v1/admin/apps/${encodeURIComponent(appCode)}/secrets`, {
    method: 'POST',
    body: JSON.stringify({ expiresAt: expiresAt ?? null })
  });
}

export async function revokeAppSecret(appCode: string, secretId: string): Promise<unknown> {
  return apiClient(`/v1/admin/apps/${encodeURIComponent(appCode)}/secrets/${encodeURIComponent(secretId)}/revoke`, {
    method: 'POST'
  });
}
