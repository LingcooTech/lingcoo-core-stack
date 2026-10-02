import { z } from 'zod';

export const billingProviderSchema = z.enum(['wechat_pay', 'alipay']);

export const createOrderSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  planCode: z.string().trim().min(1).max(64),
  offerCode: z.string().trim().min(1).max(64).optional(),
  provider: billingProviderSchema,
});

export const orderNoParamsSchema = z.object({
  orderNo: z.string().trim().min(8).max(64),
});
