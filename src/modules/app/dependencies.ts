import type { DeliverySettingsFactory } from '../deployment/public';
import type { EventServiceFactory } from '../event/public';
import type { LicenseRepositoryFactory } from '../license/public';
import type { LicenseServiceFactory } from '../license/public';
import type { deleteAppDeliverySettings } from '../deployment/public';

export interface AppDependencies {
  readonly createDeliverySettings: (
    ...args: Parameters<DeliverySettingsFactory>
  ) => Pick<ReturnType<DeliverySettingsFactory>, 'upsertSettings' | 'getOverview'>;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createLicenseAccess: (
    ...args: Parameters<LicenseRepositoryFactory>
  ) => Pick<
    ReturnType<LicenseRepositoryFactory>,
    | 'deactivateFeaturesByAppExceptCodes'
    | 'deactivatePlansByAppExceptCodes'
    | 'deactivatePlansByAppId'
    | 'deleteFeaturesByAppId'
    | 'listFeatures'
    | 'listFeaturesByAppId'
    | 'listPlanFeatureMappings'
    | 'listPlansByAppId'
    | 'listPlansByAppIds'
    | 'replacePlanFeatureMappings'
    | 'upsertFeature'
    | 'upsertPlan'
  >;
  readonly createLicenseService: (
    ...args: Parameters<LicenseServiceFactory>
  ) => Pick<ReturnType<LicenseServiceFactory>, 'listUserEntitlementsByAppId'>;
  readonly deleteAppDeliverySettings: typeof deleteAppDeliverySettings;
  readonly now: () => Date;
}
export function pickAppDependencies(input: AppDependencies): AppDependencies {
  return {
    createDeliverySettings: (...args) => {
      const port = input.createDeliverySettings(...args);
      return {
        upsertSettings: port.upsertSettings.bind(port),
        getOverview: port.getOverview.bind(port),
      };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createLicenseAccess: (...args) => {
      const port = input.createLicenseAccess(...args);
      return {
        deactivateFeaturesByAppExceptCodes: port.deactivateFeaturesByAppExceptCodes.bind(port),
        deactivatePlansByAppExceptCodes: port.deactivatePlansByAppExceptCodes.bind(port),
        deactivatePlansByAppId: port.deactivatePlansByAppId.bind(port),
        deleteFeaturesByAppId: port.deleteFeaturesByAppId.bind(port),
        listFeatures: port.listFeatures.bind(port),
        listFeaturesByAppId: port.listFeaturesByAppId.bind(port),
        listPlanFeatureMappings: port.listPlanFeatureMappings.bind(port),
        listPlansByAppId: port.listPlansByAppId.bind(port),
        listPlansByAppIds: port.listPlansByAppIds.bind(port),
        replacePlanFeatureMappings: port.replacePlanFeatureMappings.bind(port),
        upsertFeature: port.upsertFeature.bind(port),
        upsertPlan: port.upsertPlan.bind(port),
      };
    },
    createLicenseService: (...args) => {
      const port = input.createLicenseService(...args);
      return { listUserEntitlementsByAppId: port.listUserEntitlementsByAppId.bind(port) };
    },
    deleteAppDeliverySettings: input.deleteAppDeliverySettings,
    now: input.now,
  };
}
