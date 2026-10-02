import type { DbExecutor } from '../../db/types';

import type { InstallRepository } from './repository';

export type InstallRepositoryPort = Pick<
  InstallRepository,
  | 'findInstallByExtensionInstallId'
  | 'listInstalls'
  | 'listInstallsByIds'
  | 'listRecentInstallsByUserId'
>;
export type InstallRepositoryFactory = (db: DbExecutor) => InstallRepositoryPort;
