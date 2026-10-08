import { z } from 'zod';
export const ItemRefundCommandSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['software', 'hosting']),
    amount: z.number().int().positive().max(2147483647),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export type ItemRefundCommand = z.infer<typeof ItemRefundCommandSchema>;
export const ItemRefundLedgerSchema = z.object({
  orderNo: z.string(),
  orderStatus: z.string(),
  legacyRefund: z.boolean(),
  lines: z.array(
    z.object({
      kind: z.enum(['software', 'hosting']),
      title: z.string(),
      amount: z.number().int(),
      refunded: z.number().int(),
      pending: z.number().int(),
      remaining: z.number().int(),
    }),
  ),
  records: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['software', 'hosting']),
      amount: z.number().int(),
      status: z.enum(['pending', 'succeeded', 'failed']),
      reason: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
