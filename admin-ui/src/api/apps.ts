import { apiClient } from './client';
import type { AppCatalog, AppFaq, AppHighlight, AppLink, AppScreenshot, AppSecretCreated, AppWithDetails, CatalogSnapshot, FeatureSummary, PlanSummary } from './types';

export async function listApps(): Promise<{ items: AppWithDetails[] }> {
  return apiClient<{ items: AppWithDetails[] }>('/v1/apps');
}

export async function getAppCatalog(appCode: string): Promise<AppCatalog> {
  return apiClient<AppCatalog>(`/v1/apps/${encodeURIComponent(appCode)}/catalog`);
}

export async function listAppsAdmin(): Promise<{ items: AppWithDetails[] }> {
  return apiClient<{ items: AppWithDetails[] }>('/v1/admin/apps');
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
  tagline?: string;
  description?: string;
  content?: string;
  iconUrl?: string;
  coverUrl?: string;
  screenshots?: AppScreenshot[];
  highlights?: AppHighlight[];
  faq?: AppFaq[];
  links?: AppLink[];
  category?: string;
  sortOrder?: number;
  type: string;
  status: string;
  features?: Array<{
    code: string;
    name: string;
    kind: string;
    status: string;
  }>;
  plans?: Array<{
    code: string;
    name: string;
    billingProvider: string;
    billingPriceId?: string;
    priceAmount: number;
    currency: string;
    interval: 'month' | 'year' | 'one_time';
    status: string;
    featureCodes: string[];
    meta?: Record<string, unknown>;
  }>;
  offers?: Array<{
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

export interface SyncAppDeliveryManifestInput {
  repoUrl?: string;
  repoBranch?: string;
  manifestPath?: string;
  manifestUrl?: string;
}

export async function syncAppDeliveryManifest(
  appCode: string,
  payload: SyncAppDeliveryManifestInput
): Promise<AppWithDetails> {
  return apiClient<AppWithDetails>(`/v1/admin/apps/${encodeURIComponent(appCode)}/delivery-manifest/sync`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
