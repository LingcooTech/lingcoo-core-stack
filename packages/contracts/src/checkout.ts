import { z } from 'zod';

import { billingProviderSchema } from './billing.js';

export const createCheckoutSessionSchema = z.object({
  appCode: z.string().trim().min(1).max(64),
  planCode: z.string().trim().min(1).max(64),
  offerCode: z.string().trim().min(1).max(64).optional(),
  providerPreference: billingProviderSchema.optional(),
  successUrl: z.string().url().max(2048).optional(),
  cancelUrl: z.string().url().max(2048).optional(),
});

export const checkoutSessionParamsSchema = z.object({
  sessionCode: z.string().trim().min(8).max(64),
});
