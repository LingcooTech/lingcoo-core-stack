import type { DbExecutor } from '../../db/types';

import type { DeploymentRepository } from './repository';

export type DeploymentRepositoryPort = Pick<
  DeploymentRepository,
  'findDeploymentById' | 'listDeploymentsByIds'
>;
export type DeploymentRepositoryFactory = (db: DbExecutor) => DeploymentRepositoryPort;

export { deleteAppDeliverySettings, rotateDeliveryKeyring } from './delivery-config';

export * from './delivery-settings';
import type { DeliverySettingsService } from './delivery-settings';
import type { AppEnv } from '../../lib/env';
export type DeliverySettingsFactory = (
  db: DbExecutor,
  env: AppEnv,
) => Pick<DeliverySettingsService, 'upsertSettings'>;

export { HostingDnsService } from './hosting-dns';

export { CustomDomainService } from './custom-domains';

import type { HostingServiceTerms } from './hosting-service';
export type HostingTermsFactory = (
  db: DbExecutor,
  clock: () => Date,
) => Pick<HostingServiceTerms, 'quoteRenewal' | 'applyPaidRenewal'>;
