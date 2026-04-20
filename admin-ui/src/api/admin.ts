import { apiClient } from './client';
import type {
  AdminNotificationsResponse,
  AdminDocSpaceDetail,
  AdminDocSpaceListResponse,
  AdminResetPasswordResult,
  AdminUpdateUserInput,
  AdminUserDetail,
  AdminUsersResponse,
  ContentItem,
  ContentListResponse,
  EntitlementsResponse,
  EventsResponse,
  GrantEntitlementInput,
  GrantEntitlementResult,
  InstallsResponse,
  OrderDetail,
  OrdersResponse,
  PublishAnnouncementResult,
  ReconcileResponse,
  RevokeEntitlementResult,
  WebhooksResponse
} from './types';

export interface AdminListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface AdminOrderListParams extends AdminListParams {
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  provider?: 'wechat_pay' | 'alipay';
}

export interface AdminContentListParams extends AdminListParams {
  status?: 'draft' | 'published' | 'archived';
  sourceType?: 'manual' | 'wordpress' | 'notion' | 'wechat';
}

export interface AdminNotificationListParams extends AdminListParams {
  status?: 'unread' | 'read' | 'archived';
  category?: 'account' | 'billing' | 'license' | 'deployment' | 'system' | 'announcement';
}

function buildQueryString<T extends object>(params: T | undefined) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

export async function listOrders(params: AdminOrderListParams = {}): Promise<OrdersResponse> {
  const qs = buildQueryString(params);
  return apiClient<OrdersResponse>(`/v1/admin/orders${qs ? `?${qs}` : ''}`);
}

export async function listDocSpaces(params: { search?: string } = {}): Promise<AdminDocSpaceListResponse> {
  const qs = buildQueryString(params);
  return apiClient<AdminDocSpaceListResponse>(`/v1/admin/docs/spaces${qs ? `?${qs}` : ''}`);
}

export async function getDocSpace(spaceId: string): Promise<AdminDocSpaceDetail> {
  return apiClient<AdminDocSpaceDetail>(`/v1/admin/docs/spaces/${encodeURIComponent(spaceId)}`);
}

export async function createDocSpace(payload: {
  slug: string;
  title: string;
  description?: string;
  iconUrl?: string;
  type: 'product' | 'app' | 'internal';
  appId?: string;
  sortOrder: number;
  status: 'active' | 'hidden' | 'archived';
  meta?: Record<string, unknown>;
}) {
  return apiClient('/v1/admin/docs/spaces', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDocSpace(spaceId: string, payload: {
  slug: string;
  title: string;
  description?: string;
  iconUrl?: string;
  type: 'product' | 'app' | 'internal';
  appId?: string;
  sortOrder: number;
  status: 'active' | 'hidden' | 'archived';
  meta?: Record<string, unknown>;
}) {
  return apiClient(`/v1/admin/docs/spaces/${encodeURIComponent(spaceId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function getDocPage(pageId: string) {
  return apiClient(`/v1/admin/docs/pages/${encodeURIComponent(pageId)}`);
}

export async function createDocPage(payload: {
  spaceId: string;
  parentId?: string;
  slug: string;
  title: string;
  summary?: string;
  content: string;
  sortOrder: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  meta?: Record<string, unknown>;
}) {
  return apiClient('/v1/admin/docs/pages', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateDocPage(pageId: string, payload: {
  spaceId: string;
  parentId?: string;
  slug: string;
  title: string;
  summary?: string;
  content: string;
  sortOrder: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string;
  meta?: Record<string, unknown>;
}) {
  return apiClient(`/v1/admin/docs/pages/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function listContent(params: AdminContentListParams = {}): Promise<ContentListResponse> {
  const qs = buildQueryString(params);
  return apiClient<ContentListResponse>(`/v1/admin/content${qs ? `?${qs}` : ''}`);
}

export async function getContent(contentId: string): Promise<ContentItem> {
  return apiClient<ContentItem>(`/v1/admin/content/${encodeURIComponent(contentId)}`);
}

export async function createContent(payload: {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  coverUrl?: string;
  authorName?: string;
  status: 'draft' | 'published' | 'archived';
  sourceType?: 'manual' | 'wordpress' | 'notion' | 'wechat';
  sourceId?: string;
  sourceUrl?: string;
  publishedAt?: string;
  meta?: Record<string, unknown>;
}): Promise<ContentItem> {
  return apiClient<ContentItem>('/v1/admin/content', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateContent(contentId: string, payload: {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  coverUrl?: string;
  authorName?: string;
  status: 'draft' | 'published' | 'archived';
  sourceType?: 'manual' | 'wordpress' | 'notion' | 'wechat';
  sourceId?: string;
  sourceUrl?: string;
  publishedAt?: string;
  meta?: Record<string, unknown>;
}): Promise<ContentItem> {
  return apiClient<ContentItem>(`/v1/admin/content/${encodeURIComponent(contentId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function importWordPressContent(payload: {
  postUrl: string;
  status?: 'draft' | 'published';
}): Promise<ContentItem> {
  return apiClient<ContentItem>('/v1/admin/content/import/wordpress', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function importNotionContent(payload: {
  pageUrl: string;
  status?: 'draft' | 'published';
}): Promise<ContentItem> {
  return apiClient<ContentItem>('/v1/admin/content/import/notion', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function importWechatContent(payload: {
  url: string;
  status?: 'draft' | 'published';
}): Promise<ContentItem> {
  return apiClient<ContentItem>('/v1/admin/content/import/wechat', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getOrderDetail(orderNo: string): Promise<OrderDetail> {
  return apiClient<OrderDetail>(`/v1/admin/orders/${encodeURIComponent(orderNo)}`);
}

export async function reconcileOrder(orderNo: string): Promise<ReconcileResponse> {
  return apiClient<ReconcileResponse>(`/v1/admin/orders/${encodeURIComponent(orderNo)}/reconcile`, {
    method: 'POST'
  });
}

export async function listInstalls(params: AdminListParams = {}): Promise<InstallsResponse> {
  const qs = buildQueryString(params);
  return apiClient<InstallsResponse>(`/v1/admin/installs${qs ? `?${qs}` : ''}`);
}

export async function listEntitlements(params: AdminListParams = {}): Promise<EntitlementsResponse> {
  const qs = buildQueryString(params);
  return apiClient<EntitlementsResponse>(`/v1/admin/entitlements${qs ? `?${qs}` : ''}`);
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

export async function listEvents(params: AdminListParams = {}): Promise<EventsResponse> {
  const qs = buildQueryString(params);
  return apiClient<EventsResponse>(`/v1/admin/events${qs ? `?${qs}` : ''}`);
}

export async function listBillingWebhooks(params: AdminListParams = {}): Promise<WebhooksResponse> {
  const qs = buildQueryString(params);
  return apiClient<WebhooksResponse>(`/v1/admin/billing-webhooks${qs ? `?${qs}` : ''}`);
}

export async function listAdminNotifications(
  params: AdminNotificationListParams = {},
): Promise<AdminNotificationsResponse> {
  const qs = buildQueryString(params);
  return apiClient<AdminNotificationsResponse>(`/v1/admin/notifications${qs ? `?${qs}` : ''}`);
}

export async function publishAnnouncement(payload: {
  title: string;
  body: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<PublishAnnouncementResult> {
  return apiClient<PublishAnnouncementResult>('/v1/admin/notifications/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listUsers(params: { limit?: number; offset?: number; search?: string; role?: string; status?: string }): Promise<AdminUsersResponse> {
  const qs = buildQueryString(params);
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
