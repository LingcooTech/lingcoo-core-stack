import type { AppEnv } from '../../../lib/env';

export type BillingProviderCode = 'wechat_pay' | 'alipay';

export type PreparedPayment = {
  provider: BillingProviderCode;
  orderNo: string;
  amount: number;
  currency: string;
  mode: 'native_qr' | 'page_redirect';
  configured: boolean;
  integrationStatus: 'live';
  notifyUrl: string;
  nextStep: string;
  payload: Record<string, unknown>;
};

export type ProviderContext = {
  env: AppEnv;
  clientIp?: string;
  order: {
    orderNo: string;
    subject: string;
    amount: number;
    currency: string;
  };
};

export type ProviderNotificationContext = {
  env: AppEnv;
  headers: Record<string, unknown>;
  rawBody?: string | Buffer;
  body: unknown;
};

export type ProviderQueryContext = {
  env: AppEnv;
  order: {
    orderNo: string;
    providerOrderId?: string | null;
    amount: number;
    currency: string;
  };
};

export type PaymentNotificationResult =
  | {
      kind: 'paid';
      provider: BillingProviderCode;
      providerEventId: string;
      orderNo: string;
      providerOrderId: string;
      amount: number;
      currency: string;
      paidAt: Date;
      payload: Record<string, unknown>;
    }
  | {
      kind: 'ignored';
      provider: BillingProviderCode;
      providerEventId: string;
      payload: Record<string, unknown>;
      reason: string;
    };

export type PaymentQueryResult =
  | {
      kind: 'paid';
      provider: BillingProviderCode;
      orderNo: string;
      providerOrderId: string;
      amount: number;
      currency: string;
      paidAt: Date;
      payload: Record<string, unknown>;
    }
  | {
      kind: 'pending' | 'closed' | 'not_found';
      provider: BillingProviderCode;
      orderNo: string;
      providerOrderId?: string | null;
      payload: Record<string, unknown>;
      reason: string;
    };

export type PaymentCloseResult =
  | {
      kind: 'closed';
      provider: BillingProviderCode;
      orderNo: string;
      providerOrderId?: string | null;
      payload: Record<string, unknown>;
      reason: string;
    }
  | {
      kind: 'not_found' | 'not_closable';
      provider: BillingProviderCode;
      orderNo: string;
      providerOrderId?: string | null;
      payload: Record<string, unknown>;
      reason: string;
    };

export type PaymentRefundResult =
  | {
      kind: 'refunded';
      provider: BillingProviderCode;
      orderNo: string;
      providerOrderId?: string | null;
      refundId?: string | null;
      amount: number;
      currency: string;
      refundedAt: Date;
      payload: Record<string, unknown>;
      reason: string;
    }
  | {
      kind: 'not_found' | 'not_refundable';
      provider: BillingProviderCode;
      orderNo: string;
      providerOrderId?: string | null;
      payload: Record<string, unknown>;
      reason: string;
    };

export interface BillingProviderAdapter {
  code: BillingProviderCode;
  isConfigured(env?: AppEnv): boolean;
  preparePayment(context: ProviderContext): Promise<PreparedPayment>;
  parseNotification(context: ProviderNotificationContext): Promise<PaymentNotificationResult>;
  queryPayment(context: ProviderQueryContext): Promise<PaymentQueryResult>;
  closePayment(context: ProviderQueryContext): Promise<PaymentCloseResult>;
  refundPayment(context: ProviderQueryContext): Promise<PaymentRefundResult>;
}
