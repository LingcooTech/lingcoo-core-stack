import { z } from 'zod';

export const paymentProviderParamsSchema = z.object({
  provider: z.enum(['wechat_pay', 'alipay'])
});

export const wechatPaymentSettingsSchema = z.object({
  appId: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  mchId: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  disableH5: z.boolean().optional()
});

export const alipayPaymentSettingsSchema = z.object({
  appId: z.string().trim().optional(),
  f2fPay: z.boolean().optional(),
  privateKeyPem: z.string().trim().optional(),
  publicKeyPem: z.string().trim().optional()
});

export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const adminOrderParamsSchema = z.object({
  orderNo: z.string().trim().min(8).max(64)
});

export const adminAuthorizationGrantParamsSchema = z.object({
  grantId: z.string().uuid()
});

export const adminGrantAuthorizationSchema = z.object({
  userEmail: z.string().trim().email(),
  authorizationTemplateCode: z.string().trim().min(1).max(64),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().trim().min(1).max(255).optional()
});

export const adminListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(255).optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional()
});

export const adminUpdateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional()
});

export const adminUserIdParamsSchema = z.object({
  userId: z.string().uuid()
});

const recordStatusSchema = z.enum(['active', 'inactive', 'cancelled', 'expired']);
const deliveryModeSchema = z.enum(['direct_access', 'one_click_deploy']);
const billingTypeSchema = z.enum(['one_time', 'recurring']);
const billingIntervalSchema = z.enum(['month', 'year']);
const grantStrategySchema = z.enum(['lifetime', 'fixed_duration', 'subscription_period']);

export const adminProductCodeParamsSchema = z.object({
  productCode: z.string().trim().min(1).max(64)
});

export const adminPriceCodeParamsSchema = z.object({
  priceCode: z.string().trim().min(1).max(64)
});

export const adminAuthorizationTemplateCodeParamsSchema = z.object({
  authorizationTemplateCode: z.string().trim().min(1).max(64)
});

export const adminAppCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64)
});

export const adminUpsertDeliverySettingsSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])).optional(),
  secrets: z.record(z.string(), z.string()).optional()
});

const screenshotSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  caption: z.string().trim().max(200).optional()
});

const highlightSchema = z.object({
  icon: z.string().trim().max(64).optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500)
});

const faqSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(2000)
});

const linkSchema = z.object({
  label: z.string().trim().min(1).max(64),
  url: z.string().trim().min(1).max(2048),
  type: z.enum(['docs', 'support', 'website', 'download', 'other']).default('other')
});

export const adminUpsertProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['chrome_extension', 'web_app', 'service']).optional(),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  content: z.string().trim().max(50000).optional(),
  iconUrl: z.string().trim().max(500).optional(),
  coverUrl: z.string().trim().max(500).optional(),
  screenshots: z.array(screenshotSchema).max(20).optional(),
  highlights: z.array(highlightSchema).max(8).optional(),
  faq: z.array(faqSchema).max(30).optional(),
  links: z.array(linkSchema).max(20).optional(),
  category: z.string().trim().max(64).optional(),
  deliveryMode: deliveryModeSchema.default('direct_access'),
  sortOrder: z.number().int().min(0).max(99999).default(0),
  status: recordStatusSchema.default('active'),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const adminUpsertPriceSchema = z.object({
  productCode: z.string().trim().min(1).max(64),
  authorizationTemplateCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  billingProvider: z.string().trim().min(1).max(32).default('self_hosted'),
  billingPriceId: z.string().trim().max(128).optional(),
  billingType: billingTypeSchema,
  billingInterval: billingIntervalSchema.optional(),
  amount: z.number().int().min(0).max(999999999),
  currency: z.string().trim().min(1).max(16).default('CNY'),
  grantStrategy: grantStrategySchema,
  grantDurationDays: z.number().int().min(1).max(3650).optional(),
  status: recordStatusSchema.default('active'),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const adminUpsertAuthorizationTemplateSchema = z.object({
  productCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).optional(),
  kind: z.string().trim().max(64).optional(),
  status: recordStatusSchema.default('active'),
  meta: z.record(z.string(), z.unknown()).optional()
});
