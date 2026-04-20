import { apiClient } from './client';
import type {
  CheckoutSessionCreated,
  CheckoutSessionPublic,
  CheckoutSessionStatus,
  DeploymentsResponse,
  EntitlementsResponse,
  IssueDeploymentTokenResult,
  NotificationItem,
  NotificationUnreadCount,
  NotificationsResponse,
  OrdersResponse,
  DeploymentSummary,
  ReconcileResponse,
  SupportTicketDetail,
  SupportTicketsResponse,
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

export async function listMyNotifications(params: {
  limit?: number;
  offset?: number;
  status?: 'unread' | 'read' | 'archived';
  category?: 'account' | 'billing' | 'license' | 'deployment' | 'ticket' | 'system' | 'announcement';
} = {}): Promise<NotificationsResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    qs.set(key, normalized);
  }
  return apiClient<NotificationsResponse>(`/v1/notifications/me${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function getMyNotificationUnreadCount(): Promise<NotificationUnreadCount> {
  return apiClient<NotificationUnreadCount>('/v1/notifications/me/unread-count');
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  return apiClient<NotificationItem>(`/v1/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST'
  });
}

export async function markAllNotificationsRead(): Promise<{ updatedCount: number }> {
  return apiClient<{ updatedCount: number }>('/v1/notifications/read-all', {
    method: 'POST'
  });
}

export async function archiveNotification(notificationId: string): Promise<NotificationItem> {
  return apiClient<NotificationItem>(`/v1/notifications/${encodeURIComponent(notificationId)}/archive`, {
    method: 'POST'
  });
}

export async function listMyTickets(params: {
  limit?: number;
  offset?: number;
  search?: string;
  status?: 'waiting_staff' | 'waiting_user' | 'resolved' | 'closed';
  category?: 'account' | 'billing' | 'access' | 'install' | 'deployment' | 'bug' | 'feature' | 'other';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
} = {}): Promise<SupportTicketsResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    qs.set(key, normalized);
  }
  return apiClient<SupportTicketsResponse>(`/v1/tickets/me${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function createMyTicket(payload: {
  appCode?: string;
  orderNo?: string;
  extensionInstallId?: string;
  deploymentId?: string;
  category: 'account' | 'billing' | 'access' | 'install' | 'deployment' | 'bug' | 'feature' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  body: string;
}): Promise<SupportTicketDetail> {
  return apiClient<SupportTicketDetail>('/v1/tickets', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getMyTicket(ticketNo: string): Promise<SupportTicketDetail> {
  return apiClient<SupportTicketDetail>(`/v1/tickets/${encodeURIComponent(ticketNo)}`);
}

export async function replyMyTicket(ticketNo: string, body: string): Promise<SupportTicketDetail> {
  return apiClient<SupportTicketDetail>(`/v1/tickets/${encodeURIComponent(ticketNo)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
}

export async function closeMyTicket(ticketNo: string): Promise<SupportTicketDetail> {
  return apiClient<SupportTicketDetail>(`/v1/tickets/${encodeURIComponent(ticketNo)}/close`, {
    method: 'POST'
  });
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
