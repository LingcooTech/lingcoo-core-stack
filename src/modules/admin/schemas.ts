import { z } from 'zod';

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalEmailString = z
  .union([z.string().trim().email(), z.literal('')])
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalUrlString = z
  .union([z.string().trim().url(), z.literal('')])
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalSitePathOrUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) {
      return true;
    }

    if (value.startsWith('/')) {
      return true;
    }

    try {
      const url = new URL(value);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, '请输入有效链接，支持 /path、http(s)、mailto 或 tel')
  .optional()
  .transform((value) => (value ? value : undefined));

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

export const smtpSettingsSchema = z.object({
  host: optionalTrimmedString(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: optionalTrimmedString(255),
  password: optionalTrimmedString(255),
  from: optionalEmailString
});

export const smtpTestEmailSchema = smtpSettingsSchema.extend({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000)
});

export const qiniuSettingsSchema = z.object({
  accessKey: optionalTrimmedString(255),
  secretKey: optionalTrimmedString(255),
  bucketName: optionalTrimmedString(255),
  publicBaseUrl: optionalUrlString,
  uploadHost: optionalUrlString,
  defaultPrefix: optionalTrimmedString(255)
});

export const siteFooterLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  url: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => {
      if (value.startsWith('/')) {
        return true;
      }

      try {
        const url = new URL(value);
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
      } catch {
        return false;
      }
    }, '请输入有效链接，支持 /path、http(s)、mailto 或 tel'),
  openInNewTab: z.boolean().optional()
});

export const siteNavigationChildSchema = siteFooterLinkSchema;

export const siteNavigationItemSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    url: optionalSitePathOrUrl,
    openInNewTab: z.boolean().optional(),
    children: z.array(siteNavigationChildSchema).max(12).optional()
  })
  .refine((value) => Boolean(value.url) || (value.children?.length ?? 0) > 0, '一级菜单至少要有链接或一个二级菜单');

export const siteSettingsSchema = z.object({
  siteName: optionalTrimmedString(120),
  logoUrl: optionalSitePathOrUrl,
  faviconUrl: optionalSitePathOrUrl,
  headerNavigation: z.array(siteNavigationItemSchema).max(12).optional(),
  footerCopyright: optionalTrimmedString(255),
  footerLinks: z.array(siteFooterLinkSchema).max(12).optional()
});

export const qiniuTestConnectionSchema = qiniuSettingsSchema;

export const qiniuListImagesQuerySchema = z.object({
  prefix: optionalTrimmedString(255),
  marker: optionalTrimmedString(255),
  limit: z.coerce.number().int().min(1).max(200).default(60)
});

export const qiniuUploadTokenSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  prefix: optionalTrimmedString(255)
});

export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(255).optional()
});

export const adminListOrdersQuerySchema = adminListQuerySchema.extend({
  status: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded']).optional(),
  provider: z.enum(['wechat_pay', 'alipay']).optional()
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
  values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  secrets: z.record(z.string(), z.string().trim().min(1).max(2048)).optional(),
  installer: z
    .object({
      repoUrl: z.string().trim().url().optional(),
      repoBranch: z.string().trim().min(1).max(120).optional()
    })
    .optional()
});
