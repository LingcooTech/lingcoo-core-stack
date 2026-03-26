import type { AppEnv } from '../../../lib/env';

export type PreparedPayment = {
  provider: 'wechat_pay' | 'alipay';
  orderNo: string;
  amount: number;
  currency: string;
  mode: 'native_qr' | 'page_redirect';
  configured: boolean;
  integrationStatus: 'stub';
  notifyUrl: string | null;
  nextStep: string;
};

export type ProviderContext = {
  env: AppEnv;
  order: {
    orderNo: string;
    amount: number;
    currency: string;
  };
};

export interface BillingProviderAdapter {
  code: 'wechat_pay' | 'alipay';
  isConfigured(env?: AppEnv): boolean;
  preparePayment(context: ProviderContext): PreparedPayment;
}
