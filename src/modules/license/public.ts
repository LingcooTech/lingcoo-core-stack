import type { DbExecutor } from '../../db/types';

import type { LicenseRepository } from './repository';
import type { LicenseService } from './service';

export type LicenseRepositoryPort = Pick<
  LicenseRepository,
  | 'cancelEntitlementById'
  | 'cancelEntitlementsBySource'
  | 'deactivateFeaturesByAppExceptCodes'
  | 'deactivatePlansByAppExceptCodes'
  | 'deactivatePlansByAppId'
  | 'deleteFeaturesByAppId'
  | 'findEntitlementById'
  | 'getPlanById'
  | 'listEntitlements'
  | 'listEntitlementsByIds'
  | 'listEntitlementsBySource'
  | 'listFeatures'
  | 'listFeaturesByAppId'
  | 'listPlanFeatureMappings'
  | 'listPlansByAppId'
  | 'listPlansByAppIds'
  | 'listPlansByIds'
  | 'listRecentEntitlementsByUserId'
  | 'replacePlanFeatureMappings'
  | 'updateEntitlementMeta'
  | 'upsertFeature'
  | 'upsertPlan'
>;
export type LicenseRepositoryFactory = (db: DbExecutor) => LicenseRepositoryPort;

export type LicenseServicePort = Pick<
  LicenseService,
  | 'findActiveOneTimeOwnership'
  | 'getPlanForCheckout'
  | 'grantEntitlementsForPlan'
  | 'listUserEntitlements'
  | 'listUserEntitlementsByAppId'
>;
export type LicenseServiceFactory = (db: DbExecutor) => LicenseServicePort;
