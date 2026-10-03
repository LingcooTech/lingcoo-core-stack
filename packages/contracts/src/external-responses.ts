import { z } from 'zod';
import * as models from './models.js';
import * as core from './core-responses.js';
const timestamp = z.iso.datetime({ offset: true });
const ok = z.object({ ok: z.literal(true) });
const appBrief = z.object({ id: z.uuid(), code: z.string(), name: z.string(), type: z.string() });
const summary = z.array(z.object({ appCode: z.string(), featureCodes: z.array(z.string()) }));
const licenseItems = z.array(
  models.EntitlementSchema.and(z.object({ plan: models.PlanSummarySchema.nullable() })),
);
const license = z.object({ items: licenseItems, summary });
const scope = z.enum(['trial', 'entitled']);
const access = z.object({ scope, entitled: z.boolean() });
const quotaCounter = z.object({
  limit: z.number().nonnegative(),
  used: z.number().nonnegative(),
  remaining: z.number().nonnegative(),
});
export const aiAccessResponseSchema = z.object({
  app: appBrief.omit({ id: true }),
  access: access.extend({ featureCodes: z.array(z.string()), planCodes: z.array(z.string()) }),
  providers: z.object({
    defaultProvider: z.string().nullable(),
    items: z.array(models.AiProviderStatusSchema),
  }),
  quota: z.object({
    windowHours: z.number().positive(),
    requests: quotaCounter,
    requestChars: quotaCounter,
    totalTokens: quotaCounter,
    maxMessagesPerRequest: z.number().positive(),
    maxInputCharsPerRequest: z.number().positive(),
    maxTokensPerRequest: z.number().positive(),
    defaultMaxTokens: z.number().positive(),
  }),
  usage: z.object({
    windowStartedAt: timestamp,
    requestCount: z.number().nonnegative(),
    requestChars: z.number().nonnegative(),
    responseChars: z.number().nonnegative(),
    promptTokens: z.number().nonnegative(),
    completionTokens: z.number().nonnegative(),
    totalTokens: z.number().nonnegative(),
  }),
  status: z.object({
    ready: z.boolean(),
    reason: z.enum(['ready', 'email_not_verified', 'provider_not_configured', 'quota_exhausted']),
  }),
  user: z.object({ emailVerified: z.boolean() }),
});
const install = z.object({
  app: appBrief,
  install: z.object({
    id: z.uuid(),
    extensionInstallId: z.string(),
    status: z.string(),
    linkedUser: z.boolean(),
    lastSeenAt: timestamp.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    appVersion: z.string().nullable(),
    chromeProfileHint: z.string().nullable(),
  }),
});
const payment = z.object({
  provider: z.enum(['wechat_pay', 'alipay']),
  orderNo: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  mode: z.enum(['native_qr', 'page_redirect']),
  configured: z.boolean(),
  integrationStatus: z.literal('live'),
  notifyUrl: z.string(),
  nextStep: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
const asset = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['github_release', 'docker_image', 'qiniu_object', 'http_file', 'custom']),
  required: z.boolean(),
  visibility: z.enum(['public', 'private']),
  group: z.string().optional(),
  description: z.string().optional(),
  repo: z.string().optional(),
  file: z.string().optional(),
  path: z.string().optional(),
  tag: z.string().optional(),
  tagEnv: z.string().optional(),
  image: z.string().optional(),
  imageEnv: z.string().optional(),
  url: z.string().optional(),
  urlEnv: z.string().optional(),
  authSecret: z.string().optional(),
  checksum: z.string().optional(),
  checksumEnv: z.string().optional(),
});
export const externalResponseContracts = [
  { method: 'POST', path: '/v1/auth/register', schema: core.authResponseSchema },
  { method: 'POST', path: '/v1/auth/login', schema: core.authResponseSchema },
  {
    method: 'GET',
    path: '/v1/auth/providers',
    schema: z.object({ items: z.array(z.object({ code: z.string(), enabled: z.boolean() })) }),
  },
  {
    method: 'GET',
    path: '/v1/auth/sessions',
    schema: z.object({
      items: z.array(
        z.object({
          id: z.uuid(),
          createdAt: timestamp,
          expiresAt: timestamp,
          current: z.boolean(),
        }),
      ),
    }),
  },
  {
    method: 'POST',
    path: '/v1/auth/sessions/:id/revoke',
    schema: z.object({ revoked: z.literal(true) }),
  },
  { method: 'GET', path: '/v1/apps/:appCode', schema: models.AppWithDetailsSchema },
  {
    method: 'POST',
    path: '/v1/apps/:appCode/session',
    schema: z.object({ token: z.string().min(1), expiresIn: z.number().positive(), app: appBrief }),
  },
  {
    method: 'GET',
    path: '/v1/apps/:appCode/entitlements/me',
    schema: license.extend({ app: models.AppWithDetailsSchema }),
  },
  { method: 'GET', path: '/v1/apps/:appCode/ai/access', schema: aiAccessResponseSchema },
  {
    method: 'GET',
    path: '/v1/apps/:appCode/ai/providers',
    schema: z.object({
      app: appBrief.omit({ id: true, type: true }),
      defaultProvider: z.string().nullable(),
      items: z.array(models.AiProviderStatusSchema),
      access,
    }),
  },
  {
    method: 'GET',
    path: '/v1/apps/:appCode/ai/providers/:provider/models',
    schema: models.AiProviderModelsResponseSchema.extend({
      app: appBrief.omit({ id: true, type: true }),
      access,
    }),
  },
  {
    method: 'POST',
    path: '/v1/apps/:appCode/ai/providers/:provider/chat/completions',
    schema: models.AiChatCompletionResultSchema.extend({ access: aiAccessResponseSchema }),
  },
  {
    method: 'POST',
    path: '/v1/admin/ai/providers/:provider/chat/completions',
    schema: models.AiChatCompletionResultSchema,
  },
  {
    method: 'GET',
    path: '/v1/billing/providers',
    schema: z.object({ items: z.array(z.object({ code: z.string(), configured: z.boolean() })) }),
  },
  {
    method: 'POST',
    path: '/v1/billing/orders',
    schema: z.object({
      order: models.OrderSchema,
      plan: models.PlanSummarySchema,
      app: models.AppWithDetailsSchema,
      offer: models.AppCatalogSchema.shape.offers.element,
      payment,
    }),
  },
  {
    method: 'POST',
    path: '/v1/billing/orders/:orderNo/mock-pay',
    schema: z.object({
      order: models.OrderSchema,
      entitlements: license,
      granted: z.boolean().optional(),
    }),
  },
  {
    method: 'GET',
    path: '/v1/checkout/sessions/:sessionCode',
    schema: z.object({
      sessionId: z.uuid(),
      sessionCode: z.string(),
      status: z.string(),
      app: appBrief.omit({ id: true }),
      product: z.object({ code: z.string(), name: z.string() }),
      plan: models.CheckoutSessionCreatedSchema.shape.plan,
      order: z.object({
        orderNo: z.string(),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string(),
        paidAt: timestamp.nullable(),
      }),
      presentation: models.CheckoutSessionCreatedSchema.shape.presentation,
      successUrl: z.string().nullable(),
      cancelUrl: z.string().nullable(),
      expiresAt: timestamp.nullable(),
      completedAt: timestamp.nullable(),
      createdAt: timestamp,
    }),
  },
  { method: 'POST', path: '/v1/apps/:appCode/installs', schema: install },
  { method: 'POST', path: '/v1/apps/:appCode/installs/:id/bind', schema: install },
  { method: 'POST', path: '/v1/apps/:appCode/installs/:id/heartbeat', schema: install },
  {
    method: 'GET',
    path: '/v1/apps/:appCode/installs/:id/license',
    schema: install.extend({ license: license.extend({ active: z.boolean() }) }),
  },
  {
    method: 'POST',
    path: '/v1/events/batch',
    schema: z.object({ accepted: z.number().int().nonnegative() }),
  },
  { method: 'GET', path: '/v1/system/modules', schema: z.object({ items: z.array(z.string()) }) },
  {
    method: 'POST',
    path: '/v1/deployments/bootstrap/exchange',
    schema: z.object({
      deployment: models.DeploymentSummarySchema,
      bootstrap: z.object({
        installPath: z.string(),
        exchangeUrl: z.url(),
        repository: z.object({ url: z.string(), branch: z.string() }),
        assets: z.array(asset),
        envDefaults: z.record(z.string(), z.string()),
        remoteInstallCommand: z.string().nullable(),
        notes: z.array(z.string()),
      }),
    }),
  },
  {
    method: 'POST',
    path: '/v1/deployments/actions/pull',
    schema: z.object({
      action: z
        .object({ id: z.string(), kind: z.string(), requestedAt: timestamp.nullable() })
        .nullable(),
    }),
  },
  { method: 'POST', path: '/v1/deployments/status/report', schema: ok },
  { method: 'POST', path: '/v1/deployments/actions/complete', schema: ok },
] as const satisfies readonly { method: string; path: string; schema: z.ZodType }[];
// These payment callbacks deliberately use provider-defined XML/plain text, never SDK JSON.
export const nonJsonResponseRoutes = [
  { method: 'POST', path: '/v1/billing/providers/wechat/notify' },
  { method: 'POST', path: '/v1/billing/providers/alipay/notify' },
] as const;
