import { createDecipheriv, createSign, createVerify, randomBytes } from 'node:crypto';

import { httpError } from '../../../lib/errors';
import {
  getHeaderValue,
  normalizeObject,
  readSecretValue,
  resolveCallbackUrl
} from './shared';
import type {
  BillingProviderAdapter,
  PaymentNotificationResult,
  PreparedPayment,
  ProviderContext,
  ProviderNotificationContext
} from './types';

type WechatNotificationEnvelope = {
  id?: string;
  event_type?: string;
  resource?: {
    algorithm?: string;
    ciphertext?: string;
    associated_data?: string;
    nonce?: string;
    original_type?: string;
  };
};

type WechatTransaction = {
  mchid?: string;
  appid?: string;
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  success_time?: string;
  amount?: {
    total?: number;
    currency?: string;
  };
};

export class WechatPayProvider implements BillingProviderAdapter {
  code = 'wechat_pay' as const;

  isConfigured(context?: ProviderContext['env']) {
    if (!context) {
      return false;
    }

    return Boolean(
      context.WECHAT_PAY_MCH_ID &&
        context.WECHAT_PAY_APP_ID &&
        context.WECHAT_PAY_CERT_SERIAL_NO &&
        context.WECHAT_PAY_API_V3_KEY &&
        (context.WECHAT_PAY_PRIVATE_KEY || context.WECHAT_PAY_PRIVATE_KEY_PATH) &&
        (context.WECHAT_PAY_PLATFORM_CERT || context.WECHAT_PAY_PLATFORM_CERT_PATH)
    );
  }

  private getApiBaseUrl(context: ProviderContext['env']) {
    return context.WECHAT_PAY_API_BASE_URL?.trim() || 'https://api.mch.weixin.qq.com';
  }

  private getApiV3Key(context: ProviderContext['env']) {
    const value = context.WECHAT_PAY_API_V3_KEY?.trim();
    if (!value) {
      throw httpError(422, 'WECHAT_PAY_API_V3_KEY is not configured');
    }

    if (Buffer.byteLength(value, 'utf8') !== 32) {
      throw httpError(422, 'WECHAT_PAY_API_V3_KEY must be exactly 32 bytes');
    }

    return value;
  }

  private createAuthorizationHeader(input: {
    env: ProviderContext['env'];
    method: string;
    url: URL;
    body: string;
  }) {
    const privateKey = readSecretValue({
      inlineValue: input.env.WECHAT_PAY_PRIVATE_KEY,
      filePath: input.env.WECHAT_PAY_PRIVATE_KEY_PATH,
      label: 'WECHAT_PAY_PRIVATE_KEY'
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const message = `${input.method}\n${input.url.pathname}${input.url.search}\n${timestamp}\n${nonce}\n${input.body}\n`;
    const signature = createSign('RSA-SHA256').update(message).end().sign(privateKey, 'base64');

    return `WECHATPAY2-SHA256-RSA2048 mchid="${input.env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${input.env.WECHAT_PAY_CERT_SERIAL_NO}"`;
  }

  private verifyNotificationSignature(context: ProviderNotificationContext) {
    const timestamp = getHeaderValue(context.headers, 'wechatpay-timestamp');
    const nonce = getHeaderValue(context.headers, 'wechatpay-nonce');
    const signature = getHeaderValue(context.headers, 'wechatpay-signature');
    const rawBody = typeof context.rawBody === 'string' ? context.rawBody : context.rawBody?.toString('utf8') ?? '';

    if (!timestamp || !nonce || !signature || !rawBody) {
      throw httpError(400, 'Incomplete WeChat Pay callback headers');
    }

    const platformCert = readSecretValue({
      inlineValue: context.env.WECHAT_PAY_PLATFORM_CERT,
      filePath: context.env.WECHAT_PAY_PLATFORM_CERT_PATH,
      label: 'WECHAT_PAY_PLATFORM_CERT'
    });
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const verified = createVerify('RSA-SHA256').update(message).end().verify(platformCert, signature, 'base64');

    if (!verified) {
      throw httpError(400, 'Invalid WeChat Pay callback signature');
    }

    return rawBody;
  }

  private decryptNotificationResource(
    context: ProviderNotificationContext,
    resource: NonNullable<WechatNotificationEnvelope['resource']>
  ) {
    if (resource.algorithm !== 'AEAD_AES_256_GCM') {
      throw httpError(400, `Unsupported WeChat Pay encrypt algorithm: ${resource.algorithm ?? 'unknown'}`);
    }

    if (!resource.ciphertext || !resource.nonce) {
      throw httpError(400, 'Missing encrypted WeChat Pay callback payload');
    }

    const ciphertextBuffer = Buffer.from(resource.ciphertext, 'base64');
    const authTag = ciphertextBuffer.subarray(ciphertextBuffer.length - 16);
    const encrypted = ciphertextBuffer.subarray(0, ciphertextBuffer.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.getApiV3Key(context.env), 'utf8'),
      Buffer.from(resource.nonce, 'utf8')
    );

    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    }

    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  async preparePayment(context: ProviderContext): Promise<PreparedPayment> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'WeChat Pay only supports CNY in this MVP');
    }

    const notifyUrl = resolveCallbackUrl(
      context.env.WECHAT_PAY_NOTIFY_URL,
      context.env.PUBLIC_BASE_URL,
      '/v1/billing/providers/wechat/notify'
    );
    const requestBody = JSON.stringify({
      appid: context.env.WECHAT_PAY_APP_ID,
      mchid: context.env.WECHAT_PAY_MCH_ID,
      description: context.order.subject,
      out_trade_no: context.order.orderNo,
      notify_url: notifyUrl,
      amount: {
        total: context.order.amount,
        currency: context.order.currency
      }
    });
    const url = new URL('/v3/pay/transactions/native', this.getApiBaseUrl(context.env));
    const authorization = this.createAuthorizationHeader({
      env: context.env,
      method: 'POST',
      url,
      body: requestBody
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json'
      },
      body: requestBody,
      signal: AbortSignal.timeout(10_000)
    });
    const responseText = await response.text();
    let responseData: Record<string, unknown> = {};

    if (responseText) {
      try {
        responseData = normalizeObject(JSON.parse(responseText));
      } catch {
        throw httpError(502, `WeChat Pay returned a non-JSON response: ${responseText}`);
      }
    }

    const codeUrl = typeof responseData.code_url === 'string' ? responseData.code_url : '';

    if (!response.ok || !codeUrl) {
      throw httpError(
        502,
        `WeChat Pay create order failed: ${response.status} ${responseText || 'empty response'}`
      );
    }

    return {
      provider: this.code,
      orderNo: context.order.orderNo,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'native_qr',
      configured: true,
      integrationStatus: 'live',
      notifyUrl,
      nextStep:
        'Render payload.codeUrl as a QR code. The order is activated after the WeChat Pay callback marks it as paid.',
      payload: {
        codeUrl,
        qrCodeText: codeUrl
      }
    };
  }

  async parseNotification(context: ProviderNotificationContext): Promise<PaymentNotificationResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    const rawBody = this.verifyNotificationSignature(context);
    const envelope = normalizeObject(JSON.parse(rawBody)) as WechatNotificationEnvelope;
    const providerEventId = typeof envelope.id === 'string' ? envelope.id : `wechat_${Date.now()}`;

    if (envelope.event_type !== 'TRANSACTION.SUCCESS') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId,
        payload: envelope,
        reason: `Unhandled WeChat event type: ${envelope.event_type ?? 'unknown'}`
      };
    }

    if (!envelope.resource) {
      throw httpError(400, 'Missing WeChat Pay callback resource payload');
    }

    const decryptedPayload = this.decryptNotificationResource(context, envelope.resource);
    const transaction = normalizeObject(JSON.parse(decryptedPayload)) as WechatTransaction;

    if (transaction.mchid !== context.env.WECHAT_PAY_MCH_ID) {
      throw httpError(400, 'WeChat Pay merchant id mismatch');
    }

    if (transaction.appid !== context.env.WECHAT_PAY_APP_ID) {
      throw httpError(400, 'WeChat Pay app id mismatch');
    }

    if (transaction.trade_state !== 'SUCCESS') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId,
        payload: {
          envelope,
          transaction
        },
        reason: `Unhandled WeChat trade state: ${transaction.trade_state ?? 'unknown'}`
      };
    }

    if (!transaction.out_trade_no || !transaction.transaction_id) {
      throw httpError(400, 'Missing WeChat Pay order identifiers');
    }

    if (typeof transaction.amount?.total !== 'number') {
      throw httpError(400, 'Missing WeChat Pay amount.total');
    }

    return {
      kind: 'paid',
      provider: this.code,
      providerEventId,
      orderNo: transaction.out_trade_no,
      providerOrderId: transaction.transaction_id,
      amount: transaction.amount.total,
      currency: transaction.amount.currency ?? 'CNY',
      paidAt: transaction.success_time ? new Date(transaction.success_time) : new Date(),
      payload: {
        envelope,
        transaction
      }
    };
  }
}
