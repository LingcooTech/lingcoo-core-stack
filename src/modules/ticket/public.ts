import type { DbExecutor } from '../../db/types';

import type { TicketService } from './service';

export type TicketServicePort = Pick<TicketService, 'listRecentTicketsByUserId'>;
export type TicketServiceFactory = (db: DbExecutor) => TicketServicePort;

// Read-only boundary for destructive hosting operations.
export async function assertNoOpenDeploymentTickets(db: DbExecutor, deploymentId: string) {
  const { and, eq, inArray } = await import('drizzle-orm');
  const { supportTickets } = await import('../../db/schema/ticket');
  const { httpError } = await import('../../lib/errors');
  const [row] = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.deploymentId, deploymentId),
        inArray(supportTickets.status, ['waiting_staff', 'waiting_user']),
      ),
    )
    .limit(1);
  if (row) throw httpError(409, '存在未结束的关联工单，暂不能回收');
}
