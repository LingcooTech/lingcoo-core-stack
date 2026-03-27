import { z } from 'zod';

export const paymentProviderParamsSchema = z.object({
  provider: z.enum(['wechat_pay', 'alipay'])
});

export const wechatPaymentSettingsSchema = z.object({
  mchId: z.string().trim().optional(),
  appId: z.string().trim().optional(),
  certSerialNo: z.string().trim().optional(),
  apiBaseUrl: z.union([z.url(), z.literal('')]).optional(),
  notifyUrl: z.union([z.url(), z.literal('')]).optional(),
  apiV3Key: z.string().trim().optional(),
  privateKeyPem: z.string().trim().optional(),
  platformCertPem: z.string().trim().optional()
});

export const alipayPaymentSettingsSchema = z.object({
  appId: z.string().trim().optional(),
  gateway: z.union([z.url(), z.literal('')]).optional(),
  notifyUrl: z.union([z.url(), z.literal('')]).optional(),
  returnUrl: z.union([z.url(), z.literal('')]).optional(),
  keyType: z.enum(['PKCS1', 'PKCS8']).optional(),
  privateKeyPem: z.string().trim().optional(),
  publicKeyPem: z.string().trim().optional()
});
