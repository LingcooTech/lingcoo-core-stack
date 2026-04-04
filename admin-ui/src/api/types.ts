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
  tagline?: string | null;
  description?: string | null;
  content?: string | null;
  iconUrl?: string | null;
  coverUrl?: string | null;
  category?: string | null;
  deliveryMode?: 'direct_access' | 'one_click_deploy';
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PriceSummary {
  id: string;
  code: string;
  name: string;
  billingType: 'one_time' | 'recurring';
  billingInterval: 'month' | 'year' | null;
  interval: 'month' | 'year' | 'one_time' | null;
  amount: number;
  priceAmount: number;
  currency: string;
  status: string;
  productId: string;
  productCode?: string;
  productName?: string;
  authorizationTemplateId: string;
  authorizationTemplateCode?: string;
  authorizationTemplateName?: string;
  grantStrategy?: 'lifetime' | 'fixed_duration' | 'subscription_period';
  grantDurationDays?: number | null;
}

export interface AppSummary {
  id: string;
  code: string;
  name: string;
  type: string;
  meta?: Record<string, unknown>;
}

export interface AuthorizationTemplateSummary {
  id: string;
  code: string;
  name: string;
  kind: string;
  productId?: string;
  productCode?: string;
  productName?: string;
  description?: string | null;
  status?: string;
  createdAt?: string;
}

export interface PriceAuthorizationSummary {
  priceId: string;
  authorizationTemplateId: string;
  value: string | null;
}

export interface CheckoutOfferSummary {
  code: string;
  priceCode: string;
  priceId: string;
  productId: string;
  productCode: string;
  productName: string;
  authorizationTemplateId: string;
  authorizationTemplateCode: string;
  authorizationTemplateName: string;
  title: string;
  description: string | null;
  badge: string | null;
  billingType: 'one_time' | 'recurring';
  billingInterval: 'month' | 'year' | null;
  interval: 'month' | 'year' | 'one_time';
  amount: number;
  priceAmount: number;
  currency: string;
  status: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface CatalogSnapshot {
  products: ProductSummary[];
  prices: PriceSummary[];
  authorizationTemplates: AuthorizationTemplateSummary[];
  priceAuthorizations: PriceAuthorizationSummary[];
  checkoutOffers: CheckoutOfferSummary[];
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
  user: { id: string; email: string; displayName: string | null; role: string; emailVerified: boolean };
}

export interface ResendVerificationResponse {
  sent: boolean;
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

// ─── Payment Settings ───────────────────────────────────────────────────────

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

export interface DeliverySettingsOverview {
  appCode: string;
  configured: boolean;
  manifest: DeliveryManifest;
  values: Record<string, string | boolean | null>;
  secrets: Record<string, PaymentProviderSecretStatus>;
}

export interface DeliveryFieldGroup {
  key: string;
  label: string;
  description?: string;
}

export interface DeliveryFieldDefinition {
  key: string;
  label: string;
  description?: string;
  group?: string;
  type: 'text' | 'url' | 'email' | 'boolean' | 'secret';
  scope: 'system' | 'preset' | 'user_input';
  required: boolean;
  editable?: boolean;
  advanced?: boolean;
  placeholder?: string;
  defaultValue?: string | boolean | null;
}

export interface DeliveryDomainSlot {
  key: string;
  label: string;
  envKey: string;
  sourceField?: 'primaryDomain' | 'adminDomain' | 'wsDomain';
  required: boolean;
  description?: string;
  placeholder?: string;
}

export interface DeliveryManifest {
  version: '1';
  installer: {
    repoUrl: string;
    repoBranch: string;
    remoteInstallScriptUrl: string;
    installPath: string;
  };
  groups: DeliveryFieldGroup[];
  domainSlots: DeliveryDomainSlot[];
  envFields: DeliveryFieldDefinition[];
  secretFields: DeliveryFieldDefinition[];
  notes?: string[];
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
  status?: string;
  lastUsedAt?: string | null;
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
  products: ProductSummary[];
  prices: PriceSummary[];
  authorizationTemplates: AuthorizationTemplateSummary[];
  checkoutOffers: CheckoutOfferSummary[];
  secrets: AppSecret[];
}

export interface AppCatalog {
  app: AppWithDetails;
  products: ProductSummary[];
  prices: PriceSummary[];
  authorizationTemplates: AuthorizationTemplateSummary[];
  priceAuthorizations: PriceAuthorizationSummary[];
  offers: CheckoutOfferSummary[];
}

export interface AppSecretCreated {
  appCode: string;
  appName: string;
  secretId: string;
  secret: string;
  hint: string;
  expiresAt: string | null;
}

// ─── Orders ─────────────────────────────────────────────────────────────────

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
  priceId: string;
}

export interface HydratedOrder extends Order {
  user: UserSummary | null;
  product: ProductSummary | null;
  price: PriceSummary | null;
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

export interface OrderEventSummary {
  eventName: string;
  eventTime: string;
  properties: unknown;
}

export interface OrderDetail {
  item: HydratedOrder;
  paymentAttempts: PaymentAttempt[];
  authorizationGrants: HydratedAuthorizationGrant[];
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
  price: {
    code: string;
    name: string;
    billingType: 'one_time' | 'recurring';
    billingInterval: 'month' | 'year' | null;
    amount: number;
    currency: string;
  };
  authorizationTemplate: {
    code: string;
    name: string;
  };
  offer: {
    code: string;
    title: string;
    amount: number;
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

// ─── Installs ───────────────────────────────────────────────────────────────

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

// ─── Authorizations ────────────────────────────────────────────────────────

export interface AuthorizationGrant {
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
  priceId?: string | null;
}

export interface HydratedAuthorizationGrant extends AuthorizationGrant {
  user: UserSummary | null;
  product: ProductSummary | null;
  price: PriceSummary | null;
  authorizationTemplate: AuthorizationTemplateSummary | null;
  sourceOrder: { id: string; orderNo: string; status: string } | null;
}

export interface AuthorizationGrantsResponse {
  items: HydratedAuthorizationGrant[];
  summary?: Array<{
    productCode: string;
    authorizationTemplateCodes: string[];
  }>;
}

export interface GrantAuthorizationInput {
  userEmail: string;
  authorizationTemplateCode: string;
  expiresAt?: string;
  reason?: string;
}

export interface GrantAuthorizationResult {
  user: UserSummary;
  authorizationTemplate: AuthorizationTemplateSummary;
  product: ProductSummary;
  grantCount: number;
  sourceId: string | null;
  expiresAt: string | null;
}

export interface RevokeAuthorizationResult {
  grantId: string;
  sourceType: string;
  sourceId: string | null;
  revokedCount: number;
  userId: string;
  productId: string;
}

// ─── Events ────────────────────────────────────────────────────────────────

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

// ─── Webhooks ──────────────────────────────────────────────────────────────

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

// ─── Deployments ───────────────────────────────────────────────────────────

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
  endpoints?: Record<string, string>;
  meta?: Record<string, unknown>;
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
