import { apiClient } from './client';
import type {
  AppCatalog,
  AppFaq,
  AppHighlight,
  AppLink,
  AppScreenshot,
  AppSecretCreated,
  AppWithDetails,
  CatalogSnapshot,
  FeatureSummary,
  PlanSummary,
} from './types';

export async function listApps(): Promise<{ items: AppWithDetails[] }> {
  return apiClient('GET /v1/apps', '/v1/apps');
}

export async function getAppCatalog(appCode: string): Promise<AppCatalog> {
  return apiClient(
    'GET /v1/apps/:param/catalog',
    `/v1/apps/${encodeURIComponent(appCode)}/catalog`,
  );
}

export async function listAppsAdmin(): Promise<{ items: AppWithDetails[] }> {
  return apiClient('GET /v1/admin/apps', '/v1/admin/apps');
}

export async function listCatalogPlans(): Promise<{ items: PlanSummary[] }> {
  return apiClient('GET /v1/plans', '/v1/plans');
}

export async function listCatalogFeatures(): Promise<{ items: FeatureSummary[] }> {
  return apiClient('GET /v1/features', '/v1/features');
}

export async function listCatalogSnapshot(): Promise<CatalogSnapshot> {
  return apiClient('GET /v1/catalog', '/v1/catalog');
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
  return apiClient('PUT /v1/admin/apps/:param', `/v1/admin/apps/${encodeURIComponent(appCode)}`, {
    body: JSON.stringify(payload),
  });
}

export async function archiveApp(appCode: string): Promise<AppWithDetails> {
  return apiClient(
    'POST /v1/admin/apps/:param/archive',
    `/v1/admin/apps/${encodeURIComponent(appCode)}/archive`,
  );
}

export async function purgeAppConfiguration(
  appCode: string,
  confirmAppCode: string,
): Promise<AppWithDetails> {
  return apiClient(
    'POST /v1/admin/apps/:param/purge-config',
    `/v1/admin/apps/${encodeURIComponent(appCode)}/purge-config`,
    { body: JSON.stringify({ confirmAppCode }) },
  );
}

export async function createAppSecret(
  appCode: string,
  expiresAt?: string,
): Promise<AppSecretCreated> {
  return apiClient(
    'POST /v1/admin/apps/:param/secrets',
    `/v1/admin/apps/${encodeURIComponent(appCode)}/secrets`,
    { body: JSON.stringify({ expiresAt: expiresAt ?? null }) },
  );
}

export async function revokeAppSecret(appCode: string, secretId: string): Promise<unknown> {
  return apiClient(
    'POST /v1/admin/apps/:param/secrets/:param/revoke',
    `/v1/admin/apps/${encodeURIComponent(appCode)}/secrets/${encodeURIComponent(secretId)}/revoke`,
  );
}

export interface SyncAppDeliveryManifestInput {
  repoUrl?: string;
  repoBranch?: string;
  manifestPath?: string;
  manifestUrl?: string;
}

export async function syncAppDeliveryManifest(
  appCode: string,
  payload: SyncAppDeliveryManifestInput,
): Promise<AppWithDetails> {
  return apiClient(
    'POST /v1/admin/apps/:param/delivery-manifest/sync',
    `/v1/admin/apps/${encodeURIComponent(appCode)}/delivery-manifest/sync`,
    { body: JSON.stringify(payload) },
  );
}
