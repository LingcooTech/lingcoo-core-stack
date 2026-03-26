import { z } from 'zod';

export const billingProviderSchema = z.enum(['wechat_pay', 'alipay']);

export const createOrderSchema = z.object({
  planCode: z.string().trim().min(1).max(64),
  provider: billingProviderSchema
});

export const orderNoParamsSchema = z.object({
  orderNo: z.string().trim().min(8).max(64)
});
