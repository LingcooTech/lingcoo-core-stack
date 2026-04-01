import { apiClient } from './client';
import type { AppCatalog, AppSecretCreated, AppWithDetails, CatalogSnapshot, FeatureSummary, PlanSummary, ProductSummary } from './types';

export async function listApps(): Promise<{ items: AppWithDetails[] }> {
  return apiClient<{ items: AppWithDetails[] }>('/v1/apps');
}

export async function getAppCatalog(appCode: string): Promise<AppCatalog> {
  return apiClient<AppCatalog>(`/v1/apps/${encodeURIComponent(appCode)}/catalog`);
}

export async function listAppsAdmin(): Promise<{ items: AppWithDetails[] }> {
  return apiClient<{ items: AppWithDetails[] }>('/v1/admin/apps');
}

export async function listCatalogProducts(): Promise<{ items: ProductSummary[] }> {
  return apiClient<{ items: ProductSummary[] }>('/v1/products');
}

export async function listCatalogPlans(): Promise<{ items: PlanSummary[] }> {
  return apiClient<{ items: PlanSummary[] }>('/v1/plans');
}

export async function listCatalogFeatures(): Promise<{ items: FeatureSummary[] }> {
  return apiClient<{ items: FeatureSummary[] }>('/v1/features');
}

export async function listCatalogSnapshot(): Promise<CatalogSnapshot> {
  return apiClient<CatalogSnapshot>('/v1/catalog');
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

export interface UpsertCatalogBundleInput {
  name: string;
  type: 'chrome_extension' | 'web_app' | 'service';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  features: Array<{
    code: string;
    name: string;
    kind: string;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
  }>;
  plans: Array<{
    code: string;
    name: string;
    billingProvider: string;
    billingPriceId?: string;
    priceAmount: number;
    currency: string;
    interval: 'month' | 'year' | 'one_time';
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    featureCodes: string[];
    meta?: Record<string, unknown>;
  }>;
}

export async function upsertCatalogBundle(productCode: string, payload: UpsertCatalogBundleInput) {
  return apiClient(`/v1/admin/catalog/products/${encodeURIComponent(productCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}
