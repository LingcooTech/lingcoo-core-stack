import type { DbExecutor } from '../../db/types';

import type { TicketService } from './service';

export type TicketServicePort = Pick<TicketService, 'listRecentTicketsByUserId'>;
export type TicketServiceFactory = (db: DbExecutor) => TicketServicePort;
