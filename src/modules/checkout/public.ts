import type { DbExecutor } from '../../db/types';

import type { CheckoutRepository } from './repository';

export type CheckoutRepositoryPort = Pick<
  CheckoutRepository,
  | 'listPaymentAttemptsByOrderIds'
  | 'listSessionsByOrderIds'
  | 'markPaymentAttemptsCancelledByOrderId'
  | 'markPaymentAttemptsPaidByOrderId'
  | 'markSessionCancelledByOrderId'
  | 'markSessionPaidByOrderId'
>;
export type CheckoutRepositoryFactory = (db: DbExecutor) => CheckoutRepositoryPort;
