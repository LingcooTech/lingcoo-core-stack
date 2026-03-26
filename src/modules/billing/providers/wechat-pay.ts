import type { BillingProviderAdapter, PreparedPayment, ProviderContext } from './types';

export class WechatPayProvider implements BillingProviderAdapter {
  code = 'wechat_pay' as const;

  isConfigured(context?: ProviderContext['env']) {
    if (!context) {
      return false;
    }

    return Boolean(
      context.WECHAT_PAY_MCH_ID &&
        context.WECHAT_PAY_CERT_SERIAL_NO &&
        context.WECHAT_PAY_API_V3_KEY &&
        context.WECHAT_PAY_PRIVATE_KEY_PATH
    );
  }

  preparePayment(context: ProviderContext): PreparedPayment {
    return {
      provider: this.code,
      orderNo: context.order.orderNo,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'native_qr',
      configured: this.isConfigured(context.env),
      integrationStatus: 'stub',
      notifyUrl: context.env.WECHAT_PAY_NOTIFY_URL || null,
      nextStep:
        'Replace this stub with the official WeChat Pay API v3 prepay request, signature generation, and callback verification.'
    };
  }
}
