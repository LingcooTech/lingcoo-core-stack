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
