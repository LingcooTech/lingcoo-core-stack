import { z } from 'zod';

export const billingProviderSchema = z.enum(['wechat_pay', 'alipay']);

export const createOrderSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  priceCode: z.string().trim().min(1).max(64).optional(),
  offerCode: z.string().trim().min(1).max(64).optional(),
  provider: billingProviderSchema
}).refine((value) => Boolean(value.priceCode || value.offerCode), {
  message: 'priceCode or offerCode is required',
  path: ['priceCode']
});

export const orderNoParamsSchema = z.object({
  orderNo: z.string().trim().min(8).max(64)
});
