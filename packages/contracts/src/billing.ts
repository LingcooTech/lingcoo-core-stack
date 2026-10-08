import { z } from 'zod';

export const billingProviderSchema = z.enum(['wechat_pay', 'alipay']);

export const hostingSelectionSchema = z
  .object({ offerId: z.uuid(), version: z.number().int().positive() })
  .strict();

export const hostingOnlySchema = z
  .object({ entitlementId: z.uuid(), deploymentId: z.uuid().optional() })
  .strict();

export const createOrderSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  planCode: z.string().trim().min(1).max(64),
  offerCode: z.string().trim().min(1).max(64).optional(),
  provider: billingProviderSchema,
  hosting: hostingSelectionSchema.optional(),
  hostingOnly: hostingOnlySchema.optional(),
});

export const orderNoParamsSchema = z.object({
  orderNo: z.string().trim().min(8).max(64),
});
