import { z } from 'zod';

export const eventItemSchema = z.object({
  eventName: z.string().min(1).max(120),
  userId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  installId: z.string().uuid().optional(),
  eventTime: z.iso.datetime().optional(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export const eventBatchSchema = z.object({
  items: z.array(eventItemSchema).min(1).max(100),
});
