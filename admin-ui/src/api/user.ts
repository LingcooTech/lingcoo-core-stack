import { apiClient } from './client';
import type {
  CheckoutSessionCreated,
  CheckoutSessionPublic,
  CheckoutSessionStatus,
  DeploymentsResponse,
  MyEntitlementsResponse,
  IssueDeploymentTokenResult,
  NotificationItem,
  NotificationUnreadCount,
  NotificationsResponse,
  MyOrdersResponse,
  DeploymentSummary,
  ReconcileResponse,
  SupportTicketDetail,
  SupportTicketsResponse,
} from './types';

export async function listMyOrders(): Promise<MyOrdersResponse> {
  return apiClient('GET /v1/billing/orders/me', '/v1/billing/orders/me');
}

export async function syncMyOrder(orderNo: string) {
  return apiClient(
    'POST /v1/billing/orders/:param/sync',
    `/v1/billing/orders/${encodeURIComponent(orderNo)}/sync`,
  );
}

export async function listMyEntitlements(): Promise<MyEntitlementsResponse> {
  return apiClient('GET /v1/entitlements/me', '/v1/entitlements/me');
}

export async function listMyNotifications(
  params: {
    limit?: number;
    offset?: number;
    status?: 'unread' | 'read' | 'archived';
    category?:
      | 'account'
      | 'billing'
      | 'license'
      | 'deployment'
      | 'ticket'
      | 'system'
      | 'announcement';
  } = {},
): Promise<NotificationsResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    qs.set(key, normalized);
  }
  return apiClient(
    'GET /v1/notifications/me',
    `/v1/notifications/me${qs.toString() ? `?${qs.toString()}` : ''}`,
  );
}

export async function getMyNotificationUnreadCount(): Promise<NotificationUnreadCount> {
  return apiClient('GET /v1/notifications/me/unread-count', '/v1/notifications/me/unread-count');
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  return apiClient(
    'POST /v1/notifications/:param/read',
    `/v1/notifications/${encodeURIComponent(notificationId)}/read`,
  );
}

export async function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  return apiClient('POST /v1/notifications/read-all', '/v1/notifications/read-all');
}

export async function archiveNotification(notificationId: string): Promise<NotificationItem> {
  return apiClient(
    'POST /v1/notifications/:param/archive',
    `/v1/notifications/${encodeURIComponent(notificationId)}/archive`,
  );
}

export async function listMyTickets(
  params: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: 'waiting_staff' | 'waiting_user' | 'resolved' | 'closed';
    category?:
      | 'account'
      | 'billing'
      | 'access'
      | 'install'
      | 'deployment'
      | 'bug'
      | 'feature'
      | 'other';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  } = {},
): Promise<SupportTicketsResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    qs.set(key, normalized);
  }
  return apiClient(
    'GET /v1/tickets/me',
    `/v1/tickets/me${qs.toString() ? `?${qs.toString()}` : ''}`,
  );
}

export async function createMyTicket(payload: {
  appCode?: string;
  orderNo?: string;
  extensionInstallId?: string;
  deploymentId?: string;
  category:
    | 'account'
    | 'billing'
    | 'access'
    | 'install'
    | 'deployment'
    | 'bug'
    | 'feature'
    | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  body: string;
}): Promise<SupportTicketDetail> {
  return apiClient('POST /v1/tickets', '/v1/tickets', { body: JSON.stringify(payload) });
}

export async function getMyTicket(ticketNo: string): Promise<SupportTicketDetail> {
  return apiClient('GET /v1/tickets/:param', `/v1/tickets/${encodeURIComponent(ticketNo)}`);
}

export async function replyMyTicket(ticketNo: string, body: string): Promise<SupportTicketDetail> {
  return apiClient(
    'POST /v1/tickets/:param/messages',
    `/v1/tickets/${encodeURIComponent(ticketNo)}/messages`,
    { body: JSON.stringify({ body }) },
  );
}

export async function closeMyTicket(ticketNo: string): Promise<SupportTicketDetail> {
  return apiClient(
    'POST /v1/tickets/:param/close',
    `/v1/tickets/${encodeURIComponent(ticketNo)}/close`,
  );
}

export async function createCheckoutSession(payload: {
  appCode: string;
  planCode: string;
  offerCode?: string;
  hosting?: { offerId: string; version: number };
  hostingOnly?: { entitlementId: string; deploymentId?: string };
  providerPreference?: 'wechat_pay' | 'alipay';
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CheckoutSessionCreated> {
  return apiClient('POST /v1/checkout/sessions', '/v1/checkout/sessions', {
    body: JSON.stringify(payload),
  });
}

export async function getCheckoutSessionPublic(
  sessionCode: string,
): Promise<CheckoutSessionPublic> {
  return apiClient(
    'GET /v1/checkout/sessions/:param/public',
    `/v1/checkout/sessions/${encodeURIComponent(sessionCode)}/public`,
  );
}

export async function getCheckoutSessionStatus(
  sessionCode: string,
): Promise<CheckoutSessionStatus> {
  return apiClient(
    'GET /v1/checkout/sessions/:param/status',
    `/v1/checkout/sessions/${encodeURIComponent(sessionCode)}/status`,
  );
}

export async function reconcileCheckoutSession(sessionCode: string): Promise<ReconcileResponse> {
  return apiClient(
    'POST /v1/checkout/sessions/:param/reconcile',
    `/v1/checkout/sessions/${encodeURIComponent(sessionCode)}/reconcile`,
  );
}

export async function listMyDeployments(): Promise<DeploymentsResponse> {
  return apiClient('GET /v1/deployments/me', '/v1/deployments/me');
}

export async function createDeployment(payload: {
  appCode: string;
  entitlementId: string;
  label: string;
  environment?: string;
  deploymentMode?: 'self_hosted' | 'managed';
  hostedPrefix?: string;
  serverHost?: string;
  installPath?: string;
  updatePolicy?: 'manual' | 'auto';
  domainValues?: Record<string, string>;
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
}): Promise<DeploymentSummary> {
  return apiClient('POST /v1/deployments', '/v1/deployments', { body: JSON.stringify(payload) });
}

export async function updateDeployment(payload: {
  deploymentId: string;
  label?: string;
  environment?: string;
  serverHost?: string;
  installPath?: string;
  updatePolicy?: 'manual' | 'auto';
  domainValues?: Record<string, string>;
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
}): Promise<DeploymentSummary> {
  const { deploymentId, ...body } = payload;
  return apiClient(
    'PATCH /v1/deployments/:param',
    `/v1/deployments/${encodeURIComponent(deploymentId)}`,
    { body: JSON.stringify(body) },
  );
}

export async function issueDeploymentToken(payload: {
  deploymentId: string;
  expiresInHours?: number;
}): Promise<IssueDeploymentTokenResult> {
  return apiClient(
    'POST /v1/deployments/:param/tokens',
    `/v1/deployments/${encodeURIComponent(payload.deploymentId)}/tokens`,
    {
      body: JSON.stringify({
        expiresInHours: payload.expiresInHours ?? 2,
      }),
    },
  );
}

export async function deactivateDeployment(payload: {
  deploymentId: string;
}): Promise<DeploymentSummary> {
  return apiClient(
    'POST /v1/deployments/:param/deactivate',
    `/v1/deployments/${encodeURIComponent(payload.deploymentId)}/deactivate`,
  );
}

export async function requestDeploymentAction(payload: {
  deploymentId: string;
  kind:
    | 'apply_runtime_images'
    | 'apply_wordpress_assets'
    | 'ignore_runtime_images'
    | 'ignore_wordpress_assets';
}): Promise<{ ok: true }> {
  return apiClient(
    'POST /v1/deployments/:param/actions',
    `/v1/deployments/${encodeURIComponent(payload.deploymentId)}/actions`,
    { body: JSON.stringify({ kind: payload.kind }) },
  );
}

export async function getDeploymentOptions() {
  return apiClient('GET /v1/deployments/options', '/v1/deployments/options');
}
export async function retryManagedAllocation(deploymentId: string) {
  return apiClient(
    'POST /v1/deployments/:param/allocate',
    `/v1/deployments/${encodeURIComponent(deploymentId)}/allocate`,
  );
}

export const listDeploymentDomains = (id: string) =>
  apiClient('GET /v1/deployments/:param/domains', `/v1/deployments/${id}/domains`);
export const addDeploymentDomain = (id: string, hostname: string) =>
  apiClient('POST /v1/deployments/:param/domains', `/v1/deployments/${id}/domains`, {
    body: JSON.stringify({ hostname }),
  });
export const verifyDeploymentDomain = (id: string, domainId: string) =>
  apiClient(
    'POST /v1/deployments/:param/domains/:param/verify',
    `/v1/deployments/${id}/domains/${domainId}/verify`,
  );
export const removeDeploymentDomain = (id: string, domainId: string) =>
  apiClient(
    'DELETE /v1/deployments/:param/domains/:param',
    `/v1/deployments/${id}/domains/${domainId}`,
  );
