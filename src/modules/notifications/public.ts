import type { DbExecutor } from '../../db/types';

import type { NotificationsService } from './service';

export type NotificationsServicePort = Pick<NotificationsService, 'projectFromEvents'>;
export type NotificationsServiceFactory = (db: DbExecutor) => NotificationsServicePort;
