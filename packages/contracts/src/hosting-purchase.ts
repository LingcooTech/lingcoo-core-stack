import { z } from 'zod';
import { HostingServiceSchema } from './hosting-service.js';
import { HostingOrderTargetSchema, OrderItemSchema } from './order-items.js';
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

export const HostingFulfillmentsSchema = z.object({
  items: z.array(
    z.object({
      orderId: z.uuid(),
      orderNo: z.string(),
      appId: z.uuid(),
      status: z.enum(['applied', 'review', 'revoked']),
      reason: z.string(),
      target: HostingOrderTargetSchema,
      createdAt: z.iso.datetime({ offset: true }),
      before: HostingServiceSchema.nullable(),
      after: HostingServiceSchema.nullable(),
    }),
  ),
});
