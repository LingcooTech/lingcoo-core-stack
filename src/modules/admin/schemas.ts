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

export const adminEntitlementParamsSchema = z.object({
  entitlementId: z.string().uuid()
});

export const adminGrantEntitlementSchema = z.object({
  userEmail: z.string().trim().email(),
  planCode: z.string().trim().min(1).max(64),
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
const productTypeSchema = z.enum(['chrome_extension', 'web_app', 'service']);
const intervalSchema = z.enum(['month', 'year', 'one_time']);

export const adminCatalogProductParamsSchema = z.object({
  productCode: z.string().trim().min(1).max(64)
});

export const adminAppCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64)
});

export const adminUpsertDeliverySettingsSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])).optional(),
  secrets: z.record(z.string(), z.string()).optional()
});

export const adminUpsertCatalogBundleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: productTypeSchema.default('web_app'),
  status: recordStatusSchema.default('active'),
  features: z.array(
    z.object({
      code: z.string().trim().min(1).max(64),
      name: z.string().trim().min(1).max(120),
      kind: z.string().trim().min(1).max(32).default('boolean'),
      status: recordStatusSchema.default('active')
    })
  ).min(1).max(100),
  plans: z.array(
    z.object({
      code: z.string().trim().min(1).max(64),
      name: z.string().trim().min(1).max(120),
      billingPriceId: z.string().trim().max(128).optional(),
      priceAmount: z.number().int().min(0).max(999999999),
      currency: z.string().trim().min(1).max(16).default('CNY'),
      interval: intervalSchema,
      status: recordStatusSchema.default('active'),
      featureCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(100),
      meta: z.record(z.string(), z.unknown()).optional()
    })
  ).min(1).max(100)
});
