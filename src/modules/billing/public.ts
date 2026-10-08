import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import type { BillingRepository } from './repository';
import type { BillingService } from './service';

export type BillingRepositoryPort = Pick<
  BillingRepository,
  | 'findOrderById'
  | 'findOrderByOrderNo'
  | 'listOrders'
  | 'listOrdersByIds'
  | 'listRecentOrdersByUserId'
  | 'listWebhookEvents'
>;
export type BillingRepositoryFactory = (db: DbExecutor) => BillingRepositoryPort;

export type BillingServicePort = Pick<
  BillingService,
  | 'cancelOrderByOrderNo'
  | 'createOrder'
  | 'listProviders'
  | 'reconcileRefundByOrderNo'
  | 'refundOrderByOrderNo'
  | 'syncOrderStatusByOrderNo'
>;
export type BillingServiceFactory = (db: DbExecutor, env: AppEnv) => BillingServicePort;

export type { PreparedPayment } from './providers/types';

export { billingProviderSchema } from './schemas';

export { HostingPurchases } from './hosting-purchases';
