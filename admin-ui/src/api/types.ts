// ─── Common ────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  email: string;
  displayName: string | null;
}

export interface PlanSummary {
  id: string;
  code: string;
  name: string;
  interval: string | null;
  priceAmount?: number;
  currency?: string;
  status?: string;
  appId?: string;
  meta?: Record<string, unknown>;
}

export interface AppSummary {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface FeatureSummary {
  id: string;
  code: string;
  name: string;
  kind: string;
  appId?: string;
  status?: string;
  createdAt?: string;
}

export interface PlanFeatureSummary {
  planId: string;
  featureId: string;
  value: string | null;
}

export interface CatalogSnapshot {
  plans: PlanSummary[];
  features: FeatureSummary[];
  planFeatures: PlanFeatureSummary[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface BootstrapStatus {
  hasAdmin: boolean;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    emailVerified: boolean;
  };
}

export interface CurrentUserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  emailVerified: boolean;
}

export interface VerifyEmailResponse {
  verified: boolean;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    emailVerified: boolean;
  };
}

export interface ResendVerificationResponse {
  sent: boolean;
  alreadyVerified?: boolean;
}

export interface ForgotPasswordResponse {
  sent: boolean;
}

export interface ResetPasswordResponse {
  reset: boolean;
}

export interface UpdateCurrentUserResponse {
  user: CurrentUserProfile;
}

export interface ChangePasswordResponse {
  changed: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail extends AdminUser {
  emailVerifiedAt: string | null;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUpdateUserInput {
  displayName?: string;
  role?: 'user' | 'support' | 'finance' | 'editor' | 'operator' | 'admin';
  status?: 'active' | 'suspended';
}

export interface AdminResetPasswordResult {
  userId: string;
  email: string;
  temporaryPassword: string;
}

// ─── Payment Settings ────────────────────────────────────────────────────────

export interface PaymentProviderSecretStatus {
  configured: boolean;
}

export interface PaymentProviderConfig {
  code: string;
  configured: boolean;
  source: 'database' | 'env' | 'unconfigured';
  values: Record<string, string | boolean | null>;
  secrets: Record<string, PaymentProviderSecretStatus>;
}

export interface PaymentSettingsOverview {
  items: PaymentProviderConfig[];
}

export interface SmtpSettingsOverview {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  values: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
  };
  secrets: {
    password: PaymentProviderSecretStatus;
  };
}

export interface SmtpTestEmailResult {
  sent: boolean;
  to: string;
  from: string;
  subject: string;
}

export interface AlertingSettingsOverview {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  values: {
    enabled: boolean;
    minimumLevel: 'info' | 'warning' | 'error';
    cooldownMinutes: number;
    email: {
      enabled: boolean;
      recipients: string[];
    };
    webhook: {
      enabled: boolean;
      url: string;
    };
  };
  secrets: {
    webhookSecret: PaymentProviderSecretStatus;
  };
}

export interface QiniuSettingsOverview {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  values: {
    accessKey: string;
    bucketName: string;
    publicBaseUrl: string;
    uploadHost: string;
    defaultPrefix: string;
  };
  secrets: {
    secretKey: PaymentProviderSecretStatus;
  };
}

export interface QiniuTestConnectionResult {
  ok: boolean;
  bucketName: string;
  publicBaseUrl: string;
  sampleCount: number;
}

export interface QiniuImageItem {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedAt: string | null;
}

export interface QiniuImageListResult {
  items: QiniuImageItem[];
  marker: string | null;
  hasMore: boolean;
  prefix: string;
  limit: number;
}

export interface QiniuUploadTokenResult {
  uploadToken: string;
  key: string;
  uploadHost: string;
  publicUrl: string;
  expiresIn: number;
}

export interface SiteFooterLink {
  label: string;
  url: string;
  openInNewTab: boolean;
}

export interface SiteNavigationChild extends SiteFooterLink {}

export interface SiteNavigationItem {
  label: string;
  url: string;
  openInNewTab: boolean;
  children: SiteNavigationChild[];
}

export interface SiteSettingsOverview {
  configured: boolean;
  source: 'database' | 'none';
  values: {
    siteName: string;
    logoUrl: string;
    faviconUrl: string;
    brandPrimaryColor: string;
    headerNavigation: SiteNavigationItem[];
    footerCopyright: string;
    filingInfo: string;
    footerLinks: SiteFooterLink[];
  };
}

export type PublicSiteSettings = SiteSettingsOverview['values'] & {
  publicPages?: PublicPagesSettings;
};

export interface HubPageContent {
  eyebrow: string;
  title: string;
  description: string;
}

export interface PublicPagesSettings {
  contentHub: HubPageContent;
  docsHub: HubPageContent;
}

export interface PublicPagesSettingsOverview {
  configured: boolean;
  source: 'database' | 'none';
  values: PublicPagesSettings;
}

export interface AiProviderStatus {
  code: string;
  label: string;
  configured: boolean;
  source: 'database' | 'env' | 'none';
}

export interface AiProviderListResponse {
  items: AiProviderStatus[];
}

export interface OpenRouterSettingsOverview {
  configured: boolean;
  source: 'database' | 'env' | 'none';
  values: {
    baseUrl: string;
    siteUrl: string;
    siteName: string;
    defaultModel: string;
  };
  secrets: {
    apiKey: PaymentProviderSecretStatus;
  };
}

export interface OpenRouterTestConnectionResult {
  ok: boolean;
  provider: string;
  modelCount: number;
  defaultModel: string;
  sampleModels: string[];
}

export interface ContentImportSettingsOverview {
  configured: boolean;
  source: 'database' | 'none';
  values: {
    wordpress: {
      siteUrl: string;
      username: string;
    };
    notion: Record<string, never>;
  };
  secrets: {
    wordpress: {
      appPassword: PaymentProviderSecretStatus;
    };
    notion: {
      apiToken: PaymentProviderSecretStatus;
    };
  };
}

export interface ContentImportWordPressTestResult {
  ok: boolean;
  provider: 'wordpress';
  siteUrl: string;
  mode: 'authenticated' | 'public';
  account: string | null;
}

export interface ContentImportNotionTestResult {
  ok: boolean;
  provider: 'notion';
  workspace: string | null;
  userName: string | null;
}

export interface AiModelSummary {
  id: string;
  name: string;
  description: string | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  promptPricing: string | null;
  completionPricing: string | null;
  modality: string | null;
  inputModalities: string[];
  outputModalities: string[];
}

export interface AiProviderModelsResponse {
  provider: string;
  items: AiModelSummary[];
}

export interface AiChatCompletionResult {
  provider: string;
  model: string;
  content: string;
  finishReason: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  meta: {
    id: string | null;
    created: number | null;
  };
}

export interface DeliverySettingsOverview {
  appCode: string;
  configured: boolean;
  values: Record<string, string | boolean>;
  secrets: Record<string, PaymentProviderSecretStatus>;
}

// ─── Apps ───────────────────────────────────────────────────────────────────

export interface AppScreenshot {
  url: string;
  caption?: string;
}

export interface AppHighlight {
  icon?: string;
  title: string;
  description: string;
}

export interface AppFaq {
  question: string;
  answer: string;
}

export interface AppLink {
  label: string;
  url: string;
  type: 'docs' | 'support' | 'website' | 'download' | 'other';
}

export interface AppSecret {
  id: string;
  hint: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface App {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  description: string | null;
  content: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  screenshots: AppScreenshot[];
  highlights: AppHighlight[];
  faq: AppFaq[];
  links: AppLink[];
  category: string | null;
  sortOrder: number;
  type: string;
  status: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AppWithDetails extends App {
  plans: PlanSummary[];
  features: FeatureSummary[];
  checkoutOffers: Array<{
    code: string;
    planCode: string;
    planId: string;
    appId: string;
    appCode: string;
    appName: string;
    title: string;
    description: string | null;
    badge: string | null;
    interval: string;
    priceAmount: number;
    currency: string;
    status: string;
    isDefault: boolean;
    sortOrder: number;
  }>;
  secrets: AppSecret[];
}

export interface AppCatalog {
  app: AppWithDetails;
  plans: PlanSummary[];
  offers: Array<{
    code: string;
    planCode: string;
    planId: string;
    appId: string;
    appCode: string;
    appName: string;
    title: string;
    description: string | null;
    badge: string | null;
    interval: string;
    priceAmount: number;
    currency: string;
    status: string;
    isDefault: boolean;
    sortOrder: number;
  }>;
  features: FeatureSummary[];
  planFeatures: PlanFeatureSummary[];
}

export interface AppSecretCreated {
  appCode: string;
  appName: string;
  secretId: string;
  secret: string;
  hint: string;
  expiresAt: string | null;
}

export interface ContentItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  authorName: string | null;
  sourceType: 'manual' | 'wordpress' | 'notion' | 'wechat';
  sourceId: string | null;
  sourceUrl: string | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  importedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentListResponse extends PaginatedResponse<ContentItem> {}

export interface DocSpace {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  type: 'product' | 'app' | 'internal';
  appId: string | null;
  sortOrder: number;
  status: 'active' | 'hidden' | 'archived';
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocPage {
  id: string;
  spaceId: string;
  parentId: string | null;
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  content: string;
  sortOrder: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocPageTreeNode {
  id: string;
  parentId: string | null;
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
  children: DocPageTreeNode[];
}

export interface AdminDocSpaceListResponse {
  items: Array<DocSpace & { pageCount: number }>;
}

export interface AdminDocSpaceDetail {
  space: DocSpace;
  pages: DocPage[];
  tree: DocPageTreeNode[];
}

export interface PublicDocSpaceListResponse {
  items: Array<DocSpace & { pageCount: number }>;
}

export interface PublicDocSpaceDetail {
  space: DocSpace;
  tree: DocPageTreeNode[];
  defaultPath: string | null;
}

export interface PublicDocPageDetail {
  space: DocSpace;
  tree: DocPageTreeNode[];
  page: DocPage;
  previousPage: DocPageTreeNode | null;
  nextPage: DocPageTreeNode | null;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface CheckoutSessionSummary {
  id: string;
  sessionCode: string;
  status: string;
  provider: string | null;
  actionType: string | null;
  actionPayload: unknown;
  successUrl: string | null;
  cancelUrl: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNo: string;
  status: string;
  provider: string | null;
  providerOrderId: string | null;
  amount: number;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  appId: string;
  planId: string;
}

export interface HydratedOrder extends Order {
  user: UserSummary | null;
  app: AppSummary | null;
  plan: PlanSummary | null;
  checkoutSession: CheckoutSessionSummary | null;
}

export interface PaymentAttempt {
  id: string;
  attemptNo: string;
  status: string;
  actionType: string | null;
  providerReference: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  createdAt: string;
}

export interface EntitlementSummary {
  id: string;
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  plan: PlanSummary | null;
}

export interface OrderEventSummary {
  eventName: string;
  eventTime: string;
  properties: unknown;
}

export interface OrderDetail {
  item: HydratedOrder;
  paymentAttempts: PaymentAttempt[];
  entitlements: EntitlementSummary[];
  events: OrderEventSummary[];
}

export interface OrdersResponse extends PaginatedResponse<HydratedOrder> {}

export interface OrderAdminActionResult {
  changed: boolean;
  order: Order;
  action: {
    status: 'cancelled' | 'paid' | 'refunding' | 'refunded';
    reason: string;
    refundId?: string | null;
  };
}

export interface CheckoutSessionCreated {
  sessionId: string;
  sessionCode: string;
  status: string;
  app: AppSummary;
  product: {
    code: string;
    name: string;
  };
  plan: {
    code: string;
    name: string;
    interval: string | null;
    priceAmount: number;
    currency: string;
  };
  order: {
    id: string;
    orderNo: string;
    amount: number;
    currency: string;
    status: string;
  };
  presentation: {
    type: 'hosted_page';
    url: string;
  };
  expiresAt: string | null;
  createdAt: string;
}

export interface CheckoutSessionPublic {
  sessionId: string;
  sessionCode: string;
  status: string;
  app: AppSummary;
  product: {
    code: string;
    name: string;
  };
  plan: {
    code: string;
    name: string;
    interval: string | null;
  };
  order: {
    orderNo: string;
    subject: string;
    amount: number;
    amountYuan: string;
    currency: string;
  };
  paymentAction:
    | {
        type: 'qr_code';
        qrCodeText: string;
        codeUrl: string;
        qrCodeDataUrl: string;
      }
    | {
        type: 'redirect_url';
        url: string;
      }
    | null;
  successUrl: string | null;
  cancelUrl: string | null;
  expiresAt: string | null;
  completedAt: string | null;
}

export interface CheckoutSessionStatus {
  sessionCode: string;
  status: string;
  orderNo: string;
  paidAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface ReconcileResponse {
  sessionCode?: string;
  status?: string;
  orderNo?: string;
  paidAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  changed?: boolean;
  reconciliation: {
    status: string;
    reason: string;
  };
}

// ─── Installs ────────────────────────────────────────────────────────────────

export interface Install {
  id: string;
  extensionInstallId: string;
  chromeProfileHint: string | null;
  appVersion: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HydratedInstall extends Install {
  user: UserSummary | null;
  app: AppSummary | null;
}

export interface InstallsResponse extends PaginatedResponse<HydratedInstall> {}

// ─── Entitlements ─────────────────────────────────────────────────────────────

export interface Entitlement {
  id: string;
  status: string;
  sourceType: string;
  sourceId: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  meta?: Record<string, unknown>;
  userId: string;
  appId: string;
  planId: string;
}

export interface HydratedEntitlement extends Entitlement {
  user: UserSummary | null;
  app: AppSummary | null;
  plan: PlanSummary | null;
  sourceOrder: { id: string; orderNo: string; status: string } | null;
}

export interface EntitlementsResponse extends PaginatedResponse<HydratedEntitlement> {
  summary?: Array<{
    appCode: string;
    featureCodes: string[];
  }>;
}

export interface NotificationItem {
  id: string;
  userId: string;
  category: 'account' | 'billing' | 'license' | 'deployment' | 'ticket' | 'system' | 'announcement';
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  status: 'unread' | 'read' | 'archived';
  sourceEventId: string | null;
  sourceEventName: string | null;
  dedupeKey: string | null;
  meta: Record<string, unknown>;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsResponse extends PaginatedResponse<NotificationItem> {}

export interface NotificationUnreadCount {
  unreadCount: number;
}

export interface AdminNotificationItem extends NotificationItem {
  user: (UserSummary & { status: string | null }) | null;
}

export interface AdminNotificationsResponse extends PaginatedResponse<AdminNotificationItem> {}

export interface PublishAnnouncementResult {
  broadcastId: string;
  recipientCount: number;
  title: string;
  level: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNo: string;
  userId: string;
  appId: string | null;
  orderId: string | null;
  installId: string | null;
  deploymentId: string | null;
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
  status: 'waiting_staff' | 'waiting_user' | 'resolved' | 'closed';
  subject: string;
  assignedAdminUserId: string | null;
  lastReplyAuthorType: 'user' | 'admin' | 'system';
  lastActivityAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketRelatedOrder {
  id: string;
  orderNo: string;
  status: string;
  subject: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface SupportTicketRelatedInstall {
  id: string;
  extensionInstallId: string;
  status: string;
  appVersion: string | null;
  lastSeenAt: string | null;
}

export interface SupportTicketRelatedDeployment {
  id: string;
  label: string;
  environment: string;
  status: string;
  domainValues: Record<string, string>;
}

export interface HydratedSupportTicket extends SupportTicket {
  user: UserSummary | null;
  app: AppSummary | null;
  order: SupportTicketRelatedOrder | null;
  install: SupportTicketRelatedInstall | null;
  deployment: SupportTicketRelatedDeployment | null;
  assignee: UserSummary | null;
  messageCount: number;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorType: 'user' | 'admin' | 'system';
  isInternal: boolean;
  body: string;
  meta: Record<string, unknown>;
  createdAt: string;
  author: UserSummary | null;
}

export interface SupportTicketDetail {
  ticket: HydratedSupportTicket;
  messages: SupportTicketMessage[];
}

export interface SupportTicketsResponse extends PaginatedResponse<HydratedSupportTicket> {}

export interface GrantEntitlementInput {
  userEmail: string;
  planCode: string;
  reason?: string;
}

export interface GrantEntitlementResult {
  user: UserSummary;
  plan: PlanSummary;
  app: AppSummary;
  granted: boolean;
  reason: string;
  sourceId: string;
}

export interface RevokeEntitlementResult {
  entitlementId: string;
  sourceType: string;
  sourceId: string | null;
  revokedCount: number;
  userId: string;
  appId: string;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface Event {
  id: string;
  eventName: string;
  eventTime: string;
  properties: unknown;
  createdAt: string;
  userId: string | null;
  installId: string | null;
  appId: string | null;
}

export interface HydratedEvent extends Event {
  user: UserSummary | null;
  install: { id: string; extensionInstallId: string; status: string } | null;
  app: AppSummary | null;
}

export interface EventsResponse extends PaginatedResponse<HydratedEvent> {}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export interface BillingWebhookEvent {
  id: string;
  provider: string;
  type: string;
  providerEventId: string;
  status: string;
  payload: unknown;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhooksResponse extends PaginatedResponse<BillingWebhookEvent> {}

// ─── Job Runs / Audit Logs ───────────────────────────────────────────────────

export interface JobRun {
  id: string;
  queue: string;
  kind: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'dead';
  priority: number;
  payload: unknown;
  result: unknown;
  error: unknown;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string | null;
  availableAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdByUserId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  traceId: string | null;
  meta: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunsResponse extends PaginatedResponse<JobRun> {}

export interface AuditLog {
  id: string;
  actorType: 'user' | 'system' | 'job';
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: 'succeeded' | 'failed';
  summary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  meta: unknown;
  createdAt: string;
}

export interface AuditLogsResponse extends PaginatedResponse<AuditLog> {}

export interface ObservabilityAlert {
  id: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  count: number;
  href: string;
}

export interface ObservabilitySummary {
  metrics: {
    deadJobs: number;
    failedJobs: number;
    runningJobs: number;
    pendingJobs: number;
    pendingOrders: number;
    stalePendingOrders: number;
    unprocessedWebhooks: number;
    waitingStaffTickets: number;
    events24h: number;
  };
  alerts: ObservabilityAlert[];
}

// ─── Plans (for license grants) ───────────────────────────────────────────────

export interface Plan {
  id: string;
  code: string;
  name: string;
  interval: string | null;
  appId: string;
}

export interface PlansResponse {
  items: Plan[];
}

// ─── Deployments ──────────────────────────────────────────────────────────────

export interface DeploymentTokenSummary {
  id: string;
  tokenHint: string;
  status: string;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

export interface DeploymentSummary {
  id: string;
  label: string;
  environment: string;
  serverHost: string | null;
  installPath: string;
  status: string;
  lastTokenIssuedAt: string | null;
  lastDeployedAt: string | null;
  updatePolicy: 'manual' | 'auto';
  currentRuntimeImages: {
    frontendImage: string | null;
    websocketImage: string | null;
  };
  availableRuntimeImages: {
    frontendImage: string | null;
    websocketImage: string | null;
    offeredAt: string | null;
    appliedAt: string | null;
  };
  currentWordpressAssetReleases: Record<string, string | null>;
  availableWordpressAssetReleases: Record<string, string | null>;
  pendingAction: {
    id: string;
    kind:
      | 'apply_runtime_images'
      | 'apply_wordpress_assets'
      | 'ignore_runtime_images'
      | 'ignore_wordpress_assets';
    requestedAt: string | null;
  } | null;
  lastAction: {
    id: string;
    kind:
      | 'apply_runtime_images'
      | 'apply_wordpress_assets'
      | 'ignore_runtime_images'
      | 'ignore_wordpress_assets';
    status: 'completed' | 'failed';
    message: string | null;
    finishedAt: string | null;
  } | null;
  deliveryValues: Record<string, string | boolean>;
  domainValues: Record<string, string>;
  configuredSecretKeys: string[];
  domainBinding: {
    sourceField: string;
    sourceLabel: string | null;
    scope: 'registrable_domain' | 'exact_host';
    isLocked: boolean;
    boundDomain: string | null;
    boundAt: string | null;
  };
  entitlement: {
    id: string;
    status: string;
    startsAt: string | null;
    expiresAt: string | null;
    plan: {
      id: string;
      code: string;
      name: string;
      interval: string | null;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  user: UserSummary | null;
  app: AppSummary | null;
  latestToken: DeploymentTokenSummary | null;
}

export interface DeploymentsResponse {
  items: DeploymentSummary[];
}

export interface IssueDeploymentTokenResult {
  deploymentId: string;
  tokenId: string;
  tokenHint: string;
  token: string;
  exchangeUrl: string;
  exchangeCurl: string;
  remoteInstallCommand: string | null;
  expiresAt: string;
}
