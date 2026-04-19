import { z } from 'zod';

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['unread', 'read', 'archived']).optional(),
  category: z.enum(['account', 'billing', 'license', 'deployment', 'system']).optional(),
});

export const notificationIdParamsSchema = z.object({
  notificationId: z.string().uuid(),
});
