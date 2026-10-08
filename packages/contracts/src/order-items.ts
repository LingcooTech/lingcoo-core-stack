import { z } from 'zod';

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
  })
  .strict();
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
