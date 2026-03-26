import type { BillingProviderAdapter, PreparedPayment, ProviderContext } from './types';

export class AlipayProvider implements BillingProviderAdapter {
  code = 'alipay' as const;

  isConfigured(context?: ProviderContext['env']) {
    if (!context) {
      return false;
    }

    return Boolean(
      context.ALIPAY_APP_ID &&
        context.ALIPAY_PRIVATE_KEY_PATH &&
        context.ALIPAY_PUBLIC_KEY_PATH
    );
  }

  preparePayment(context: ProviderContext): PreparedPayment {
    return {
      provider: this.code,
      orderNo: context.order.orderNo,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'page_redirect',
      configured: this.isConfigured(context.env),
      integrationStatus: 'stub',
      notifyUrl: context.env.ALIPAY_NOTIFY_URL || null,
      nextStep:
        'Replace this stub with the official Alipay trade create / page pay flow and callback signature verification.'
    };
  }
}
