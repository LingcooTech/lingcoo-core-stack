import { getBillingProviderAdapter } from '../modules/billing/providers';
import { deleteAppDeliverySettings } from '../modules/deployment/public';
import { deleteLegacyDeliverySettings } from '../modules/settings/public';
import type { LicenseRepositoryFactory } from '../modules/license/public';
import { LicenseRepository } from '../modules/license/repository';
import type { BillingRepositoryFactory } from '../modules/billing/public';
import { BillingRepository } from '../modules/billing/repository';
import type { CheckoutRepositoryFactory } from '../modules/checkout/public';
import { CheckoutRepository } from '../modules/checkout/repository';
import type { DeploymentRepositoryFactory } from '../modules/deployment/public';
import { DeploymentRepository } from '../modules/deployment/repository';
import type { InstallRepositoryFactory } from '../modules/install/public';
import { InstallRepository } from '../modules/install/repository';
import type { AppServiceFactory } from '../modules/app/public';
import { AppService } from '../modules/app/service';
import type { BillingServiceFactory } from '../modules/billing/public';
import { BillingService } from '../modules/billing/service';
import type { EventServiceFactory } from '../modules/event/public';
import { EventService } from '../modules/event/service';
import type { LicenseServiceFactory } from '../modules/license/public';
import { LicenseService } from '../modules/license/service';
import type { NotificationsServiceFactory } from '../modules/notifications/public';
import { NotificationsService } from '../modules/notifications/service';
import type { TicketServiceFactory } from '../modules/ticket/public';
import { TicketService } from '../modules/ticket/service';
export interface ServiceFactories {
  now: () => Date;
  getBillingProviderAdapter: typeof getBillingProviderAdapter;
  deleteAppDeliverySettings: typeof deleteAppDeliverySettings;
  deleteLegacyDeliverySettings: typeof deleteLegacyDeliverySettings;
  createLicenseAccess: LicenseRepositoryFactory;
  createBillingAccess: BillingRepositoryFactory;
  createCheckoutAccess: CheckoutRepositoryFactory;
  createDeploymentAccess: DeploymentRepositoryFactory;
  createInstallAccess: InstallRepositoryFactory;
  createAppService: AppServiceFactory;
  createBillingService: BillingServiceFactory;
  createEventService: EventServiceFactory;
  createLicenseService: LicenseServiceFactory;
  createNotificationsService: NotificationsServiceFactory;
  createTicketService: TicketServiceFactory;
}
export function createServiceFactories(
  overrides: Partial<ServiceFactories> = {},
): ServiceFactories {
  const factories: ServiceFactories = {
    now: () => new Date(),
    getBillingProviderAdapter,
    deleteAppDeliverySettings,
    deleteLegacyDeliverySettings,
    createLicenseAccess: (db) => {
      const value = new LicenseRepository(db);
      return {
        cancelEntitlementById: value.cancelEntitlementById.bind(value),
        cancelEntitlementsBySource: value.cancelEntitlementsBySource.bind(value),
        deactivateFeaturesByAppExceptCodes: value.deactivateFeaturesByAppExceptCodes.bind(value),
        deactivatePlansByAppExceptCodes: value.deactivatePlansByAppExceptCodes.bind(value),
        deactivatePlansByAppId: value.deactivatePlansByAppId.bind(value),
        deleteFeaturesByAppId: value.deleteFeaturesByAppId.bind(value),
        findEntitlementById: value.findEntitlementById.bind(value),
        getPlanById: value.getPlanById.bind(value),
        listEntitlements: value.listEntitlements.bind(value),
        listEntitlementsByIds: value.listEntitlementsByIds.bind(value),
        listEntitlementsBySource: value.listEntitlementsBySource.bind(value),
        listFeatures: value.listFeatures.bind(value),
        listFeaturesByAppId: value.listFeaturesByAppId.bind(value),
        listPlanFeatureMappings: value.listPlanFeatureMappings.bind(value),
        listPlansByAppId: value.listPlansByAppId.bind(value),
        listPlansByAppIds: value.listPlansByAppIds.bind(value),
        listPlansByIds: value.listPlansByIds.bind(value),
        listRecentEntitlementsByUserId: value.listRecentEntitlementsByUserId.bind(value),
        replacePlanFeatureMappings: value.replacePlanFeatureMappings.bind(value),
        updateEntitlementMeta: value.updateEntitlementMeta.bind(value),
        upsertFeature: value.upsertFeature.bind(value),
        upsertPlan: value.upsertPlan.bind(value),
      };
    },
    createBillingAccess: (db) => {
      const value = new BillingRepository(db);
      return {
        findOrderById: value.findOrderById.bind(value),
        findOrderByOrderNo: value.findOrderByOrderNo.bind(value),
        listOrders: value.listOrders.bind(value),
        listOrdersByIds: value.listOrdersByIds.bind(value),
        listRecentOrdersByUserId: value.listRecentOrdersByUserId.bind(value),
        listWebhookEvents: value.listWebhookEvents.bind(value),
      };
    },
    createCheckoutAccess: (db) => {
      const value = new CheckoutRepository(db);
      return {
        listPaymentAttemptsByOrderIds: value.listPaymentAttemptsByOrderIds.bind(value),
        listSessionsByOrderIds: value.listSessionsByOrderIds.bind(value),
        markPaymentAttemptsCancelledByOrderId:
          value.markPaymentAttemptsCancelledByOrderId.bind(value),
        markPaymentAttemptsPaidByOrderId: value.markPaymentAttemptsPaidByOrderId.bind(value),
        markSessionCancelledByOrderId: value.markSessionCancelledByOrderId.bind(value),
        markSessionPaidByOrderId: value.markSessionPaidByOrderId.bind(value),
      };
    },
    createDeploymentAccess: (db) => {
      const value = new DeploymentRepository(db);
      return {
        findDeploymentById: value.findDeploymentById.bind(value),
        listDeploymentsByIds: value.listDeploymentsByIds.bind(value),
      };
    },
    createInstallAccess: (db) => {
      const value = new InstallRepository(db);
      return {
        findInstallByExtensionInstallId: value.findInstallByExtensionInstallId.bind(value),
        listInstalls: value.listInstalls.bind(value),
        listInstallsByIds: value.listInstallsByIds.bind(value),
        listRecentInstallsByUserId: value.listRecentInstallsByUserId.bind(value),
      };
    },
    createAppService: (db, env) => {
      const value = new AppService(factories, db, env);
      return {
        getPublicApp: value.getPublicApp.bind(value),
        listUserEntitlementsForApp: value.listUserEntitlementsForApp.bind(value),
        requireActiveApp: value.requireActiveApp.bind(value),
        requireActiveSecretById: value.requireActiveSecretById.bind(value),
        resolveCheckoutOffer: value.resolveCheckoutOffer.bind(value),
      };
    },
    createBillingService: (db, env) => {
      const value = new BillingService(factories, db, env);
      return {
        cancelOrderByOrderNo: value.cancelOrderByOrderNo.bind(value),
        createOrder: value.createOrder.bind(value),
        listProviders: value.listProviders.bind(value),
        reconcileRefundByOrderNo: value.reconcileRefundByOrderNo.bind(value),
        refundOrderByOrderNo: value.refundOrderByOrderNo.bind(value),
        syncOrderStatusByOrderNo: value.syncOrderStatusByOrderNo.bind(value),
      };
    },
    createEventService: (db) => {
      const value = new EventService(factories, db);
      return {
        capture: value.capture.bind(value),
        loadProjectionEvents: value.loadProjectionEvents.bind(value),
      };
    },
    createLicenseService: (db) => {
      const value = new LicenseService(factories, db);
      return {
        findActiveOneTimeOwnership: value.findActiveOneTimeOwnership.bind(value),
        getPlanForCheckout: value.getPlanForCheckout.bind(value),
        grantEntitlementsForPlan: value.grantEntitlementsForPlan.bind(value),
        listUserEntitlements: value.listUserEntitlements.bind(value),
        listUserEntitlementsByAppId: value.listUserEntitlementsByAppId.bind(value),
      };
    },
    createNotificationsService: (db) => {
      const value = new NotificationsService(factories, db);
      return { projectFromEvents: value.projectFromEvents.bind(value) };
    },
    createTicketService: (db) => {
      const value = new TicketService(factories, db);
      return { listRecentTicketsByUserId: value.listRecentTicketsByUserId.bind(value) };
    },
  };
  Object.assign(factories, overrides);
  return factories;
}
