import { apiClient } from './client';
import type {
  AdminResetPasswordResult,
  AdminUpdateUserInput,
  AdminUserDetail,
  AdminUsersResponse,
  EntitlementsResponse,
  EventsResponse,
  GrantEntitlementInput,
  GrantEntitlementResult,
  InstallsResponse,
  OrderDetail,
  OrdersResponse,
  ReconcileResponse,
  RevokeEntitlementResult,
  WebhooksResponse
} from './types';

export async function listOrders(limit = 50): Promise<OrdersResponse> {
  return apiClient<OrdersResponse>(`/v1/admin/orders?limit=${limit}`);
}

export async function getOrderDetail(orderNo: string): Promise<OrderDetail> {
  return apiClient<OrderDetail>(`/v1/admin/orders/${encodeURIComponent(orderNo)}`);
}

export async function reconcileOrder(orderNo: string): Promise<ReconcileResponse> {
  return apiClient<ReconcileResponse>(`/v1/admin/orders/${encodeURIComponent(orderNo)}/reconcile`, {
    method: 'POST'
  });
}

export async function listInstalls(limit = 50): Promise<InstallsResponse> {
  return apiClient<InstallsResponse>(`/v1/admin/installs?limit=${limit}`);
}

export async function listEntitlements(limit = 50): Promise<EntitlementsResponse> {
  return apiClient<EntitlementsResponse>(`/v1/admin/entitlements?limit=${limit}`);
}

export async function grantEntitlement(payload: GrantEntitlementInput): Promise<GrantEntitlementResult> {
  return apiClient<GrantEntitlementResult>('/v1/admin/entitlements/grant', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function revokeEntitlement(entitlementId: string): Promise<RevokeEntitlementResult> {
  return apiClient<RevokeEntitlementResult>(`/v1/admin/entitlements/${encodeURIComponent(entitlementId)}/revoke`, {
    method: 'POST'
  });
}

export async function listEvents(limit = 50): Promise<EventsResponse> {
  return apiClient<EventsResponse>(`/v1/admin/events?limit=${limit}`);
}

export async function listBillingWebhooks(limit = 50): Promise<WebhooksResponse> {
  return apiClient<WebhooksResponse>(`/v1/admin/billing-webhooks?limit=${limit}`);
}

export async function listUsers(params: { limit?: number; offset?: number; search?: string; role?: string; status?: string }): Promise<AdminUsersResponse> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  if (params.search) qs.set('search', params.search);
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  return apiClient<AdminUsersResponse>(`/v1/admin/users?${qs.toString()}`);
}

export async function getUser(userId: string): Promise<AdminUserDetail> {
  return apiClient<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(userId)}`);
}

export async function updateUser(userId: string, payload: AdminUpdateUserInput): Promise<AdminUserDetail> {
  return apiClient<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function suspendUser(userId: string): Promise<AdminUserDetail> {
  return apiClient<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST'
  });
}

export async function activateUser(userId: string): Promise<AdminUserDetail> {
  return apiClient<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(userId)}/activate`, {
    method: 'POST'
  });
}

export async function resetUserPassword(userId: string): Promise<AdminResetPasswordResult> {
  return apiClient<AdminResetPasswordResult>(`/v1/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST'
  });
}
