import { apiClient } from './client';
import type { AppSecretCreated, AppWithDetails, PlanSummary, ProductSummary } from './types';

export async function listAppsAdmin(): Promise<{ items: AppWithDetails[] }> {
  return apiClient<{ items: AppWithDetails[] }>('/v1/admin/apps');
}

export async function listCatalogProducts(): Promise<{ items: ProductSummary[] }> {
  return apiClient<{ items: ProductSummary[] }>('/v1/products');
}

export async function listCatalogPlans(): Promise<{ items: PlanSummary[] }> {
  return apiClient<{ items: PlanSummary[] }>('/v1/plans');
}

export interface UpsertAppInput {
  name: string;
  description?: string;
  type: string;
  status: string;
  productCodes: string[];
  checkoutOffers?: Array<{
    code: string;
    planCode: string;
    title: string;
    description?: string;
    badge?: string;
    priceAmount: number;
    currency: string;
    status: string;
    isDefault?: boolean;
    sortOrder?: number;
  }>;
  checkoutDefaultOfferCode?: string;
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
