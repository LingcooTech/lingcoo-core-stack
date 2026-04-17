import { apiClient } from './client';
import type {
  CheckoutSessionCreated,
  CheckoutSessionPublic,
  CheckoutSessionStatus,
  DeploymentsResponse,
  EntitlementsResponse,
  IssueDeploymentTokenResult,
  OrdersResponse,
  DeploymentSummary,
  ReconcileResponse,
} from './types';

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

export async function getCheckoutSessionPublic(sessionCode: string): Promise<CheckoutSessionPublic> {
  return apiClient<CheckoutSessionPublic>(`/v1/checkout/sessions/${encodeURIComponent(sessionCode)}/public`);
}

export async function getCheckoutSessionStatus(sessionCode: string): Promise<CheckoutSessionStatus> {
  return apiClient<CheckoutSessionStatus>(`/v1/checkout/sessions/${encodeURIComponent(sessionCode)}/status`);
}

export async function reconcileCheckoutSession(sessionCode: string): Promise<ReconcileResponse> {
  return apiClient<ReconcileResponse>(`/v1/checkout/sessions/${encodeURIComponent(sessionCode)}/reconcile`, {
    method: 'POST',
  });
}

export async function listMyDeployments(): Promise<DeploymentsResponse> {
  return apiClient<DeploymentsResponse>('/v1/deployments/me');
}

export async function createDeployment(payload: {
  appCode: string;
  label: string;
  environment?: string;
  serverHost?: string;
  primaryDomain?: string;
  adminDomain?: string;
  wsDomain?: string;
  installPath?: string;
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
}): Promise<DeploymentSummary> {
  return apiClient<DeploymentSummary>('/v1/deployments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDeployment(payload: {
  deploymentId: string;
  label?: string;
  environment?: string;
  serverHost?: string;
  primaryDomain?: string;
  adminDomain?: string;
  wsDomain?: string;
  installPath?: string;
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
}): Promise<DeploymentSummary> {
  const { deploymentId, ...body } = payload;
  return apiClient<DeploymentSummary>(`/v1/deployments/${encodeURIComponent(deploymentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
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

export async function deactivateDeployment(payload: { deploymentId: string }): Promise<DeploymentSummary> {
  return apiClient<DeploymentSummary>(`/v1/deployments/${encodeURIComponent(payload.deploymentId)}/deactivate`, {
    method: 'POST'
  });
}
