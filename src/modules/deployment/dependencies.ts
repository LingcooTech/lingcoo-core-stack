import type { AppServiceFactory } from '../app/public';
import type { EventServiceFactory } from '../event/public';
import type { LicenseRepositoryFactory } from '../license/public';

export interface DeploymentDependencies {
  readonly createAppService: (
    ...args: Parameters<AppServiceFactory>
  ) => Pick<ReturnType<AppServiceFactory>, 'getPublicApp' | 'listUserEntitlementsForApp'>;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createLicenseAccess: (
    ...args: Parameters<LicenseRepositoryFactory>
  ) => Pick<
    ReturnType<LicenseRepositoryFactory>,
    | 'lockEntitlementById'
    | 'findEntitlementById'
    | 'getPlanById'
    | 'listEntitlementsByIds'
    | 'listPlansByIds'
    | 'updateEntitlementMeta'
  >;
  readonly now: () => Date;
}
export function pickDeploymentDependencies(input: DeploymentDependencies): DeploymentDependencies {
  return {
    createAppService: (...args) => {
      const port = input.createAppService(...args);
      return {
        getPublicApp: port.getPublicApp.bind(port),
        listUserEntitlementsForApp: port.listUserEntitlementsForApp.bind(port),
      };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createLicenseAccess: (...args) => {
      const port = input.createLicenseAccess(...args);
      return {
        lockEntitlementById: port.lockEntitlementById.bind(port),
        findEntitlementById: port.findEntitlementById.bind(port),
        getPlanById: port.getPlanById.bind(port),
        listEntitlementsByIds: port.listEntitlementsByIds.bind(port),
        listPlansByIds: port.listPlansByIds.bind(port),
        updateEntitlementMeta: port.updateEntitlementMeta.bind(port),
      };
    },
    now: input.now,
  };
}
