import type { BillingRepositoryFactory } from '../billing/public';
import type { BillingServiceFactory } from '../billing/public';
import type { CheckoutRepositoryFactory } from '../checkout/public';
import type { EventServiceFactory } from '../event/public';
import type { InstallRepositoryFactory } from '../install/public';
import type { LicenseRepositoryFactory } from '../license/public';
import type { LicenseServiceFactory } from '../license/public';
import type { TicketServiceFactory } from '../ticket/public';

export interface AdminDependencies {
  readonly createBillingAccess: (
    ...args: Parameters<BillingRepositoryFactory>
  ) => Pick<
    ReturnType<BillingRepositoryFactory>,
    | 'findOrderByOrderNo'
    | 'listOrders'
    | 'listOrdersByIds'
    | 'listRecentOrdersByUserId'
    | 'listWebhookEvents'
  >;
  readonly createBillingService: (
    ...args: Parameters<BillingServiceFactory>
  ) => Pick<
    ReturnType<BillingServiceFactory>,
    'cancelOrderByOrderNo' | 'refundOrderByOrderNo' | 'syncOrderStatusByOrderNo'
  >;
  readonly createCheckoutAccess: (
    ...args: Parameters<CheckoutRepositoryFactory>
  ) => Pick<
    ReturnType<CheckoutRepositoryFactory>,
    'listPaymentAttemptsByOrderIds' | 'listSessionsByOrderIds'
  >;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createInstallAccess: (
    ...args: Parameters<InstallRepositoryFactory>
  ) => Pick<
    ReturnType<InstallRepositoryFactory>,
    'listInstalls' | 'listInstallsByIds' | 'listRecentInstallsByUserId'
  >;
  readonly createLicenseAccess: (
    ...args: Parameters<LicenseRepositoryFactory>
  ) => Pick<
    ReturnType<LicenseRepositoryFactory>,
    | 'cancelEntitlementById'
    | 'cancelEntitlementsBySource'
    | 'findEntitlementById'
    | 'getPlanById'
    | 'listEntitlements'
    | 'listEntitlementsBySource'
    | 'listPlansByIds'
    | 'listRecentEntitlementsByUserId'
  >;
  readonly createLicenseService: (
    ...args: Parameters<LicenseServiceFactory>
  ) => Pick<ReturnType<LicenseServiceFactory>, 'getPlanForCheckout' | 'grantEntitlementsForPlan'>;
  readonly createTicketService: (
    ...args: Parameters<TicketServiceFactory>
  ) => Pick<ReturnType<TicketServiceFactory>, 'listRecentTicketsByUserId'>;
}
export function pickAdminDependencies(input: AdminDependencies): AdminDependencies {
  return {
    createBillingAccess: (...args) => {
      const port = input.createBillingAccess(...args);
      return {
        findOrderByOrderNo: port.findOrderByOrderNo.bind(port),
        listOrders: port.listOrders.bind(port),
        listOrdersByIds: port.listOrdersByIds.bind(port),
        listRecentOrdersByUserId: port.listRecentOrdersByUserId.bind(port),
        listWebhookEvents: port.listWebhookEvents.bind(port),
      };
    },
    createBillingService: (...args) => {
      const port = input.createBillingService(...args);
      return {
        cancelOrderByOrderNo: port.cancelOrderByOrderNo.bind(port),
        refundOrderByOrderNo: port.refundOrderByOrderNo.bind(port),
        syncOrderStatusByOrderNo: port.syncOrderStatusByOrderNo.bind(port),
      };
    },
    createCheckoutAccess: (...args) => {
      const port = input.createCheckoutAccess(...args);
      return {
        listPaymentAttemptsByOrderIds: port.listPaymentAttemptsByOrderIds.bind(port),
        listSessionsByOrderIds: port.listSessionsByOrderIds.bind(port),
      };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createInstallAccess: (...args) => {
      const port = input.createInstallAccess(...args);
      return {
        listInstalls: port.listInstalls.bind(port),
        listInstallsByIds: port.listInstallsByIds.bind(port),
        listRecentInstallsByUserId: port.listRecentInstallsByUserId.bind(port),
      };
    },
    createLicenseAccess: (...args) => {
      const port = input.createLicenseAccess(...args);
      return {
        cancelEntitlementById: port.cancelEntitlementById.bind(port),
        cancelEntitlementsBySource: port.cancelEntitlementsBySource.bind(port),
        findEntitlementById: port.findEntitlementById.bind(port),
        getPlanById: port.getPlanById.bind(port),
        listEntitlements: port.listEntitlements.bind(port),
        listEntitlementsBySource: port.listEntitlementsBySource.bind(port),
        listPlansByIds: port.listPlansByIds.bind(port),
        listRecentEntitlementsByUserId: port.listRecentEntitlementsByUserId.bind(port),
      };
    },
    createLicenseService: (...args) => {
      const port = input.createLicenseService(...args);
      return {
        getPlanForCheckout: port.getPlanForCheckout.bind(port),
        grantEntitlementsForPlan: port.grantEntitlementsForPlan.bind(port),
      };
    },
    createTicketService: (...args) => {
      const port = input.createTicketService(...args);
      return { listRecentTicketsByUserId: port.listRecentTicketsByUserId.bind(port) };
    },
  };
}
