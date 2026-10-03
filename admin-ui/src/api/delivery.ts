import { apiClient } from './client';
import type { DeliverySettingsOverview } from './types';

export interface UpsertDeliverySettingsInput {
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
  installer?: {
    repoUrl?: string;
    repoBranch?: string;
  };
}

export async function getDeliverySettings(appCode: string): Promise<DeliverySettingsOverview> {
  return apiClient(
    'GET /v1/admin/delivery-settings/:param',
    `/v1/admin/delivery-settings/${encodeURIComponent(appCode)}`,
  );
}

export async function upsertDeliverySettings(
  appCode: string,
  payload: UpsertDeliverySettingsInput,
): Promise<DeliverySettingsOverview> {
  return apiClient(
    'PUT /v1/admin/delivery-settings/:param',
    `/v1/admin/delivery-settings/${encodeURIComponent(appCode)}`,
    { body: JSON.stringify(payload) },
  );
}

export async function clearDeliverySettings(appCode: string): Promise<void> {
  await apiClient(
    'DELETE /v1/admin/delivery-settings/:param',
    `/v1/admin/delivery-settings/${encodeURIComponent(appCode)}`,
  );
}
