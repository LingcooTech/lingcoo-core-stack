import { apiClient } from './client';
import type { PaymentSettingsOverview } from './types';

export async function getPaymentSettings(): Promise<PaymentSettingsOverview> {
  return apiClient('GET /v1/admin/payment-settings', '/v1/admin/payment-settings');
}

export interface WechatPaySettings {
  appId?: string;
  appSecret?: string;
  mchId?: string;
  apiKey?: string;
  disableH5?: boolean;
}

export interface AlipaySettings {
  appId?: string;
  f2fPay?: boolean;
  privateKeyPem?: string;
  publicKeyPem?: string;
}

export async function upsertWechatSettings(payload: WechatPaySettings): Promise<unknown> {
  return apiClient('PUT /v1/admin/payment-settings/wechat', '/v1/admin/payment-settings/wechat', {
    body: JSON.stringify(payload),
  });
}

export async function upsertAlipaySettings(payload: AlipaySettings): Promise<unknown> {
  return apiClient('PUT /v1/admin/payment-settings/alipay', '/v1/admin/payment-settings/alipay', {
    body: JSON.stringify(payload),
  });
}

export async function clearProviderSettings(provider: 'wechat_pay' | 'alipay'): Promise<void> {
  await apiClient(
    'DELETE /v1/admin/payment-settings/:param',
    `/v1/admin/payment-settings/${provider}`,
  );
}
