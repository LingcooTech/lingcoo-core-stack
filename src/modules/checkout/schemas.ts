import { z } from 'zod';

import { billingProviderSchema } from '../billing/schemas';

export const createCheckoutSessionSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  priceCode: z.string().trim().min(1).max(64).optional(),
  offerCode: z.string().trim().min(1).max(64).optional(),
  providerPreference: billingProviderSchema.optional(),
  successUrl: z.string().url().max(2048).optional(),
  cancelUrl: z.string().url().max(2048).optional()
}).refine((value) => Boolean(value.priceCode || value.offerCode), {
  message: 'priceCode or offerCode is required',
  path: ['priceCode']
});

export const checkoutSessionParamsSchema = z.object({
  sessionCode: z.string().trim().min(8).max(64)
});
