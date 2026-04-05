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
const intervalSchema = z.enum(['month', 'year', 'one_time']);

export const adminAppCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64)
});

export const adminUpsertDeliverySettingsSchema = z.object({
  repoUrl: z.string().trim().url().optional(),
  repoBranch: z.string().trim().min(1).max(120).optional(),
  frontendImage: z.string().trim().min(1).max(255).optional(),
  websocketImage: z.string().trim().min(1).max(255).optional(),
  letsencryptEmail: z.string().trim().email().optional(),
  acrUsername: z.string().trim().min(1).max(255).optional(),
  acrPassword: z.string().trim().min(1).max(255).optional(),
  githubToken: z.string().trim().min(1).max(255).optional(),
  wordpressFetchReleaseAssets: z.boolean().optional(),
  wordpressRunInit: z.boolean().optional(),
  wordpressReleaseOwner: z.string().trim().min(1).max(120).optional(),
  fdThemeReleaseTag: z.string().trim().min(1).max(120).optional(),
  fdAdminUiReleaseTag: z.string().trim().min(1).max(120).optional(),
  fdMemberReleaseTag: z.string().trim().min(1).max(120).optional(),
  fdPaymentReleaseTag: z.string().trim().min(1).max(120).optional(),
  fdCommerceReleaseTag: z.string().trim().min(1).max(120).optional(),
  fdContentTypesReleaseTag: z.string().trim().min(1).max(120).optional(),
  fdWebsocketPushReleaseTag: z.string().trim().min(1).max(120).optional(),
  wpgraphqlJwtAuthReleaseTag: z.string().trim().min(1).max(120).optional(),
  wpgraphqlTaxQueryRef: z.string().trim().min(1).max(120).optional()
});
