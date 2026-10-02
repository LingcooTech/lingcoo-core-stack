import type { BillingRepositoryFactory } from '../billing/public';
import type { DeploymentRepositoryFactory } from '../deployment/public';
import type { EventServiceFactory } from '../event/public';
import type { InstallRepositoryFactory } from '../install/public';

export interface TicketDependencies {
  readonly createBillingAccess: (
    ...args: Parameters<BillingRepositoryFactory>
  ) => Pick<ReturnType<BillingRepositoryFactory>, 'findOrderByOrderNo' | 'listOrdersByIds'>;
  readonly createDeploymentAccess: (
    ...args: Parameters<DeploymentRepositoryFactory>
  ) => Pick<ReturnType<DeploymentRepositoryFactory>, 'findDeploymentById' | 'listDeploymentsByIds'>;
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly createInstallAccess: (
    ...args: Parameters<InstallRepositoryFactory>
  ) => Pick<
    ReturnType<InstallRepositoryFactory>,
    'findInstallByExtensionInstallId' | 'listInstallsByIds'
  >;
  readonly now: () => Date;
}
export function pickTicketDependencies(input: TicketDependencies): TicketDependencies {
  return {
    createBillingAccess: (...args) => {
      const port = input.createBillingAccess(...args);
      return {
        findOrderByOrderNo: port.findOrderByOrderNo.bind(port),
        listOrdersByIds: port.listOrdersByIds.bind(port),
      };
    },
    createDeploymentAccess: (...args) => {
      const port = input.createDeploymentAccess(...args);
      return {
        findDeploymentById: port.findDeploymentById.bind(port),
        listDeploymentsByIds: port.listDeploymentsByIds.bind(port),
      };
    },
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    createInstallAccess: (...args) => {
      const port = input.createInstallAccess(...args);
      return {
        findInstallByExtensionInstallId: port.findInstallByExtensionInstallId.bind(port),
        listInstallsByIds: port.listInstallsByIds.bind(port),
      };
    },
    now: input.now,
  };
}
