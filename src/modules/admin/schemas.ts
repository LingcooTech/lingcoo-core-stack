import {
  wechatPaymentSettingsSchema,
  alipayPaymentSettingsSchema,
  smtpSettingsSchema,
  alertingSettingsSchema,
  qiniuSettingsSchema,
  siteSettingsSchema,
  publicPagesSettingsSchema,
  contentImportSettingsSchema,
  adminUpsertDeliverySettingsSchema,
} from '../settings/public';
export {
  wechatPaymentSettingsSchema,
  alipayPaymentSettingsSchema,
  smtpSettingsSchema,
  alertingSettingsSchema,
  qiniuSettingsSchema,
  siteSettingsSchema,
  publicPagesSettingsSchema,
  contentImportSettingsSchema,
  adminUpsertDeliverySettingsSchema,
};
import { z } from 'zod';

const appRoleSchema = z.enum(['user', 'support', 'finance', 'editor', 'operator', 'admin']);

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
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
  provider: z.enum(['wechat_pay', 'alipay']),
});

export const smtpTestEmailSchema = smtpSettingsSchema.extend({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
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
  openInNewTab: z.boolean().optional(),
});

export const siteNavigationChildSchema = siteFooterLinkSchema;

export const siteNavigationItemSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    url: optionalSitePathOrUrl,
    openInNewTab: z.boolean().optional(),
    children: z.array(siteNavigationChildSchema).max(12).optional(),
  })
  .refine(
    (value) => Boolean(value.url) || (value.children?.length ?? 0) > 0,
    '一级菜单至少要有链接或一个二级菜单',
  );

export const contentImportWordPressTestSchema = z.object({
  siteUrl: optionalSitePathOrUrl.refine(
    (value) => !value || /^https?:\/\//i.test(value),
    '请输入有效的 WordPress 站点 URL',
  ),
  username: optionalTrimmedString(255),
  appPassword: optionalTrimmedString(255),
});

export const contentImportNotionTestSchema = z.object({
  apiToken: optionalTrimmedString(255),
});

export const qiniuTestConnectionSchema = qiniuSettingsSchema;

export const qiniuListImagesQuerySchema = z.object({
  prefix: optionalTrimmedString(255),
  marker: optionalTrimmedString(255),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

export const qiniuUploadTokenSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  prefix: optionalTrimmedString(255),
});

export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(255).optional(),
});

export const adminListOrdersQuerySchema = adminListQuerySchema.extend({
  status: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunding', 'refunded']).optional(),
  provider: z.enum(['wechat_pay', 'alipay']).optional(),
});

export const adminOrderParamsSchema = z.object({
  orderNo: z.string().trim().min(8).max(64),
});

export const adminEntitlementParamsSchema = z.object({
  entitlementId: z.string().uuid(),
});

export const adminGrantEntitlementSchema = z.object({
  userEmail: z.string().trim().email(),
  planCode: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(1).max(255).optional(),
});

export const adminListUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(255).optional(),
  role: appRoleSchema.optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const adminUpdateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: appRoleSchema.optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const adminUserIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const adminJobRunParamsSchema = z.object({
  jobId: z.string().uuid(),
});

const recordStatusSchema = z.enum(['active', 'inactive', 'cancelled', 'expired']);
const intervalSchema = z.enum(['month', 'year', 'one_time']);

export const adminAppCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
});
