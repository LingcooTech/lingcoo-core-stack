import type { AppServiceFactory } from '../app/public';
import type { EventServiceFactory } from '../event/public';
import type { LicenseServiceFactory } from '../license/public';

export interface AiDependencies {
  readonly createAppService: (
    ...args: Parameters<AppServiceFactory>
  ) => Pick<ReturnType<AppServiceFactory>, 'requireActiveApp'>;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createLicenseService: (
    ...args: Parameters<LicenseServiceFactory>
  ) => Pick<ReturnType<LicenseServiceFactory>, 'listUserEntitlementsByAppId'>;
}
export function pickAiDependencies(input: AiDependencies): AiDependencies {
  return {
    createAppService: (...args) => {
      const port = input.createAppService(...args);
      return { requireActiveApp: port.requireActiveApp.bind(port) };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createLicenseService: (...args) => {
      const port = input.createLicenseService(...args);
      return { listUserEntitlementsByAppId: port.listUserEntitlementsByAppId.bind(port) };
    },
  };
}
