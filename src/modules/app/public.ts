import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import type { AppService } from './service';
import { AppRepository } from './repository';
export { rotateApplicationConnectionKeys } from './key-rotation';

export type AppServicePort = Pick<
  AppService,
  | 'getPublicApp'
  | 'listUserEntitlementsForApp'
  | 'requireActiveApp'
  | 'requireActiveSecretById'
  | 'resolveCheckoutOffer'
>;
export type AppServiceFactory = (db: DbExecutor, env?: AppEnv) => AppServicePort;

export function createAppAccess(db: DbExecutor) {
  const implementation = new AppRepository(db);
  return {
    findAppByCode: implementation.findAppByCode.bind(implementation),
    findAppById: implementation.findAppById.bind(implementation),
    listAppsByIds: implementation.listAppsByIds.bind(implementation),
  };
}
export type AppRepositoryPort = ReturnType<typeof createAppAccess>;
