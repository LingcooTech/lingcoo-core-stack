import type { AppServiceFactory } from '../app/public';
import type { CheckoutRepositoryFactory } from '../checkout/public';
import type { EventServiceFactory } from '../event/public';
import type { LicenseRepositoryFactory } from '../license/public';
import type { LicenseServiceFactory } from '../license/public';
import type { getBillingProviderAdapter } from './providers';

export interface BillingDependencies {
  readonly createAppService: (
    ...args: Parameters<AppServiceFactory>
  ) => Pick<ReturnType<AppServiceFactory>, 'resolveCheckoutOffer'>;
  readonly createCheckoutAccess: (
    ...args: Parameters<CheckoutRepositoryFactory>
  ) => Pick<
    ReturnType<CheckoutRepositoryFactory>,
    | 'markPaymentAttemptsCancelledByOrderId'
    | 'markPaymentAttemptsPaidByOrderId'
    | 'markSessionCancelledByOrderId'
    | 'markSessionPaidByOrderId'
  >;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createLicenseAccess: (
    ...args: Parameters<LicenseRepositoryFactory>
  ) => Pick<ReturnType<LicenseRepositoryFactory>, 'cancelEntitlementsBySource'>;
  readonly createLicenseService: (
    ...args: Parameters<LicenseServiceFactory>
  ) => Pick<
    ReturnType<LicenseServiceFactory>,
    'findActiveOneTimeOwnership' | 'grantEntitlementsForPlan' | 'listUserEntitlements'
  >;
  readonly getBillingProviderAdapter: typeof getBillingProviderAdapter;
  readonly now: () => Date;
}
export function pickBillingDependencies(input: BillingDependencies): BillingDependencies {
  return {
    createAppService: (...args) => {
      const port = input.createAppService(...args);
      return { resolveCheckoutOffer: port.resolveCheckoutOffer.bind(port) };
    },
    createCheckoutAccess: (...args) => {
      const port = input.createCheckoutAccess(...args);
      return {
        markPaymentAttemptsCancelledByOrderId:
          port.markPaymentAttemptsCancelledByOrderId.bind(port),
        markPaymentAttemptsPaidByOrderId: port.markPaymentAttemptsPaidByOrderId.bind(port),
        markSessionCancelledByOrderId: port.markSessionCancelledByOrderId.bind(port),
        markSessionPaidByOrderId: port.markSessionPaidByOrderId.bind(port),
      };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createLicenseAccess: (...args) => {
      const port = input.createLicenseAccess(...args);
      return { cancelEntitlementsBySource: port.cancelEntitlementsBySource.bind(port) };
    },
    createLicenseService: (...args) => {
      const port = input.createLicenseService(...args);
      return {
        findActiveOneTimeOwnership: port.findActiveOneTimeOwnership.bind(port),
        grantEntitlementsForPlan: port.grantEntitlementsForPlan.bind(port),
        listUserEntitlements: port.listUserEntitlements.bind(port),
      };
    },
    getBillingProviderAdapter: input.getBillingProviderAdapter,
    now: input.now,
  };
}
