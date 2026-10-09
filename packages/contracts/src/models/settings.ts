import { z } from 'zod';

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

const wechatPemSchema = z
  .string()
  .trim()
  .max(20_000, 'PEM 文件不能超过 20KB')
  .refine(
    (value) =>
      !value ||
      (value.length >= 100 && /^-----BEGIN ([A-Z ]+)-----[\s\S]+-----END \1-----$/.test(value)),
    '请选择有效的 PEM 格式文件',
  );

export const WechatPaySettingsSchema = z.object({
  enabled: z.boolean().optional(),
  appId: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^wx[0-9a-fA-F]{16}$/.test(value),
      'AppID 须为 wx 开头的 18 位标识',
    )
    .optional(),
  mchId: z
    .string()
    .trim()
    .refine((value) => !value || /^\d{6,32}$/.test(value), '商户号须为 6 至 32 位数字')
    .optional(),
  merchantSerial: z
    .string()
    .trim()
    .refine(
      (value) => !value || (value.length >= 8 && value.length <= 128),
      '证书序列号须为 8 至 128 位',
    )
    .optional(),
  privateKeyPem: wechatPemSchema.optional(),
  apiV3Key: z
    .string()
    .refine(
      (value) => !value || /^[\x20-\x7E]{32}$/.test(value),
      'API v3 密钥须为 32 位 ASCII 字符',
    )
    .optional(),
  publicKeyId: z
    .string()
    .trim()
    .refine(
      (value) => !value || (value.length >= 8 && value.length <= 128),
      '公钥标识须为 8 至 128 位',
    )
    .optional(),
  publicKeyPem: wechatPemSchema.optional(),
  notifyUrl: z
    .union([
      z.literal(''),
      z.url({ error: '请输入有效的 HTTPS 回调地址' }).refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
        } catch {
          return false;
        }
      }, '支付回调地址必须使用 HTTPS，且不能包含凭据或片段'),
    ])
    .optional(),
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
