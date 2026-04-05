import { apiClient } from './client';
import type { DeliverySettingsOverview } from './types';

export interface UpsertDeliverySettingsInput {
  repoUrl?: string;
  repoBranch?: string;
  frontendImage?: string;
  websocketImage?: string;
  letsencryptEmail?: string;
  acrUsername?: string;
  acrPassword?: string;
  githubToken?: string;
  wordpressFetchReleaseAssets?: boolean;
  wordpressRunInit?: boolean;
  wordpressReleaseOwner?: string;
  fdThemeReleaseTag?: string;
  fdAdminUiReleaseTag?: string;
  fdMemberReleaseTag?: string;
  fdPaymentReleaseTag?: string;
  fdCommerceReleaseTag?: string;
  fdContentTypesReleaseTag?: string;
  fdWebsocketPushReleaseTag?: string;
  wpgraphqlJwtAuthReleaseTag?: string;
  wpgraphqlTaxQueryRef?: string;
}

export async function getDeliverySettings(appCode: string): Promise<DeliverySettingsOverview> {
  return apiClient<DeliverySettingsOverview>(`/v1/admin/delivery-settings/${encodeURIComponent(appCode)}`);
}

export async function upsertDeliverySettings(appCode: string, payload: UpsertDeliverySettingsInput): Promise<DeliverySettingsOverview> {
  return apiClient<DeliverySettingsOverview>(`/v1/admin/delivery-settings/${encodeURIComponent(appCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function clearDeliverySettings(appCode: string): Promise<void> {
  await apiClient(`/v1/admin/delivery-settings/${encodeURIComponent(appCode)}`, { method: 'DELETE' });
}
