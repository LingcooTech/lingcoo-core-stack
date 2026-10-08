import type { HostingTermsFactory } from '../deployment/public';
import type { AppServiceFactory } from '../app/public';
import type { BillingRepositoryFactory } from '../billing/public';
import type { BillingServiceFactory } from '../billing/public';
import type { EventServiceFactory } from '../event/public';
import type { LicenseRepositoryFactory } from '../license/public';
import type { LicenseServiceFactory } from '../license/public';

export interface CheckoutDependencies {
  readonly createHostingTerms: HostingTermsFactory;
  readonly createAppService: (
    ...args: Parameters<AppServiceFactory>
  ) => Pick<ReturnType<AppServiceFactory>, 'resolveCheckoutOffer'>;
  readonly createBillingAccess: (
    ...args: Parameters<BillingRepositoryFactory>
  ) => Pick<ReturnType<BillingRepositoryFactory>, 'findOrderById'>;
  readonly createBillingService: (
    ...args: Parameters<BillingServiceFactory>
  ) => Pick<
    ReturnType<BillingServiceFactory>,
    'createOrder' | 'listProviders' | 'syncOrderStatusByOrderNo'
  >;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createLicenseAccess: (
    ...args: Parameters<LicenseRepositoryFactory>
  ) => Pick<ReturnType<LicenseRepositoryFactory>, 'getPlanById'>;
  readonly createLicenseService: (
    ...args: Parameters<LicenseServiceFactory>
  ) => Pick<ReturnType<LicenseServiceFactory>, 'findActiveOneTimeOwnership'>;
  readonly now: () => Date;
}
export function pickCheckoutDependencies(input: CheckoutDependencies): CheckoutDependencies {
  return {
    createHostingTerms: input.createHostingTerms,
    createAppService: (...args) => {
      const port = input.createAppService(...args);
      return { resolveCheckoutOffer: port.resolveCheckoutOffer.bind(port) };
    },
    createBillingAccess: (...args) => {
      const port = input.createBillingAccess(...args);
      return { findOrderById: port.findOrderById.bind(port) };
    },
    createBillingService: (...args) => {
      const port = input.createBillingService(...args);
      return {
        createOrder: port.createOrder.bind(port),
        listProviders: port.listProviders.bind(port),
        syncOrderStatusByOrderNo: port.syncOrderStatusByOrderNo.bind(port),
      };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createLicenseAccess: (...args) => {
      const port = input.createLicenseAccess(...args);
      return { getPlanById: port.getPlanById.bind(port) };
    },
    createLicenseService: (...args) => {
      const port = input.createLicenseService(...args);
      return { findActiveOneTimeOwnership: port.findActiveOneTimeOwnership.bind(port) };
    },
    now: input.now,
  };
}
