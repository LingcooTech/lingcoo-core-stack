import type { DbExecutor } from '../../db/types';

import type { DeploymentRepository } from './repository';

export type DeploymentRepositoryPort = Pick<
  DeploymentRepository,
  'findDeploymentById' | 'listDeploymentsByIds'
>;
export type DeploymentRepositoryFactory = (db: DbExecutor) => DeploymentRepositoryPort;

export { deleteAppDeliverySettings } from './delivery-config';
