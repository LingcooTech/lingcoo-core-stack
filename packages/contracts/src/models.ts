import { z } from 'zod';
import { authResponseSchema, userSchema } from './core-responses.js';
const paginationSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };
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
export const UserSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.union([z.string(), z.null()]),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;
export const PlanSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  interval: z.union([z.string(), z.null()]),
  priceAmount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  appId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export const AppSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: z.string(),
});
export type AppSummary = z.infer<typeof AppSummarySchema>;
export const FeatureSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  appId: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});
export type FeatureSummary = z.infer<typeof FeatureSummarySchema>;
export const PlanFeatureSummarySchema = z.object({
  planId: z.string(),
  featureId: z.string(),
  value: z.json(),
});
export type PlanFeatureSummary = z.infer<typeof PlanFeatureSummarySchema>;
export const CatalogSnapshotSchema = z.object({
  plans: z.array(PlanSummarySchema),
  features: z.array(FeatureSummarySchema),
  planFeatures: z.array(PlanFeatureSummarySchema),
});
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
export const BootstrapStatusSchema = z.object({ hasAdmin: z.boolean() });
export type BootstrapStatus = z.infer<typeof BootstrapStatusSchema>;
export const AuthResponseSchema = authResponseSchema;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export const CurrentUserProfileSchema = userSchema;
export type CurrentUserProfile = z.infer<typeof CurrentUserProfileSchema>;
export const VerifyEmailResponseSchema = z.object({
  verified: z.boolean(),
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.union([z.string(), z.null()]),
    role: z.string(),
    emailVerified: z.boolean(),
  }),
});
export type VerifyEmailResponse = z.infer<typeof VerifyEmailResponseSchema>;
export const ResendVerificationResponseSchema = z.object({
  sent: z.boolean(),
  alreadyVerified: z.boolean().optional(),
});
export type ResendVerificationResponse = z.infer<typeof ResendVerificationResponseSchema>;
export const ForgotPasswordResponseSchema = z.object({ sent: z.boolean() });
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;
export const ResetPasswordResponseSchema = z.object({ reset: z.boolean() });
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
export const UpdateCurrentUserResponseSchema = z.object({ user: CurrentUserProfileSchema });
export type UpdateCurrentUserResponse = z.infer<typeof UpdateCurrentUserResponseSchema>;
export const ChangePasswordResponseSchema = z.object({ changed: z.boolean() });
export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;
export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.union([z.string(), z.null()]),
  role: z.string(),
  status: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;
export const AdminUsersResponseSchema = z.object({
  items: z.array(AdminUserSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;
export const AdminUpdateUserInputSchema = z.object({
  displayName: z.string().optional(),
  role: z
    .union([
      z.literal('user'),
      z.literal('support'),
      z.literal('finance'),
      z.literal('editor'),
      z.literal('operator'),
      z.literal('admin'),
    ])
    .optional(),
  status: z.union([z.literal('active'), z.literal('suspended')]).optional(),
});
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserInputSchema>;
export const AdminResetPasswordResultSchema = z.object({
  userId: z.string(),
  email: z.string(),
  temporaryPassword: z.string(),
});
export type AdminResetPasswordResult = z.infer<typeof AdminResetPasswordResultSchema>;
export const PaymentProviderSecretStatusSchema = z.object({ configured: z.boolean() });
export type PaymentProviderSecretStatus = z.infer<typeof PaymentProviderSecretStatusSchema>;
export const PaymentProviderConfigSchema = z.object({
  code: z.string(),
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
  values: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])),
  secrets: z.record(z.string(), PaymentProviderSecretStatusSchema),
});
export type PaymentProviderConfig = z.infer<typeof PaymentProviderConfigSchema>;
export const PaymentSettingsOverviewSchema = z.object({
  items: z.array(PaymentProviderConfigSchema),
});
export type PaymentSettingsOverview = z.infer<typeof PaymentSettingsOverviewSchema>;
export const SmtpSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
  values: z.object({
    host: z.string(),
    port: z.number(),
    secure: z.boolean(),
    user: z.string(),
    from: z.string(),
  }),
  secrets: z.object({ password: PaymentProviderSecretStatusSchema }),
});
export type SmtpSettingsOverview = z.infer<typeof SmtpSettingsOverviewSchema>;
export const SmtpTestEmailResultSchema = z.object({
  sent: z.boolean(),
  to: z.string(),
  from: z.string(),
  subject: z.string(),
});
export type SmtpTestEmailResult = z.infer<typeof SmtpTestEmailResultSchema>;
export const AlertingSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
  values: z.object({
    enabled: z.boolean(),
    minimumLevel: z.union([z.literal('info'), z.literal('warning'), z.literal('error')]),
    cooldownMinutes: z.number(),
    email: z.object({ enabled: z.boolean(), recipients: z.array(z.string()) }),
    webhook: z.object({ enabled: z.boolean(), url: z.string() }),
  }),
  secrets: z.object({ webhookSecret: PaymentProviderSecretStatusSchema }),
});
export type AlertingSettingsOverview = z.infer<typeof AlertingSettingsOverviewSchema>;
export const QiniuSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
  values: z.object({
    accessKey: z.string(),
    bucketName: z.string(),
    publicBaseUrl: z.string(),
    uploadHost: z.string(),
    defaultPrefix: z.string(),
  }),
  secrets: z.object({ secretKey: PaymentProviderSecretStatusSchema }),
});
export type QiniuSettingsOverview = z.infer<typeof QiniuSettingsOverviewSchema>;
export const QiniuTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  bucketName: z.string(),
  publicBaseUrl: z.string(),
  sampleCount: z.number(),
});
export type QiniuTestConnectionResult = z.infer<typeof QiniuTestConnectionResultSchema>;
export const QiniuImageItemSchema = z.object({
  key: z.string(),
  url: z.string(),
  size: z.number(),
  mimeType: z.string(),
  uploadedAt: z.union([z.string(), z.null()]),
});
export type QiniuImageItem = z.infer<typeof QiniuImageItemSchema>;
export const QiniuImageListResultSchema = z.object({
  items: z.array(QiniuImageItemSchema),
  marker: z.union([z.string(), z.null()]),
  hasMore: z.boolean(),
  prefix: z.string(),
  limit: z.number(),
});
export type QiniuImageListResult = z.infer<typeof QiniuImageListResultSchema>;
export const QiniuUploadTokenResultSchema = z.object({
  uploadToken: z.string(),
  key: z.string(),
  uploadHost: z.string(),
  publicUrl: z.string(),
  expiresIn: z.number(),
});
export type QiniuUploadTokenResult = z.infer<typeof QiniuUploadTokenResultSchema>;
export const SiteFooterLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  openInNewTab: z.boolean(),
});
export type SiteFooterLink = z.infer<typeof SiteFooterLinkSchema>;
export const SiteNavigationChildSchema = SiteFooterLinkSchema;
export type SiteNavigationChild = z.infer<typeof SiteNavigationChildSchema>;
export const SiteNavigationItemSchema = z.object({
  label: z.string(),
  url: z.string(),
  openInNewTab: z.boolean(),
  children: z.array(SiteNavigationChildSchema),
});
export type SiteNavigationItem = z.infer<typeof SiteNavigationItemSchema>;
export const SiteSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('none')]),
  values: z.object({
    siteName: z.string(),
    logoUrl: z.string(),
    faviconUrl: z.string(),
    brandPrimaryColor: z.string(),
    headerNavigation: z.array(SiteNavigationItemSchema),
    footerCopyright: z.string(),
    filingInfo: z.string(),
    footerLinks: z.array(SiteFooterLinkSchema),
  }),
});
export type SiteSettingsOverview = z.infer<typeof SiteSettingsOverviewSchema>;
export const HubPageContentSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  description: z.string(),
});
export type HubPageContent = z.infer<typeof HubPageContentSchema>;
export const PublicPagesSettingsSchema = z.object({
  contentHub: HubPageContentSchema,
  docsHub: HubPageContentSchema,
});
export type PublicPagesSettings = z.infer<typeof PublicPagesSettingsSchema>;
export const PublicSiteSettingsSchema = z.intersection(
  SiteSettingsOverviewSchema.shape['values'],
  z.object({ publicPages: PublicPagesSettingsSchema.optional() }),
);
export type PublicSiteSettings = z.infer<typeof PublicSiteSettingsSchema>;
export const PublicPagesSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('none')]),
  values: PublicPagesSettingsSchema,
});
export type PublicPagesSettingsOverview = z.infer<typeof PublicPagesSettingsOverviewSchema>;
export const AiProviderStatusSchema = z.object({
  code: z.string(),
  label: z.string(),
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
});
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;
export const AiProviderListResponseSchema = z.object({ items: z.array(AiProviderStatusSchema) });
export type AiProviderListResponse = z.infer<typeof AiProviderListResponseSchema>;
export const OpenRouterSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
  values: z.object({
    baseUrl: z.string(),
    siteUrl: z.string(),
    siteName: z.string(),
    defaultModel: z.string(),
  }),
  secrets: z.object({ apiKey: PaymentProviderSecretStatusSchema }),
});
export type OpenRouterSettingsOverview = z.infer<typeof OpenRouterSettingsOverviewSchema>;
export const OpenRouterTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  provider: z.string(),
  modelCount: z.number(),
  defaultModel: z.string(),
  sampleModels: z.array(z.string()),
});
export type OpenRouterTestConnectionResult = z.infer<typeof OpenRouterTestConnectionResultSchema>;
export const ContentImportSettingsOverviewSchema = z.object({
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('none')]),
  values: z.object({
    wordpress: z.object({ siteUrl: z.string(), username: z.string() }),
    notion: z.record(z.string(), z.never()),
  }),
  secrets: z.object({
    wordpress: z.object({ appPassword: PaymentProviderSecretStatusSchema }),
    notion: z.object({ apiToken: PaymentProviderSecretStatusSchema }),
  }),
});
export type ContentImportSettingsOverview = z.infer<typeof ContentImportSettingsOverviewSchema>;
export const ContentImportWordPressTestResultSchema = z.object({
  ok: z.boolean(),
  provider: z.literal('wordpress'),
  siteUrl: z.string(),
  mode: z.union([z.literal('authenticated'), z.literal('public')]),
  account: z.union([z.string(), z.null()]),
});
export type ContentImportWordPressTestResult = z.infer<
  typeof ContentImportWordPressTestResultSchema
>;
export const ContentImportNotionTestResultSchema = z.object({
  ok: z.boolean(),
  provider: z.literal('notion'),
  workspace: z.union([z.string(), z.null()]),
  userName: z.union([z.string(), z.null()]),
});
export type ContentImportNotionTestResult = z.infer<typeof ContentImportNotionTestResultSchema>;
export const AiModelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.union([z.string(), z.null()]),
  contextLength: z.union([z.number(), z.null()]),
  maxCompletionTokens: z.union([z.number(), z.null()]),
  promptPricing: z.union([z.string(), z.null()]),
  completionPricing: z.union([z.string(), z.null()]),
  modality: z.union([z.string(), z.null()]),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
});
export type AiModelSummary = z.infer<typeof AiModelSummarySchema>;
export const AiProviderModelsResponseSchema = z.object({
  provider: z.string(),
  items: z.array(AiModelSummarySchema),
});
export type AiProviderModelsResponse = z.infer<typeof AiProviderModelsResponseSchema>;
export const AiChatCompletionResultSchema = z.object({
  provider: z.string(),
  model: z.string(),
  content: z.string(),
  finishReason: z.union([z.string(), z.null()]),
  usage: z.object({
    promptTokens: z.union([z.number(), z.null()]),
    completionTokens: z.union([z.number(), z.null()]),
    totalTokens: z.union([z.number(), z.null()]),
  }),
  meta: z.object({ id: z.union([z.string(), z.null()]), created: z.union([z.number(), z.null()]) }),
});
export type AiChatCompletionResult = z.infer<typeof AiChatCompletionResultSchema>;
export const DeliverySettingsOverviewSchema = z.object({
  appCode: z.string(),
  configured: z.boolean(),
  values: z.record(z.string(), z.union([z.string(), z.boolean()])),
  secrets: z.record(z.string(), PaymentProviderSecretStatusSchema),
});
export type DeliverySettingsOverview = z.infer<typeof DeliverySettingsOverviewSchema>;
export const AppScreenshotSchema = z.object({ url: z.string(), caption: z.string().optional() });
export type AppScreenshot = z.infer<typeof AppScreenshotSchema>;
export const AppHighlightSchema = z.object({
  icon: z.string().optional(),
  title: z.string(),
  description: z.string(),
});
export type AppHighlight = z.infer<typeof AppHighlightSchema>;
export const AppFaqSchema = z.object({ question: z.string(), answer: z.string() });
export type AppFaq = z.infer<typeof AppFaqSchema>;
export const AppLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  type: z.union([
    z.literal('docs'),
    z.literal('support'),
    z.literal('website'),
    z.literal('download'),
    z.literal('other'),
  ]),
});
export type AppLink = z.infer<typeof AppLinkSchema>;
export const AppSecretSchema = z.object({
  id: z.uuid(),
  hint: z.string(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AppSecret = z.infer<typeof AppSecretSchema>;
export const AppSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  tagline: z.union([z.string(), z.null()]),
  description: z.union([z.string(), z.null()]),
  content: z.union([z.string(), z.null()]),
  iconUrl: z.union([z.string(), z.null()]),
  coverUrl: z.union([z.string(), z.null()]),
  screenshots: z.array(AppScreenshotSchema),
  highlights: z.array(AppHighlightSchema),
  faq: z.array(AppFaqSchema),
  links: z.array(AppLinkSchema),
  category: z.union([z.string(), z.null()]),
  sortOrder: z.number(),
  type: z.string(),
  status: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type App = z.infer<typeof AppSchema>;
export const AppWithDetailsSchema = z.intersection(
  AppSchema,
  z.object({
    plans: z.array(PlanSummarySchema),
    features: z.array(FeatureSummarySchema),
    checkoutOffers: z.array(
      z.object({
        code: z.string(),
        planCode: z.string(),
        planId: z.string(),
        appId: z.string(),
        appCode: z.string(),
        appName: z.string(),
        title: z.string(),
        description: z.union([z.string(), z.null()]),
        badge: z.union([z.string(), z.null()]),
        interval: z.string(),
        priceAmount: z.number(),
        currency: z.string(),
        status: z.string(),
        isDefault: z.boolean(),
        sortOrder: z.number(),
      }),
    ),
    secrets: z.array(AppSecretSchema).optional(),
  }),
);
export type AppWithDetails = z.infer<typeof AppWithDetailsSchema>;
export const AppCatalogSchema = z.object({
  app: AppWithDetailsSchema,
  plans: z.array(PlanSummarySchema),
  offers: z.array(
    z.object({
      code: z.string(),
      planCode: z.string(),
      planId: z.string(),
      appId: z.string(),
      appCode: z.string(),
      appName: z.string(),
      title: z.string(),
      description: z.union([z.string(), z.null()]),
      badge: z.union([z.string(), z.null()]),
      interval: z.string(),
      priceAmount: z.number(),
      currency: z.string(),
      status: z.string(),
      isDefault: z.boolean(),
      sortOrder: z.number(),
    }),
  ),
  features: z.array(FeatureSummarySchema),
  planFeatures: z.array(PlanFeatureSummarySchema),
});
export type AppCatalog = z.infer<typeof AppCatalogSchema>;
export const AppSecretCreatedSchema = z.object({
  appCode: z.string(),
  appName: z.string(),
  secretId: z.string(),
  secret: z.string(),
  hint: z.string(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});
export type AppSecretCreated = z.infer<typeof AppSecretCreatedSchema>;
export const ContentItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.union([z.string(), z.null()]),
  content: z.string(),
  coverUrl: z.union([z.string(), z.null()]),
  authorName: z.union([z.string(), z.null()]),
  sourceType: z.union([
    z.literal('manual'),
    z.literal('wordpress'),
    z.literal('notion'),
    z.literal('wechat'),
  ]),
  sourceId: z.union([z.string(), z.null()]),
  sourceUrl: z.union([z.string(), z.null()]),
  status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]),
  publishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  importedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;
export const ContentListResponseSchema = paginationSchema(ContentItemSchema);
export type ContentListResponse = z.infer<typeof ContentListResponseSchema>;
export const DocSpaceSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.null()]),
  iconUrl: z.union([z.string(), z.null()]),
  type: z.union([z.literal('product'), z.literal('app'), z.literal('internal')]),
  appId: z.union([z.string(), z.null()]),
  sortOrder: z.number(),
  status: z.union([z.literal('active'), z.literal('hidden'), z.literal('archived')]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type DocSpace = z.infer<typeof DocSpaceSchema>;
export const DocPageSchema = z.object({
  id: z.uuid(),
  spaceId: z.string(),
  parentId: z.union([z.string(), z.null()]),
  slug: z.string(),
  path: z.string(),
  title: z.string(),
  summary: z.union([z.string(), z.null()]),
  content: z.string(),
  sortOrder: z.number(),
  status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]),
  publishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type DocPage = z.infer<typeof DocPageSchema>;
export const DocPageTreeNodeSchema: z.ZodType<DocPageTreeNode> = z.object({
  id: z.string(),
  parentId: z.union([z.string(), z.null()]),
  slug: z.string(),
  path: z.string(),
  title: z.string(),
  summary: z.union([z.string(), z.null()]),
  status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]),
  sortOrder: z.number(),
  children: z.array(z.lazy(() => DocPageTreeNodeSchema)),
});

export const AdminDocSpaceListResponseSchema = z.object({
  items: z.array(z.intersection(DocSpaceSchema, z.object({ pageCount: z.number() }))),
});
export type AdminDocSpaceListResponse = z.infer<typeof AdminDocSpaceListResponseSchema>;
export const AdminDocSpaceDetailSchema = z.object({
  space: DocSpaceSchema,
  pages: z.array(DocPageSchema),
  tree: z.array(DocPageTreeNodeSchema),
});
export type AdminDocSpaceDetail = z.infer<typeof AdminDocSpaceDetailSchema>;
export const PublicDocSpaceListResponseSchema = z.object({
  items: z.array(z.intersection(DocSpaceSchema, z.object({ pageCount: z.number() }))),
});
export type PublicDocSpaceListResponse = z.infer<typeof PublicDocSpaceListResponseSchema>;
export const PublicDocSpaceDetailSchema = z.object({
  space: DocSpaceSchema,
  tree: z.array(DocPageTreeNodeSchema),
  defaultPath: z.union([z.string(), z.null()]),
});
export type PublicDocSpaceDetail = z.infer<typeof PublicDocSpaceDetailSchema>;
export const PublicDocPageDetailSchema = z.object({
  space: DocSpaceSchema,
  tree: z.array(DocPageTreeNodeSchema),
  page: DocPageSchema,
  previousPage: z.union([DocPageTreeNodeSchema, z.null()]),
  nextPage: z.union([DocPageTreeNodeSchema, z.null()]),
});
export type PublicDocPageDetail = z.infer<typeof PublicDocPageDetailSchema>;
export const CheckoutSessionSummarySchema = z.object({
  id: z.uuid(),
  sessionCode: z.string(),
  status: z.string(),
  provider: z.union([z.string(), z.null()]),
  actionType: z.union([z.string(), z.null()]),
  actionPayload: z.unknown(),
  successUrl: z.union([z.string(), z.null()]),
  cancelUrl: z.union([z.string(), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CheckoutSessionSummary = z.infer<typeof CheckoutSessionSummarySchema>;
export const OrderSchema = z.object({
  id: z.uuid(),
  orderNo: z.string(),
  status: z.string(),
  provider: z.union([z.string(), z.null()]),
  providerOrderId: z.union([z.string(), z.null()]),
  amount: z.number(),
  currency: z.string(),
  paidAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  userId: z.string(),
  appId: z.string(),
  planId: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;
export const HydratedOrderSchema = z.intersection(
  OrderSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
    plan: z.union([PlanSummarySchema, z.null()]),
    checkoutSession: z.union([CheckoutSessionSummarySchema, z.null()]),
  }),
);
export type HydratedOrder = z.infer<typeof HydratedOrderSchema>;
export const PaymentAttemptSchema = z.object({
  id: z.uuid(),
  attemptNo: z.string(),
  status: z.string(),
  actionType: z.union([z.string(), z.null()]),
  providerReference: z.union([z.string(), z.null()]),
  requestPayload: z.unknown(),
  responsePayload: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PaymentAttempt = z.infer<typeof PaymentAttemptSchema>;
export const EntitlementSummarySchema = z.object({
  id: z.uuid(),
  status: z.string(),
  startsAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  plan: z.union([PlanSummarySchema, z.null()]),
});
export type EntitlementSummary = z.infer<typeof EntitlementSummarySchema>;
export const OrderEventSummarySchema = z.object({
  eventName: z.string(),
  eventTime: z.iso.datetime({ offset: true }),
  properties: z.unknown(),
});
export type OrderEventSummary = z.infer<typeof OrderEventSummarySchema>;
export const OrderDetailSchema = z.object({
  item: HydratedOrderSchema,
  paymentAttempts: z.array(PaymentAttemptSchema),
  entitlements: z.array(EntitlementSummarySchema),
  events: z.array(OrderEventSummarySchema),
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;
export const OrdersResponseSchema = paginationSchema(HydratedOrderSchema);
export type OrdersResponse = z.infer<typeof OrdersResponseSchema>;
export const OrderAdminActionResultSchema = z.object({
  changed: z.boolean(),
  order: OrderSchema,
  action: z.object({
    status: z.union([
      z.literal('cancelled'),
      z.literal('paid'),
      z.literal('refunding'),
      z.literal('refunded'),
    ]),
    reason: z.string(),
    refundId: z.union([z.string(), z.null()]).optional(),
  }),
});
export type OrderAdminActionResult = z.infer<typeof OrderAdminActionResultSchema>;
export const CheckoutSessionCreatedSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  status: z.string(),
  app: AppSummarySchema.omit({ id: true }),
  product: z.object({ code: z.string(), name: z.string() }),
  plan: z.object({
    code: z.string(),
    name: z.string(),
    interval: z.union([z.string(), z.null()]),
    priceAmount: z.number(),
    currency: z.string(),
  }),
  order: z.object({
    id: z.uuid(),
    orderNo: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.string(),
  }),
  presentation: z.object({ type: z.literal('hosted_page'), url: z.string() }),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
});
export type CheckoutSessionCreated = z.infer<typeof CheckoutSessionCreatedSchema>;
export const CheckoutSessionPublicSchema = z.object({
  sessionId: z.string(),
  sessionCode: z.string(),
  status: z.string(),
  app: AppSummarySchema.omit({ id: true }),
  product: z.object({ code: z.string(), name: z.string() }),
  plan: z.object({ code: z.string(), name: z.string(), interval: z.union([z.string(), z.null()]) }),
  order: z.object({
    orderNo: z.string(),
    subject: z.string(),
    amount: z.number(),
    amountYuan: z.string(),
    currency: z.string(),
  }),
  paymentAction: z.union([
    z.object({
      type: z.literal('qr_code'),
      qrCodeText: z.string(),
      codeUrl: z.string(),
      qrCodeDataUrl: z.string(),
    }),
    z.object({ type: z.literal('redirect_url'), url: z.string() }),
    z.null(),
  ]),
  successUrl: z.union([z.string(), z.null()]),
  cancelUrl: z.union([z.string(), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});
export type CheckoutSessionPublic = z.infer<typeof CheckoutSessionPublicSchema>;
export const CheckoutSessionStatusSchema = z.object({
  sessionCode: z.string(),
  status: z.string(),
  orderNo: z.string(),
  paidAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});
export type CheckoutSessionStatus = z.infer<typeof CheckoutSessionStatusSchema>;
export const ReconcileResponseSchema = z.object({
  sessionCode: z.string().optional(),
  status: z.string().optional(),
  orderNo: z.string().optional(),
  paidAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  completedAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  changed: z.boolean().optional(),
  reconciliation: z.object({ status: z.string(), reason: z.string() }),
});
export type ReconcileResponse = z.infer<typeof ReconcileResponseSchema>;
export const InstallSchema = z.object({
  id: z.uuid(),
  extensionInstallId: z.string(),
  chromeProfileHint: z.union([z.string(), z.null()]),
  appVersion: z.union([z.string(), z.null()]),
  status: z.string(),
  lastSeenAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Install = z.infer<typeof InstallSchema>;
export const HydratedInstallSchema = z.intersection(
  InstallSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
  }),
);
export type HydratedInstall = z.infer<typeof HydratedInstallSchema>;
export const InstallsResponseSchema = paginationSchema(HydratedInstallSchema);
export type InstallsResponse = z.infer<typeof InstallsResponseSchema>;
export const EntitlementSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  sourceType: z.string(),
  sourceId: z.union([z.string(), z.null()]),
  startsAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  meta: z.record(z.string(), z.unknown()).optional(),
  userId: z.string(),
  appId: z.string(),
  planId: z.string(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;
export const HydratedEntitlementSchema = z.intersection(
  EntitlementSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
    plan: z.union([PlanSummarySchema, z.null()]),
    sourceOrder: z.union([
      z.object({ id: z.string(), orderNo: z.string(), status: z.string() }),
      z.null(),
    ]),
  }),
);
export type HydratedEntitlement = z.infer<typeof HydratedEntitlementSchema>;
export const EntitlementsResponseSchema = z.intersection(
  paginationSchema(HydratedEntitlementSchema),
  z.object({
    summary: z
      .array(z.object({ appCode: z.string(), featureCodes: z.array(z.string()) }))
      .optional(),
  }),
);
export type EntitlementsResponse = z.infer<typeof EntitlementsResponseSchema>;
export const AuditLogSchema = z.object({
  id: z.uuid(),
  actorType: z.union([z.literal('user'), z.literal('system'), z.literal('job')]),
  actorUserId: z.union([z.string(), z.null()]),
  actorLabel: z.union([z.string(), z.null()]),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.union([z.string(), z.null()]),
  outcome: z.union([z.literal('succeeded'), z.literal('failed')]),
  summary: z.union([z.string(), z.null()]),
  ipAddress: z.union([z.string(), z.null()]),
  userAgent: z.union([z.string(), z.null()]),
  requestId: z.union([z.string(), z.null()]),
  meta: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
export const EventSchema = z.object({
  id: z.uuid(),
  eventName: z.string(),
  eventTime: z.iso.datetime({ offset: true }),
  properties: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
  userId: z.union([z.string(), z.null()]),
  installId: z.union([z.string(), z.null()]),
  appId: z.union([z.string(), z.null()]),
});
export type Event = z.infer<typeof EventSchema>;
export const SupportTicketRelatedOrderSchema = z.object({
  id: z.uuid(),
  orderNo: z.string(),
  status: z.string(),
  subject: z.string(),
  amount: z.number(),
  currency: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type SupportTicketRelatedOrder = z.infer<typeof SupportTicketRelatedOrderSchema>;
export const SupportTicketRelatedInstallSchema = z.object({
  id: z.uuid(),
  extensionInstallId: z.string(),
  status: z.string(),
  appVersion: z.union([z.string(), z.null()]),
  lastSeenAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});
export type SupportTicketRelatedInstall = z.infer<typeof SupportTicketRelatedInstallSchema>;
export const SupportTicketRelatedDeploymentSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  environment: z.string(),
  status: z.string(),
  domainValues: z.record(z.string(), z.string()),
});
export type SupportTicketRelatedDeployment = z.infer<typeof SupportTicketRelatedDeploymentSchema>;
export const SupportTicketSchema = z.object({
  id: z.uuid(),
  ticketNo: z.string(),
  userId: z.string(),
  appId: z.union([z.string(), z.null()]),
  orderId: z.union([z.string(), z.null()]),
  installId: z.union([z.string(), z.null()]),
  deploymentId: z.union([z.string(), z.null()]),
  category: z.union([
    z.literal('account'),
    z.literal('billing'),
    z.literal('access'),
    z.literal('install'),
    z.literal('deployment'),
    z.literal('bug'),
    z.literal('feature'),
    z.literal('other'),
  ]),
  priority: z.union([
    z.literal('low'),
    z.literal('normal'),
    z.literal('high'),
    z.literal('urgent'),
  ]),
  status: z.union([
    z.literal('waiting_staff'),
    z.literal('waiting_user'),
    z.literal('resolved'),
    z.literal('closed'),
  ]),
  subject: z.string(),
  assignedAdminUserId: z.union([z.string(), z.null()]),
  lastReplyAuthorType: z.union([z.literal('user'), z.literal('admin'), z.literal('system')]),
  lastActivityAt: z.iso.datetime({ offset: true }),
  firstRespondedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  resolvedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  closedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;
export const HydratedSupportTicketSchema = z.intersection(
  SupportTicketSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
    order: z.union([SupportTicketRelatedOrderSchema, z.null()]),
    install: z.union([SupportTicketRelatedInstallSchema, z.null()]),
    deployment: z.union([SupportTicketRelatedDeploymentSchema, z.null()]),
    assignee: z.union([UserSummarySchema, z.null()]),
    messageCount: z.number(),
  }),
);
export type HydratedSupportTicket = z.infer<typeof HydratedSupportTicketSchema>;
export const AdminUserActivitySchema = z.object({
  summary: z.object({
    recentOrders: z.number(),
    activeEntitlements: z.number(),
    installs: z.number(),
    auditLogs: z.number(),
    events: z.number(),
    tickets: z.number(),
  }),
  orders: z.array(HydratedOrderSchema),
  entitlements: z.array(HydratedEntitlementSchema),
  installs: z.array(HydratedInstallSchema),
  auditLogs: z.array(AuditLogSchema),
  events: z.array(EventSchema),
  tickets: z.array(HydratedSupportTicketSchema),
});
export type AdminUserActivity = z.infer<typeof AdminUserActivitySchema>;
export const AdminUserDetailSchema = z.intersection(
  AdminUserSchema,
  z.object({
    emailVerifiedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    activity: AdminUserActivitySchema,
  }),
);
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;
export const NotificationItemSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  category: z.union([
    z.literal('account'),
    z.literal('billing'),
    z.literal('license'),
    z.literal('deployment'),
    z.literal('ticket'),
    z.literal('system'),
    z.literal('announcement'),
  ]),
  level: z.union([
    z.literal('info'),
    z.literal('success'),
    z.literal('warning'),
    z.literal('error'),
  ]),
  title: z.string(),
  body: z.string(),
  ctaLabel: z.union([z.string(), z.null()]),
  ctaUrl: z.union([z.string(), z.null()]),
  status: z.union([z.literal('unread'), z.literal('read'), z.literal('archived')]),
  sourceEventId: z.union([z.string(), z.null()]),
  sourceEventName: z.union([z.string(), z.null()]),
  dedupeKey: z.union([z.string(), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  readAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  archivedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;
export const NotificationsResponseSchema = paginationSchema(NotificationItemSchema);
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;
export const NotificationUnreadCountSchema = z.object({ unreadCount: z.number() });
export type NotificationUnreadCount = z.infer<typeof NotificationUnreadCountSchema>;
export const AdminNotificationItemSchema = z.intersection(
  NotificationItemSchema,
  z.object({
    user: z.union([
      z.intersection(UserSummarySchema, z.object({ status: z.union([z.string(), z.null()]) })),
      z.null(),
    ]),
  }),
);
export type AdminNotificationItem = z.infer<typeof AdminNotificationItemSchema>;
export const AdminNotificationsResponseSchema = paginationSchema(AdminNotificationItemSchema);
export type AdminNotificationsResponse = z.infer<typeof AdminNotificationsResponseSchema>;
export const PublishAnnouncementResultSchema = z.object({
  broadcastId: z.string(),
  recipientCount: z.number(),
  title: z.string(),
  level: z.union([
    z.literal('info'),
    z.literal('success'),
    z.literal('warning'),
    z.literal('error'),
  ]),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PublishAnnouncementResult = z.infer<typeof PublishAnnouncementResultSchema>;
export const SupportTicketMessageSchema = z.object({
  id: z.uuid(),
  ticketId: z.string(),
  authorUserId: z.union([z.string(), z.null()]),
  authorType: z.union([z.literal('user'), z.literal('admin'), z.literal('system')]),
  isInternal: z.boolean(),
  body: z.string(),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
  author: z.union([UserSummarySchema, z.null()]),
});
export type SupportTicketMessage = z.infer<typeof SupportTicketMessageSchema>;
export const SupportTicketDetailSchema = z.object({
  ticket: HydratedSupportTicketSchema,
  messages: z.array(SupportTicketMessageSchema),
});
export type SupportTicketDetail = z.infer<typeof SupportTicketDetailSchema>;
export const SupportTicketsResponseSchema = paginationSchema(HydratedSupportTicketSchema);
export type SupportTicketsResponse = z.infer<typeof SupportTicketsResponseSchema>;
export const GrantEntitlementInputSchema = z.object({
  userEmail: z.string(),
  planCode: z.string(),
  reason: z.string().optional(),
});
export type GrantEntitlementInput = z.infer<typeof GrantEntitlementInputSchema>;
export const GrantEntitlementResultSchema = z.object({
  user: UserSummarySchema,
  plan: PlanSummarySchema,
  app: AppSummarySchema,
  granted: z.boolean(),
  reason: z.string(),
  sourceId: z.string(),
});
export type GrantEntitlementResult = z.infer<typeof GrantEntitlementResultSchema>;
export const RevokeEntitlementResultSchema = z.object({
  entitlementId: z.string(),
  sourceType: z.string(),
  sourceId: z.union([z.string(), z.null()]),
  revokedCount: z.number(),
  userId: z.string(),
  appId: z.string(),
});
export type RevokeEntitlementResult = z.infer<typeof RevokeEntitlementResultSchema>;
export const HydratedEventSchema = z.intersection(
  EventSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    install: z.union([
      z.object({ id: z.string(), extensionInstallId: z.string(), status: z.string() }),
      z.null(),
    ]),
    app: z.union([AppSummarySchema, z.null()]),
  }),
);
export type HydratedEvent = z.infer<typeof HydratedEventSchema>;
export const EventsResponseSchema = paginationSchema(HydratedEventSchema);
export type EventsResponse = z.infer<typeof EventsResponseSchema>;
export const BillingWebhookEventSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  type: z.string(),
  providerEventId: z.string(),
  status: z.string(),
  payload: z.unknown(),
  processedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type BillingWebhookEvent = z.infer<typeof BillingWebhookEventSchema>;
export const WebhooksResponseSchema = paginationSchema(BillingWebhookEventSchema);
export type WebhooksResponse = z.infer<typeof WebhooksResponseSchema>;
export const JobRunSchema = z.object({
  id: z.uuid(),
  queue: z.string(),
  kind: z.string(),
  status: z.union([
    z.literal('pending'),
    z.literal('running'),
    z.literal('succeeded'),
    z.literal('failed'),
    z.literal('dead'),
  ]),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }),
  attempts: z.number(),
  maxAttempts: z.number(),
  availableAt: z.iso.datetime({ offset: true }),
  startedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  finishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  relatedEntityType: z.union([z.string(), z.null()]),
  relatedEntityId: z.union([z.string(), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type JobRun = z.infer<typeof JobRunSchema>;
export const JobRunsResponseSchema = paginationSchema(JobRunSchema);
export type JobRunsResponse = z.infer<typeof JobRunsResponseSchema>;
export const AuditLogsResponseSchema = paginationSchema(AuditLogSchema);
export type AuditLogsResponse = z.infer<typeof AuditLogsResponseSchema>;
export const ObservabilityAlertSchema = z.object({
  id: z.uuid(),
  level: z.union([z.literal('info'), z.literal('warning'), z.literal('error')]),
  title: z.string(),
  description: z.string(),
  count: z.number(),
  href: z.string(),
});
export type ObservabilityAlert = z.infer<typeof ObservabilityAlertSchema>;
export const ObservabilitySummarySchema = z.object({
  metrics: z.object({
    deadJobs: z.number(),
    failedJobs: z.number(),
    runningJobs: z.number(),
    pendingJobs: z.number(),
    pendingOrders: z.number(),
    stalePendingOrders: z.number(),
    unprocessedWebhooks: z.number(),
    waitingStaffTickets: z.number(),
    events24h: z.number(),
  }),
  alerts: z.array(ObservabilityAlertSchema),
});
export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;
export const PlanSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  interval: z.union([z.string(), z.null()]),
  appId: z.string(),
});
export type Plan = z.infer<typeof PlanSchema>;
export const PlansResponseSchema = z.object({ items: z.array(PlanSchema) });
export type PlansResponse = z.infer<typeof PlansResponseSchema>;
export const DeploymentTokenSummarySchema = z.object({
  id: z.uuid(),
  tokenHint: z.string(),
  status: z.string(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  usedAt: z.union([z.string(), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
});
export type DeploymentTokenSummary = z.infer<typeof DeploymentTokenSummarySchema>;
export const DeploymentSummarySchema = z.object({
  id: z.uuid(),
  label: z.string(),
  environment: z.string(),
  serverHost: z.union([z.string(), z.null()]),
  installPath: z.string(),
  status: z.string(),
  lastTokenIssuedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  lastDeployedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  updatePolicy: z.union([z.literal('manual'), z.literal('auto')]),
  currentRuntimeImages: z.object({
    frontendImage: z.union([z.string(), z.null()]),
    websocketImage: z.union([z.string(), z.null()]),
  }),
  availableRuntimeImages: z.object({
    frontendImage: z.union([z.string(), z.null()]),
    websocketImage: z.union([z.string(), z.null()]),
    offeredAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    appliedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  }),
  runtimeAssets: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      current: z.union([z.string(), z.null()]),
      available: z.union([z.string(), z.null()]),
    }),
  ),
  runtimeAssetsOfferedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  runtimeAssetsAppliedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  currentWordpressAssetReleases: z.record(z.string(), z.union([z.string(), z.null()])),
  availableWordpressAssetReleases: z.record(z.string(), z.union([z.string(), z.null()])),
  pendingAction: z.union([
    z.object({
      id: z.string(),
      kind: z.union([
        z.literal('apply_runtime_images'),
        z.literal('apply_wordpress_assets'),
        z.literal('ignore_runtime_images'),
        z.literal('ignore_wordpress_assets'),
      ]),
      requestedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    }),
    z.null(),
  ]),
  lastAction: z.union([
    z.object({
      id: z.string(),
      kind: z.union([
        z.literal('apply_runtime_images'),
        z.literal('apply_wordpress_assets'),
        z.literal('ignore_runtime_images'),
        z.literal('ignore_wordpress_assets'),
      ]),
      status: z.union([z.literal('completed'), z.literal('failed')]),
      message: z.union([z.string(), z.null()]),
      finishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
    }),
    z.null(),
  ]),
  deliveryValues: z.record(z.string(), z.union([z.string(), z.boolean()])),
  domainValues: z.record(z.string(), z.string()),
  configuredSecretKeys: z.array(z.string()),
  domainBinding: z.object({
    sourceField: z.string(),
    sourceLabel: z.union([z.string(), z.null()]),
    scope: z.union([z.literal('registrable_domain'), z.literal('exact_host')]),
    isLocked: z.boolean(),
    boundDomain: z.union([z.string(), z.null()]),
    boundAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  }),
  entitlement: z.union([
    z.object({
      id: z.string(),
      status: z.string(),
      startsAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
      expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
      plan: z.union([
        z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          interval: z.union([z.string(), z.null()]),
        }),
        z.null(),
      ]),
    }),
    z.null(),
  ]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  user: z.union([UserSummarySchema, z.null()]),
  app: z.union([AppSummarySchema, z.null()]),
  latestToken: z.union([DeploymentTokenSummarySchema, z.null()]),
});
export type DeploymentSummary = z.infer<typeof DeploymentSummarySchema>;
export const DeploymentsResponseSchema = z.object({ items: z.array(DeploymentSummarySchema) });
export type DeploymentsResponse = z.infer<typeof DeploymentsResponseSchema>;
export const IssueDeploymentTokenResultSchema = z.object({
  deploymentId: z.string(),
  tokenId: z.string(),
  tokenHint: z.string(),
  token: z.string(),
  exchangeUrl: z.string(),
  exchangeCurl: z.string(),
  remoteInstallCommand: z.union([z.string(), z.null()]),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type IssueDeploymentTokenResult = z.infer<typeof IssueDeploymentTokenResultSchema>;
export const AdminListParamsSchema = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
  search: z.string().optional(),
});
export type AdminListParams = z.infer<typeof AdminListParamsSchema>;
export const AdminOrderListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z
      .union([
        z.literal('pending'),
        z.literal('paid'),
        z.literal('failed'),
        z.literal('cancelled'),
        z.literal('refunding'),
        z.literal('refunded'),
      ])
      .optional(),
    provider: z.union([z.literal('wechat_pay'), z.literal('alipay')]).optional(),
  }),
);
export type AdminOrderListParams = z.infer<typeof AdminOrderListParamsSchema>;
export const AdminContentListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z.union([z.literal('draft'), z.literal('published'), z.literal('archived')]).optional(),
    sourceType: z
      .union([
        z.literal('manual'),
        z.literal('wordpress'),
        z.literal('notion'),
        z.literal('wechat'),
      ])
      .optional(),
  }),
);
export type AdminContentListParams = z.infer<typeof AdminContentListParamsSchema>;
export const AdminNotificationListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z.union([z.literal('unread'), z.literal('read'), z.literal('archived')]).optional(),
    category: z
      .union([
        z.literal('account'),
        z.literal('billing'),
        z.literal('license'),
        z.literal('deployment'),
        z.literal('ticket'),
        z.literal('system'),
        z.literal('announcement'),
      ])
      .optional(),
  }),
);
export type AdminNotificationListParams = z.infer<typeof AdminNotificationListParamsSchema>;
export const AdminTicketListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z
      .union([
        z.literal('waiting_staff'),
        z.literal('waiting_user'),
        z.literal('resolved'),
        z.literal('closed'),
      ])
      .optional(),
    category: z
      .union([
        z.literal('account'),
        z.literal('billing'),
        z.literal('access'),
        z.literal('install'),
        z.literal('deployment'),
        z.literal('bug'),
        z.literal('feature'),
        z.literal('other'),
      ])
      .optional(),
    priority: z
      .union([z.literal('low'), z.literal('normal'), z.literal('high'), z.literal('urgent')])
      .optional(),
  }),
);
export type AdminTicketListParams = z.infer<typeof AdminTicketListParamsSchema>;
export const UpsertAppInputSchema = z.object({
  name: z.string(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  iconUrl: z.string().optional(),
  coverUrl: z.string().optional(),
  screenshots: z.array(AppScreenshotSchema).optional(),
  highlights: z.array(AppHighlightSchema).optional(),
  faq: z.array(AppFaqSchema).optional(),
  links: z.array(AppLinkSchema).optional(),
  category: z.string().optional(),
  sortOrder: z.number().optional(),
  type: z.string(),
  status: z.string(),
  features: z
    .array(z.object({ code: z.string(), name: z.string(), kind: z.string(), status: z.string() }))
    .optional(),
  plans: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        billingProvider: z.string(),
        billingPriceId: z.string().optional(),
        priceAmount: z.number(),
        currency: z.string(),
        interval: z.union([z.literal('month'), z.literal('year'), z.literal('one_time')]),
        status: z.string(),
        featureCodes: z.array(z.string()),
        meta: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  offers: z
    .array(
      z.object({
        code: z.string(),
        planCode: z.string(),
        title: z.string(),
        description: z.string().optional(),
        badge: z.string().optional(),
        priceAmount: z.number(),
        currency: z.string(),
        status: z.string(),
        isDefault: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
    )
    .optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type UpsertAppInput = z.infer<typeof UpsertAppInputSchema>;
export const SyncAppDeliveryManifestInputSchema = z.object({
  repoUrl: z.string().optional(),
  repoBranch: z.string().optional(),
  manifestPath: z.string().optional(),
  manifestUrl: z.string().optional(),
});
export type SyncAppDeliveryManifestInput = z.infer<typeof SyncAppDeliveryManifestInputSchema>;
export const UpsertDeliverySettingsInputSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
  installer: z
    .object({ repoUrl: z.string().optional(), repoBranch: z.string().optional() })
    .optional(),
});
export type UpsertDeliverySettingsInput = z.infer<typeof UpsertDeliverySettingsInputSchema>;
export const DocsSearchIndexItemSchema = z.object({
  spaceSlug: z.string(),
  spaceTitle: z.string(),
  pagePath: z.string(),
  pageTitle: z.string(),
  summary: z.union([z.string(), z.null()]),
});
export type DocsSearchIndexItem = z.infer<typeof DocsSearchIndexItemSchema>;
export const DocsSearchIndexResponseSchema = z.object({
  items: z.array(DocsSearchIndexItemSchema),
});
export type DocsSearchIndexResponse = z.infer<typeof DocsSearchIndexResponseSchema>;
export const DocFeedbackInputSchema = z.object({
  spaceSlug: z.string(),
  pagePath: z.string(),
  helpful: z.boolean(),
  comment: z.string().optional(),
});
export type DocFeedbackInput = z.infer<typeof DocFeedbackInputSchema>;
export const DocFeedbackResultSchema = z.object({ ok: z.boolean(), id: z.string() });
export type DocFeedbackResult = z.infer<typeof DocFeedbackResultSchema>;
export const ListQiniuImagesInputSchema = z.object({
  prefix: z.string().optional(),
  marker: z.string().optional(),
  limit: z.number().optional(),
});
export type ListQiniuImagesInput = z.infer<typeof ListQiniuImagesInputSchema>;
export const CreateQiniuUploadTokenInputSchema = z.object({
  filename: z.string(),
  prefix: z.string().optional(),
});
export type CreateQiniuUploadTokenInput = z.infer<typeof CreateQiniuUploadTokenInputSchema>;
export const WechatPaySettingsSchema = z.object({
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  mchId: z.string().optional(),
  apiKey: z.string().optional(),
  disableH5: z.boolean().optional(),
});
export type WechatPaySettings = z.infer<typeof WechatPaySettingsSchema>;
export const AlipaySettingsSchema = z.object({
  appId: z.string().optional(),
  f2fPay: z.boolean().optional(),
  privateKeyPem: z.string().optional(),
  publicKeyPem: z.string().optional(),
});
export type AlipaySettings = z.infer<typeof AlipaySettingsSchema>;
export const SmtpSettingsInputSchema = z.object({
  host: z.string().optional(),
  port: z.number().optional(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().optional(),
});
export type SmtpSettingsInput = z.infer<typeof SmtpSettingsInputSchema>;
export const SmtpTestEmailInputSchema = z.intersection(
  SmtpSettingsInputSchema,
  z.object({ to: z.string(), subject: z.string(), text: z.string() }),
);
export type SmtpTestEmailInput = z.infer<typeof SmtpTestEmailInputSchema>;
export const AlertingSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  minimumLevel: z.union([z.literal('info'), z.literal('warning'), z.literal('error')]).optional(),
  cooldownMinutes: z.number().optional(),
  email: z
    .object({ enabled: z.boolean().optional(), recipients: z.array(z.string()).optional() })
    .optional(),
  webhook: z
    .object({
      enabled: z.boolean().optional(),
      url: z.string().optional(),
      secret: z.string().optional(),
    })
    .optional(),
});
export type AlertingSettingsInput = z.infer<typeof AlertingSettingsInputSchema>;
export const QiniuSettingsInputSchema = z.object({
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  bucketName: z.string().optional(),
  publicBaseUrl: z.string().optional(),
  uploadHost: z.string().optional(),
  defaultPrefix: z.string().optional(),
});
export type QiniuSettingsInput = z.infer<typeof QiniuSettingsInputSchema>;
export const SiteFooterLinkInputSchema = z.object({
  label: z.string(),
  url: z.string(),
  openInNewTab: z.boolean().optional(),
});
export type SiteFooterLinkInput = z.infer<typeof SiteFooterLinkInputSchema>;
export const SiteNavigationChildInputSchema = SiteFooterLinkInputSchema;
export type SiteNavigationChildInput = z.infer<typeof SiteNavigationChildInputSchema>;
export const SiteNavigationItemInputSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
  openInNewTab: z.boolean().optional(),
  children: z.array(SiteNavigationChildInputSchema).optional(),
});
export type SiteNavigationItemInput = z.infer<typeof SiteNavigationItemInputSchema>;
export const SiteSettingsInputSchema = z.object({
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  brandPrimaryColor: z.string().optional(),
  headerNavigation: z.array(SiteNavigationItemInputSchema).optional(),
  footerCopyright: z.string().optional(),
  filingInfo: z.string().optional(),
  footerLinks: z.array(SiteFooterLinkInputSchema).optional(),
});
export type SiteSettingsInput = z.infer<typeof SiteSettingsInputSchema>;
export const OpenRouterSettingsInputSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  siteUrl: z.string().optional(),
  siteName: z.string().optional(),
  defaultModel: z.string().optional(),
});
export type OpenRouterSettingsInput = z.infer<typeof OpenRouterSettingsInputSchema>;
export const OpenRouterChatPreviewInputSchema = z.intersection(
  OpenRouterSettingsInputSchema,
  z.object({
    model: z.string().optional(),
    messages: z.array(
      z.object({
        role: z.union([
          z.literal('system'),
          z.literal('user'),
          z.literal('assistant'),
          z.literal('tool'),
        ]),
        content: z.string(),
      }),
    ),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }),
);
export type OpenRouterChatPreviewInput = z.infer<typeof OpenRouterChatPreviewInputSchema>;
export const ContentImportSettingsInputSchema = z.object({
  wordpress: z
    .object({
      siteUrl: z.string().optional(),
      username: z.string().optional(),
      appPassword: z.string().optional(),
    })
    .optional(),
  notion: z.object({ apiToken: z.string().optional() }).optional(),
});
export type ContentImportSettingsInput = z.infer<typeof ContentImportSettingsInputSchema>;
export const PublicPagesSettingsInputSchema = z.object({
  contentHub: HubPageContentSchema.partial().optional(),
  docsHub: HubPageContentSchema.partial().optional(),
});
export type PublicPagesSettingsInput = z.infer<typeof PublicPagesSettingsInputSchema>;
export const MyOrdersResponseSchema = z.object({
  items: z.array(
    OrderSchema.extend({
      user: UserSummarySchema.nullable().optional(),
      app: AppSummarySchema.nullable().optional(),
      plan: PlanSummarySchema.nullable().optional(),
      checkoutSession: CheckoutSessionSummarySchema.nullable().optional(),
    }),
  ),
});
export type MyOrdersResponse = z.infer<typeof MyOrdersResponseSchema>;
export const MyEntitlementsResponseSchema = z.object({
  items: z.array(
    EntitlementSchema.extend({
      app: AppSummarySchema.nullable(),
      plan: PlanSummarySchema.nullable(),
      featureCodes: z.array(z.string()),
      sourceOrder: z
        .object({ id: z.string(), orderNo: z.string(), status: z.string() })
        .nullable()
        .optional(),
    }),
  ),
  summary: z.array(z.object({ appCode: z.string(), featureCodes: z.array(z.string()) })),
});
export type MyEntitlementsResponse = z.infer<typeof MyEntitlementsResponseSchema>;
export const JobRetryResponseSchema = JobRunSchema.pick({
  id: true,
  kind: true,
  queue: true,
  status: true,
  attempts: true,
  maxAttempts: true,
});
export type JobRetryResponse = z.infer<typeof JobRetryResponseSchema>;

export type MyOrder = MyOrdersResponse['items'][number];
export type MyEntitlement = MyEntitlementsResponse['items'][number];
