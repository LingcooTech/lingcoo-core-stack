import { apiClient } from './client';
import type { DeliverySettingsOverview } from './types';

export interface UpsertDeliverySettingsInput {
  values?: Record<string, string | boolean | null>;
  secrets?: Record<string, string>;
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
