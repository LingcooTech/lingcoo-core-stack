import { and, eq } from 'drizzle-orm';
import { orderItemRefunds, orders } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
export async function assertNoItemRefunds(db: DbExecutor, orderId: string) {
  const [row] = await db
    .select({ id: orderItemRefunds.id })
    .from(orderItemRefunds)
    .where(eq(orderItemRefunds.orderId, orderId))
    .limit(1);
  if (row) throw httpError(409, '该订单已使用分项退款，请在退款账本中操作');
}
export async function hasPendingSoftwareRefund(
  db: DbExecutor,
  entitlement: { sourceType: string; sourceId: string | null },
) {
  if (entitlement.sourceType !== 'order' || !entitlement.sourceId) return false;
  const [order] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, entitlement.sourceId));
  if (order && ['refunding', 'refunded'].includes(order.status)) return true;
  const [row] = await db
    .select({ id: orderItemRefunds.id })
    .from(orderItemRefunds)
    .where(
      and(
        eq(orderItemRefunds.orderId, entitlement.sourceId),
        eq(orderItemRefunds.kind, 'software'),
        eq(orderItemRefunds.status, 'pending'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function assertNoPendingSoftwareRefund(
  db: DbExecutor,
  entitlement: { sourceType: string; sourceId: string | null },
) {
  if (await hasPendingSoftwareRefund(db, entitlement))
    throw httpError(409, '软件费用正在退款，暂不能新增部署或购买托管');
}
