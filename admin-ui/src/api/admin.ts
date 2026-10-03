import { apiClient } from './client';
import type {
  AdminUser,
  JobRetryResponse,
  AuditLogsResponse,
  AdminNotificationsResponse,
  AdminDocSpaceDetail,
  AdminDocSpaceListResponse,
  OrderAdminActionResult,
  ObservabilitySummary,
  AdminResetPasswordResult,
  AdminUpdateUserInput,
  AdminUserDetail,
  AdminUsersResponse,
  JobRunsResponse,
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
  SupportTicketDetail,
  SupportTicketsResponse,
  WebhooksResponse,
} from './types';

export interface AdminListParams {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface AdminOrderListParams extends AdminListParams {
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunding' | 'refunded';
  provider?: 'wechat_pay' | 'alipay';
}

export interface AdminContentListParams extends AdminListParams {
  status?: 'draft' | 'published' | 'archived';
  sourceType?: 'manual' | 'wordpress' | 'notion' | 'wechat';
}

export interface AdminNotificationListParams extends AdminListParams {
  status?: 'unread' | 'read' | 'archived';
  category?:
    | 'account'
    | 'billing'
    | 'license'
    | 'deployment'
    | 'ticket'
    | 'system'
    | 'announcement';
}

export interface AdminTicketListParams extends AdminListParams {
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
  return apiClient('GET /v1/admin/orders', `/v1/admin/orders${qs ? `?${qs}` : ''}`);
}

export async function listDocSpaces(
  params: { search?: string } = {},
): Promise<AdminDocSpaceListResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/docs/spaces', `/v1/admin/docs/spaces${qs ? `?${qs}` : ''}`);
}

export async function getDocSpace(spaceId: string): Promise<AdminDocSpaceDetail> {
  return apiClient(
    'GET /v1/admin/docs/spaces/:param',
    `/v1/admin/docs/spaces/${encodeURIComponent(spaceId)}`,
  );
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
  return apiClient('POST /v1/admin/docs/spaces', '/v1/admin/docs/spaces', {
    body: JSON.stringify(payload),
  });
}

export async function updateDocSpace(
  spaceId: string,
  payload: {
    slug: string;
    title: string;
    description?: string;
    iconUrl?: string;
    type: 'product' | 'app' | 'internal';
    appId?: string;
    sortOrder: number;
    status: 'active' | 'hidden' | 'archived';
    meta?: Record<string, unknown>;
  },
) {
  return apiClient(
    'PUT /v1/admin/docs/spaces/:param',
    `/v1/admin/docs/spaces/${encodeURIComponent(spaceId)}`,
    { body: JSON.stringify(payload) },
  );
}

export async function getDocPage(pageId: string) {
  return apiClient(
    'GET /v1/admin/docs/pages/:param',
    `/v1/admin/docs/pages/${encodeURIComponent(pageId)}`,
  );
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
  return apiClient('POST /v1/admin/docs/pages', '/v1/admin/docs/pages', {
    body: JSON.stringify(payload),
  });
}

export async function updateDocPage(
  pageId: string,
  payload: {
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
  },
) {
  return apiClient(
    'PUT /v1/admin/docs/pages/:param',
    `/v1/admin/docs/pages/${encodeURIComponent(pageId)}`,
    { body: JSON.stringify(payload) },
  );
}

export async function listContent(
  params: AdminContentListParams = {},
): Promise<ContentListResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/content', `/v1/admin/content${qs ? `?${qs}` : ''}`);
}

export async function getContent(contentId: string): Promise<ContentItem> {
  return apiClient(
    'GET /v1/admin/content/:param',
    `/v1/admin/content/${encodeURIComponent(contentId)}`,
  );
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
  return apiClient('POST /v1/admin/content', '/v1/admin/content', {
    body: JSON.stringify(payload),
  });
}

export async function updateContent(
  contentId: string,
  payload: {
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
  },
): Promise<ContentItem> {
  return apiClient(
    'PUT /v1/admin/content/:param',
    `/v1/admin/content/${encodeURIComponent(contentId)}`,
    { body: JSON.stringify(payload) },
  );
}

export async function importWordPressContent(payload: {
  postUrl: string;
  status?: 'draft' | 'published';
}): Promise<ContentItem> {
  return apiClient(
    'POST /v1/admin/content/import/wordpress',
    '/v1/admin/content/import/wordpress',
    { body: JSON.stringify(payload) },
  );
}

export async function importNotionContent(payload: {
  pageUrl: string;
  status?: 'draft' | 'published';
}): Promise<ContentItem> {
  return apiClient('POST /v1/admin/content/import/notion', '/v1/admin/content/import/notion', {
    body: JSON.stringify(payload),
  });
}

export async function importWechatContent(payload: {
  url: string;
  status?: 'draft' | 'published';
}): Promise<ContentItem> {
  return apiClient('POST /v1/admin/content/import/wechat', '/v1/admin/content/import/wechat', {
    body: JSON.stringify(payload),
  });
}

export async function getOrderDetail(orderNo: string): Promise<OrderDetail> {
  return apiClient(
    'GET /v1/admin/orders/:param',
    `/v1/admin/orders/${encodeURIComponent(orderNo)}`,
  );
}

export async function reconcileOrder(orderNo: string): Promise<ReconcileResponse> {
  return apiClient(
    'POST /v1/admin/orders/:param/reconcile',
    `/v1/admin/orders/${encodeURIComponent(orderNo)}/reconcile`,
  );
}

export async function cancelOrder(orderNo: string): Promise<OrderAdminActionResult> {
  return apiClient(
    'POST /v1/admin/orders/:param/cancel',
    `/v1/admin/orders/${encodeURIComponent(orderNo)}/cancel`,
  );
}

export async function refundOrder(orderNo: string): Promise<OrderAdminActionResult> {
  return apiClient(
    'POST /v1/admin/orders/:param/refund',
    `/v1/admin/orders/${encodeURIComponent(orderNo)}/refund`,
  );
}

export async function listInstalls(params: AdminListParams = {}): Promise<InstallsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/installs', `/v1/admin/installs${qs ? `?${qs}` : ''}`);
}

export async function listAdminTickets(
  params: AdminTicketListParams = {},
): Promise<SupportTicketsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/tickets', `/v1/admin/tickets${qs ? `?${qs}` : ''}`);
}

export async function getAdminTicket(ticketNo: string): Promise<SupportTicketDetail> {
  return apiClient(
    'GET /v1/admin/tickets/:param',
    `/v1/admin/tickets/${encodeURIComponent(ticketNo)}`,
  );
}

export async function replyAdminTicket(payload: {
  ticketNo: string;
  body: string;
  isInternal?: boolean;
}): Promise<SupportTicketDetail> {
  return apiClient(
    'POST /v1/admin/tickets/:param/messages',
    `/v1/admin/tickets/${encodeURIComponent(payload.ticketNo)}/messages`,
    {
      body: JSON.stringify({
        body: payload.body,
        isInternal: payload.isInternal ?? false,
      }),
    },
  );
}

export async function assignAdminTicket(payload: {
  ticketNo: string;
  assignedAdminUserId: string | null;
}): Promise<SupportTicketDetail> {
  return apiClient(
    'POST /v1/admin/tickets/:param/assign',
    `/v1/admin/tickets/${encodeURIComponent(payload.ticketNo)}/assign`,
    {
      body: JSON.stringify({
        assignedAdminUserId: payload.assignedAdminUserId,
      }),
    },
  );
}

export async function updateAdminTicketStatus(payload: {
  ticketNo: string;
  status: 'waiting_staff' | 'waiting_user' | 'resolved' | 'closed';
}): Promise<SupportTicketDetail> {
  return apiClient(
    'POST /v1/admin/tickets/:param/status',
    `/v1/admin/tickets/${encodeURIComponent(payload.ticketNo)}/status`,
    {
      body: JSON.stringify({
        status: payload.status,
      }),
    },
  );
}

export async function listEntitlements(
  params: AdminListParams = {},
): Promise<EntitlementsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/entitlements', `/v1/admin/entitlements${qs ? `?${qs}` : ''}`);
}

export async function grantEntitlement(
  payload: GrantEntitlementInput,
): Promise<GrantEntitlementResult> {
  return apiClient('POST /v1/admin/entitlements/grant', '/v1/admin/entitlements/grant', {
    body: JSON.stringify(payload),
  });
}

export async function revokeEntitlement(entitlementId: string): Promise<RevokeEntitlementResult> {
  return apiClient(
    'POST /v1/admin/entitlements/:param/revoke',
    `/v1/admin/entitlements/${encodeURIComponent(entitlementId)}/revoke`,
  );
}

export async function listEvents(params: AdminListParams = {}): Promise<EventsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/events', `/v1/admin/events${qs ? `?${qs}` : ''}`);
}

export async function listBillingWebhooks(params: AdminListParams = {}): Promise<WebhooksResponse> {
  const qs = buildQueryString(params);
  return apiClient(
    'GET /v1/admin/billing-webhooks',
    `/v1/admin/billing-webhooks${qs ? `?${qs}` : ''}`,
  );
}

export async function listJobRuns(params: AdminListParams = {}): Promise<JobRunsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/jobs', `/v1/admin/jobs${qs ? `?${qs}` : ''}`);
}

export async function retryJobRun(jobId: string): Promise<JobRetryResponse> {
  return apiClient(
    'POST /v1/admin/jobs/:param/retry',
    `/v1/admin/jobs/${encodeURIComponent(jobId)}/retry`,
  );
}

export async function listAuditLogs(params: AdminListParams = {}): Promise<AuditLogsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/audit-logs', `/v1/admin/audit-logs${qs ? `?${qs}` : ''}`);
}

export async function getObservabilitySummary(): Promise<ObservabilitySummary> {
  return apiClient('GET /v1/admin/observability/summary', '/v1/admin/observability/summary');
}

export async function listAdminNotifications(
  params: AdminNotificationListParams = {},
): Promise<AdminNotificationsResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/notifications', `/v1/admin/notifications${qs ? `?${qs}` : ''}`);
}

export async function publishAnnouncement(payload: {
  title: string;
  body: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<PublishAnnouncementResult> {
  return apiClient(
    'POST /v1/admin/notifications/announcements',
    '/v1/admin/notifications/announcements',
    { body: JSON.stringify(payload) },
  );
}

export async function listUsers(params: {
  limit?: number;
  offset?: number;
  search?: string;
  role?: string;
  status?: string;
}): Promise<AdminUsersResponse> {
  const qs = buildQueryString(params);
  return apiClient('GET /v1/admin/users', `/v1/admin/users?${qs.toString()}`);
}

export async function getUser(userId: string): Promise<AdminUserDetail> {
  return apiClient('GET /v1/admin/users/:param', `/v1/admin/users/${encodeURIComponent(userId)}`);
}

export async function updateUser(
  userId: string,
  payload: AdminUpdateUserInput,
): Promise<AdminUser> {
  return apiClient('PUT /v1/admin/users/:param', `/v1/admin/users/${encodeURIComponent(userId)}`, {
    body: JSON.stringify(payload),
  });
}

export async function suspendUser(userId: string): Promise<AdminUser> {
  return apiClient(
    'POST /v1/admin/users/:param/suspend',
    `/v1/admin/users/${encodeURIComponent(userId)}/suspend`,
  );
}

export async function activateUser(userId: string): Promise<AdminUser> {
  return apiClient(
    'POST /v1/admin/users/:param/activate',
    `/v1/admin/users/${encodeURIComponent(userId)}/activate`,
  );
}

export async function resetUserPassword(userId: string): Promise<AdminResetPasswordResult> {
  return apiClient(
    'POST /v1/admin/users/:param/reset-password',
    `/v1/admin/users/${encodeURIComponent(userId)}/reset-password`,
  );
}
