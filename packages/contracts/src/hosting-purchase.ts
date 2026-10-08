import { z } from 'zod';
import { OrderItemSchema } from './order-items.js';
export const HostingPurchasesSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      orderId: z.uuid(),
      userId: z.uuid(),
      appId: z.uuid(),
      appCode: z.string(),
      status: z.enum(['available', 'bound', 'refund_pending', 'revoked']),
      deploymentId: z.uuid().nullable(),
      item: OrderItemSchema,
      createdAt: z.iso.datetime({ offset: true }),
      updatedAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
