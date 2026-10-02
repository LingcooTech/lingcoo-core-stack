import type { DbExecutor } from '../../db/types';

import type { EventService } from './service';
import { EventRepository } from './repository';

export type EventServicePort = Pick<EventService, 'capture' | 'loadProjectionEvents'>;
export type EventServiceFactory = (db: DbExecutor) => EventServicePort;

export function createEventAccess(db: DbExecutor) {
  const implementation = new EventRepository(db);
  return {
    listEvents: implementation.listEvents.bind(implementation),
    listRecentEventsByOrderNo: implementation.listRecentEventsByOrderNo.bind(implementation),
    listRecentEventsByUserId: implementation.listRecentEventsByUserId.bind(implementation),
  };
}
export type EventRepositoryPort = ReturnType<typeof createEventAccess>;
