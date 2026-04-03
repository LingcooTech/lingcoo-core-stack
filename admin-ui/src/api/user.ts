import { apiClient } from './client';
import type { CheckoutSessionCreated, DeploymentsResponse, EntitlementsResponse, IssueDeploymentTokenResult, OrdersResponse, DeploymentSummary } from './types';

export async function listMyOrders(): Promise<OrdersResponse> {
  return apiClient<OrdersResponse>('/v1/billing/orders/me');
}

export async function syncMyOrder(orderNo: string) {
  return apiClient(`/v1/billing/orders/${encodeURIComponent(orderNo)}/sync`, {
    method: 'POST'
  });
}

export async function listMyEntitlements(): Promise<EntitlementsResponse> {
  return apiClient<EntitlementsResponse>('/v1/entitlements/me');
}

export async function createCheckoutSession(payload: {
  appCode: string;
  planCode: string;
  offerCode?: string;
  providerPreference?: 'wechat_pay' | 'alipay';
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutSessionCreated> {
  return apiClient<CheckoutSessionCreated>('/v1/checkout/sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function listMyDeployments(): Promise<DeploymentsResponse> {
  return apiClient<DeploymentsResponse>('/v1/deployments/me');
}

export async function createDeployment(payload: {
  appCode: string;
  productCode?: string;
  label: string;
  environment?: string;
  serverHost?: string;
  primaryDomain?: string;
  adminDomain?: string;
  wsDomain?: string;
  endpoints?: Record<string, string>;
  installPath?: string;
}): Promise<DeploymentSummary> {
  return apiClient<DeploymentSummary>('/v1/deployments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function issueDeploymentToken(payload: {
  deploymentId: string;
  expiresInHours?: number;
}): Promise<IssueDeploymentTokenResult> {
  return apiClient<IssueDeploymentTokenResult>(`/v1/deployments/${encodeURIComponent(payload.deploymentId)}/tokens`, {
    method: 'POST',
    body: JSON.stringify({
      expiresInHours: payload.expiresInHours ?? 2
    })
  });
}
