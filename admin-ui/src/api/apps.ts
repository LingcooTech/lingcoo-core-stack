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
  ProductSummary
} from './types';

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
  productCodes: string[];
  checkoutOffers?: Array<{
    code: string;
    priceCode: string;
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
  meta?: Record<string, unknown>;
}

export async function upsertApp(appCode: string, payload: UpsertAppInput): Promise<AppWithDetails> {
  const meta = payload.meta ?? {};
  const callbackUrl = typeof meta.callbackUrl === 'string' ? meta.callbackUrl : undefined;
  const callbackSecret = typeof meta.callbackSecret === 'string' ? meta.callbackSecret : undefined;
  const allowedOrigins = Array.isArray(meta.allowedOrigins)
    ? meta.allowedOrigins.filter((item): item is string => typeof item === 'string')
    : undefined;
  const deliveryManifestSource =
    meta.deliveryManifestSource && typeof meta.deliveryManifestSource === 'object' && !Array.isArray(meta.deliveryManifestSource)
      ? (meta.deliveryManifestSource as Record<string, unknown>)
      : {};

  return apiClient<AppWithDetails>(`/v1/admin/apps/${encodeURIComponent(appCode)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      type: payload.type,
      status: payload.status,
      productCodes: payload.productCodes,
      callbackUrl,
      callbackSecret,
      allowedOrigins,
      repoUrl: typeof deliveryManifestSource.repoUrl === 'string' ? deliveryManifestSource.repoUrl : undefined,
      repoBranch: typeof deliveryManifestSource.repoBranch === 'string' ? deliveryManifestSource.repoBranch : undefined,
      manifestPath: typeof deliveryManifestSource.manifestPath === 'string' ? deliveryManifestSource.manifestPath : undefined,
      manifestUrl: typeof deliveryManifestSource.manifestUrl === 'string' ? deliveryManifestSource.manifestUrl : undefined,
      offers: payload.checkoutOffers?.map((offer) => ({
        code: offer.code,
        priceCode: offer.priceCode,
        title: offer.title,
        description: offer.description,
        badge: offer.badge,
        status: offer.status as 'active' | 'inactive' | 'cancelled' | 'expired',
        isDefault: offer.isDefault,
        sortOrder: offer.sortOrder
      })),
      meta
    })
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

export async function syncAppDeliveryManifest(
  appCode: string,
  payload: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  }
): Promise<AppWithDetails> {
  return apiClient<AppWithDetails>(`/v1/admin/apps/${encodeURIComponent(appCode)}/delivery-manifest/sync`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
