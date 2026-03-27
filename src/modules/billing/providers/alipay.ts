import { AlipaySdk } from 'alipay-sdk';

import { httpError } from '../../../lib/errors';
import {
  amountFenToYuanString,
  amountYuanStringToFen,
  normalizeFormBody,
  parseRawFormBody,
  readSecretFile,
  resolveCallbackUrl
} from './shared';
import type {
  BillingProviderAdapter,
  PaymentNotificationResult,
  PreparedPayment,
  ProviderContext,
  ProviderNotificationContext
} from './types';

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

  private getSdk(context: ProviderContext['env'] | ProviderNotificationContext['env']) {
    return new AlipaySdk({
      appId: context.ALIPAY_APP_ID!,
      privateKey: readSecretFile(context.ALIPAY_PRIVATE_KEY_PATH, 'ALIPAY_PRIVATE_KEY_PATH'),
      alipayPublicKey: readSecretFile(context.ALIPAY_PUBLIC_KEY_PATH, 'ALIPAY_PUBLIC_KEY_PATH'),
      gateway: context.ALIPAY_GATEWAY?.trim() || undefined,
      keyType: context.ALIPAY_KEY_TYPE ?? 'PKCS1'
    });
  }

  async preparePayment(context: ProviderContext): Promise<PreparedPayment> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'Alipay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'Alipay only supports CNY in this MVP');
    }

    const notifyUrl = resolveCallbackUrl(
      context.env.ALIPAY_NOTIFY_URL,
      context.env.PUBLIC_BASE_URL,
      '/v1/billing/providers/alipay/notify'
    );
    const checkoutUrl = this.getSdk(context.env).pageExecute('alipay.trade.page.pay', 'GET', {
      notifyUrl,
      returnUrl: context.env.ALIPAY_RETURN_URL?.trim() || undefined,
      bizContent: {
        out_trade_no: context.order.orderNo,
        product_code: 'FAST_INSTANT_TRADE_PAY',
        subject: context.order.subject,
        body: context.order.subject,
        total_amount: amountFenToYuanString(context.order.amount)
      }
    });

    return {
      provider: this.code,
      orderNo: context.order.orderNo,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'page_redirect',
      configured: true,
      integrationStatus: 'live',
      notifyUrl,
      nextStep:
        'Open payload.checkoutUrl in a browser or extension tab. The order is activated after the Alipay async notify callback arrives.',
      payload: {
        checkoutUrl
      }
    };
  }

  async parseNotification(context: ProviderNotificationContext): Promise<PaymentNotificationResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'Alipay is not configured');
    }

    const rawBody = typeof context.rawBody === 'string' ? context.rawBody : context.rawBody?.toString('utf8') ?? '';
    if (!rawBody) {
      throw httpError(400, 'Missing Alipay callback body');
    }

    const rawForm = parseRawFormBody(rawBody);
    const verified = this.getSdk(context.env).checkNotifySignV2(rawForm);
    if (!verified) {
      throw httpError(400, 'Invalid Alipay callback signature');
    }

    const form = normalizeFormBody(context.body);
    const providerEventId = form.notify_id || form.trade_no || form.out_trade_no || `alipay_${Date.now()}`;

    if (form.app_id && form.app_id !== context.env.ALIPAY_APP_ID) {
      throw httpError(400, 'Alipay app id mismatch');
    }

    if (form.trade_status !== 'TRADE_SUCCESS' && form.trade_status !== 'TRADE_FINISHED') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId,
        payload: form,
        reason: `Unhandled Alipay trade status: ${form.trade_status ?? 'unknown'}`
      };
    }

    if (!form.out_trade_no || !form.trade_no || !form.total_amount) {
      throw httpError(400, 'Missing Alipay payment fields');
    }

    return {
      kind: 'paid',
      provider: this.code,
      providerEventId,
      orderNo: form.out_trade_no,
      providerOrderId: form.trade_no,
      amount: amountYuanStringToFen(form.total_amount),
      currency: 'CNY',
      paidAt: form.gmt_payment ? new Date(form.gmt_payment) : new Date(),
      payload: form
    };
  }
}
