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

export interface VerifyEmailResponse {
  verified: boolean;
  user: { id: string; email: string; displayName: string | null; role: string; emailVerified: boolean };
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
  role?: 'user' | 'admin';
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

export interface DeliverySettingsOverview {
  appCode: string;
  configured: boolean;
  values: {
    repoUrl: string;
    repoBranch: string;
    frontendImage: string;
    websocketImage: string;
    letsencryptEmail: string;
    acrUsername: string;
    wordpressFetchReleaseAssets: boolean;
    wordpressRunInit: boolean;
    wordpressReleaseOwner: string;
    fdThemeReleaseTag: string;
    fdAdminUiReleaseTag: string;
    fdMemberReleaseTag: string;
    fdPaymentReleaseTag: string;
    fdCommerceReleaseTag: string;
    fdContentTypesReleaseTag: string;
    fdWebsocketPushReleaseTag: string;
    wpgraphqlJwtAuthReleaseTag: string;
    wpgraphqlTaxQueryRef: string;
  };
  secrets: {
    acrPassword: PaymentProviderSecretStatus;
    githubToken: PaymentProviderSecretStatus;
  };
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

export interface ReconcileResponse {
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
  primaryDomain: string | null;
  adminDomain: string | null;
  wsDomain: string | null;
  installPath: string;
  status: string;
  lastTokenIssuedAt: string | null;
  lastDeployedAt: string | null;
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
