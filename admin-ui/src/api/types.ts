// ─── Common ────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  email: string;
  displayName: string | null;
}

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  type?: string;
  status?: string;
}

export interface PlanSummary {
  id: string;
  code: string;
  name: string;
  interval: string | null;
  priceAmount?: number;
  currency?: string;
  status?: string;
  productId?: string;
  productCode?: string;
  productName?: string;
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
  };
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

// ─── Apps ───────────────────────────────────────────────────────────────────

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
  description: string | null;
  type: string;
  status: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AppWithDetails extends App {
  products: ProductSummary[];
  plans: PlanSummary[];
  checkoutOffers: Array<{
    code: string;
    planCode: string;
    planId: string;
    productId: string;
    productCode: string;
    productName: string;
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
  products: ProductSummary[];
  plans: PlanSummary[];
  offers: Array<{
    code: string;
    planCode: string;
    planId: string;
    productId: string;
    productCode: string;
    productName: string;
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
  planFeatures: Array<{
    planId: string;
    featureId: string;
    value: string | null;
  }>;
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
  productId: string;
  planId: string;
}

export interface HydratedOrder extends Order {
  user: UserSummary | null;
  product: ProductSummary | null;
  plan: PlanSummary | null;
  checkoutSession: CheckoutSessionSummary | null;
  app: AppSummary | null;
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
  feature: FeatureSummary | null;
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

export interface OrdersResponse {
  items: HydratedOrder[];
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
  product: ProductSummary | null;
}

export interface InstallsResponse {
  items: HydratedInstall[];
}

// ─── Entitlements ─────────────────────────────────────────────────────────────

export interface Entitlement {
  id: string;
  status: string;
  sourceType: string;
  sourceId: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  productId: string;
}

export interface HydratedEntitlement extends Entitlement {
  user: UserSummary | null;
  product: ProductSummary | null;
  feature: FeatureSummary | null;
  sourceOrder: { id: string; orderNo: string; status: string } | null;
}

export interface EntitlementsResponse {
  items: HydratedEntitlement[];
  summary?: Array<{
    productCode: string;
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
  product: ProductSummary;
  granted: boolean;
  reason: string;
  sourceId: string;
  entitlementCount: number;
}

export interface RevokeEntitlementResult {
  entitlementId: string;
  sourceType: string;
  sourceId: string | null;
  revokedCount: number;
  userId: string;
  productId: string;
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
  productId: string | null;
}

export interface HydratedEvent extends Event {
  user: UserSummary | null;
  install: { id: string; extensionInstallId: string; status: string } | null;
  app: AppSummary | null;
  product: ProductSummary | null;
}

export interface EventsResponse {
  items: HydratedEvent[];
}

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

export interface WebhooksResponse {
  items: BillingWebhookEvent[];
}

// ─── Plans (for license grants) ───────────────────────────────────────────────

export interface Plan {
  id: string;
  code: string;
  name: string;
  interval: string | null;
  productId: string;
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
  product: ProductSummary | null;
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
