import { z } from 'zod';

export const HostingPurchaseTermsSchema = z
  .object({
    offerVersion: z.number().int().positive(),
    description: z.string().min(5).max(2000),
    graceDays: z.number().int().min(0).max(90),
    retentionDays: z.number().int().min(1).max(3650),
  })
  .strict();
export const OrderItemSchema = z
  .object({
    kind: z.enum(['software', 'hosting']),
    productId: z.uuid(),
    code: z.string().min(1),
    title: z.string().min(1),
    appName: z.string().min(1),
    interval: z.enum(['one_time', 'month', 'year']),
    quantity: z.number().int().min(1).max(120),
    unitAmount: z.number().int().nonnegative(),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(1),
    hostingTerms: HostingPurchaseTermsSchema.optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.kind === 'hosting' && (!item.hostingTerms || item.interval === 'one_time'))
      ctx.addIssue({ code: 'custom', message: '托管明细缺少周期或服务政策' });
    if (item.kind === 'software' && item.hostingTerms)
      ctx.addIssue({ code: 'custom', message: '软件明细不能包含托管政策' });
  });
export const OrderItemsSchema = z.array(OrderItemSchema).max(2);
export type OrderItem = z.infer<typeof OrderItemSchema>;

export function validateOrderItems(items: OrderItem[], amount: number, currency: string) {
  const parsed = OrderItemsSchema.parse(items);
  if (
    !parsed.length ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647 ||
    parsed.some(
      (i) =>
        i.currency !== currency ||
        !Number.isSafeInteger(i.unitAmount * i.quantity) ||
        i.amount !== i.unitAmount * i.quantity,
    ) ||
    parsed.reduce((sum, i) => sum + i.amount, 0) !== amount ||
    new Set(parsed.map((i) => i.kind)).size !== parsed.length
  ) {
    throw new Error('Invalid order item totals or currency');
  }
  return parsed;
}
