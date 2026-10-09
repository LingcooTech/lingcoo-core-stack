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

export const wechatPaymentSettingsSchema = z.object({
  appId: z.string().trim().optional(),
  mchId: z.string().trim().optional(),
  apiV3Key: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^[\x20-\x7E]{32}$/.test(value),
      'API v3 密钥须为 32 位 ASCII 字符',
    )
    .optional(),
  merchantSerial: z.string().trim().optional(),
  privateKeyPem: z.string().trim().optional(),
  publicKeyPem: z.string().trim().optional(),
  publicKeyId: z.string().trim().optional(),
});

export const alipayPaymentSettingsSchema = z.object({
  appId: z.string().trim().optional(),
  f2fPay: z.boolean().optional(),
  privateKeyPem: z.string().trim().optional(),
  publicKeyPem: z.string().trim().optional(),
});

export const smtpSettingsSchema = z.object({
  host: optionalTrimmedString(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: optionalTrimmedString(255),
  password: optionalTrimmedString(255),
  from: optionalEmailString,
});

export const alertingSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  minimumLevel: z.enum(['info', 'warning', 'error']).optional(),
  cooldownMinutes: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional(),
  email: z
    .object({
      enabled: z.boolean().optional(),
      recipients: z.array(z.string().trim().email()).max(20).optional(),
    })
    .optional(),
  webhook: z
    .object({
      enabled: z.boolean().optional(),
      url: optionalUrlString,
      secret: optionalTrimmedString(255),
    })
    .optional(),
});

export const qiniuSettingsSchema = z.object({
  accessKey: optionalTrimmedString(255),
  secretKey: optionalTrimmedString(255),
  bucketName: optionalTrimmedString(255),
  publicBaseUrl: optionalUrlString,
  uploadHost: optionalUrlString,
  defaultPrefix: optionalTrimmedString(255),
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

export const siteSettingsSchema = z.object({
  siteName: optionalTrimmedString(120),
  logoUrl: optionalSitePathOrUrl,
  faviconUrl: optionalSitePathOrUrl,
  brandPrimaryColor: z
    .string()
    .trim()
    .max(32)
    .regex(/^(#[0-9a-fA-F]{6}|)$/, '请输入 #RRGGBB 形式的颜色值或留空')
    .optional(),
  headerNavigation: z.array(siteNavigationItemSchema).max(12).optional(),
  footerCopyright: optionalTrimmedString(255),
  filingInfo: optionalTrimmedString(255),
  footerLinks: z.array(siteFooterLinkSchema).max(12).optional(),
});

const hubContentSchema = z.object({
  eyebrow: optionalTrimmedString(60),
  title: optionalTrimmedString(120),
  description: optionalTrimmedString(500),
});

export const publicPagesSettingsSchema = z.object({
  contentHub: hubContentSchema.optional(),
  docsHub: hubContentSchema.optional(),
});

export const contentImportSettingsSchema = z.object({
  wordpress: z
    .object({
      siteUrl: optionalSitePathOrUrl.refine(
        (value) => !value || /^https?:\/\//i.test(value),
        '请输入有效的 WordPress 站点 URL',
      ),
      username: optionalTrimmedString(255),
      appPassword: optionalTrimmedString(255),
    })
    .optional(),
  notion: z
    .object({
      apiToken: optionalTrimmedString(255),
    })
    .optional(),
});

export const adminUpsertDeliverySettingsSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
  secrets: z.record(z.string(), z.string().trim().min(1).max(2048)).optional(),
  installer: z
    .object({
      repoUrl: z.string().trim().url().optional(),
      repoBranch: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});
