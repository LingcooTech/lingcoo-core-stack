import { apiClient } from './client';
import type {
  AdminResetPasswordResult,
  AdminUpdateUserInput,
  AdminUserDetail,
  AdminUsersResponse,
  AuthorizationGrantsResponse,
  AuthorizationTemplateSummary,
  EventsResponse,
  GrantAuthorizationInput,
  GrantAuthorizationResult,
  InstallsResponse,
  OrderDetail,
  OrdersResponse,
  PriceSummary,
  ProductSummary,
  ReconcileResponse,
  RevokeAuthorizationResult,
  WebhooksResponse
} from './types';

export interface UpsertProductInput {
  name: string;
  type: 'chrome_extension' | 'web_app' | 'service';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  tagline?: string;
  description?: string;
  content?: string;
  iconUrl?: string;
  coverUrl?: string;
  category?: string;
  deliveryMode?: 'direct_access' | 'one_click_deploy';
}

export interface UpsertPriceInput {
  productCode: string;
  name: string;
  billingPriceId?: string;
  priceAmount: number;
  currency: string;
  interval: 'month' | 'year' | 'one_time';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  authorizationCodes: string[];
  meta?: Record<string, unknown>;
}

export interface UpsertAuthorizationTemplateInput {
  productCode: string;
  name: string;
  kind: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
}

export interface PriceUpsertResult {
  price: PriceSummary;
  product: ProductSummary;
  authorizationTemplate: AuthorizationTemplateSummary;
}

export interface AuthorizationTemplateUpsertResult {
  authorizationTemplate: AuthorizationTemplateSummary;
  product: ProductSummary;
}

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

export async function upsertProductBasic(productCode: string, payload: UpsertProductInput): Promise<ProductSummary> {
  return apiClient<ProductSummary>(`/v1/admin/products/${encodeURIComponent(productCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function upsertPrice(priceCode: string, payload: UpsertPriceInput): Promise<PriceUpsertResult> {
  const authorizationTemplateCode = payload.authorizationCodes[0];
  const billingType = payload.interval === 'one_time' ? 'one_time' : 'recurring';
  const billingInterval = payload.interval === 'one_time' ? undefined : payload.interval;
  const grantStrategy = payload.interval === 'one_time' ? 'lifetime' : 'subscription_period';

  return apiClient<PriceUpsertResult>(`/v1/admin/prices/${encodeURIComponent(priceCode)}`, {
    method: 'PUT',
    body: JSON.stringify({
      productCode: payload.productCode,
      authorizationTemplateCode,
      name: payload.name,
      billingProvider: 'self_hosted',
      billingPriceId: payload.billingPriceId,
      billingType,
      billingInterval,
      amount: payload.priceAmount,
      currency: payload.currency,
      grantStrategy,
      status: payload.status,
      meta: payload.meta
    })
  });
}

export async function upsertAuthorizationTemplate(
  authorizationTemplateCode: string,
  payload: UpsertAuthorizationTemplateInput
): Promise<AuthorizationTemplateUpsertResult> {
  return apiClient<AuthorizationTemplateUpsertResult>(`/v1/admin/authorization-templates/${encodeURIComponent(authorizationTemplateCode)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function listAuthorizationGrants(limit = 50): Promise<AuthorizationGrantsResponse> {
  return apiClient<AuthorizationGrantsResponse>(`/v1/admin/authorization-grants?limit=${limit}`);
}

export async function grantAuthorization(payload: GrantAuthorizationInput): Promise<GrantAuthorizationResult> {
  return apiClient<GrantAuthorizationResult>('/v1/admin/authorization-grants/grant', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function revokeAuthorization(grantId: string): Promise<RevokeAuthorizationResult> {
  return apiClient<RevokeAuthorizationResult>(`/v1/admin/authorization-grants/${encodeURIComponent(grantId)}/revoke`, {
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
