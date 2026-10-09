import { createDecipheriv, createSign, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { resolveRefund, verifyWechatRefund, verifyWechatRefundSignature } from './refunds';
import { httpError } from '../../../lib/errors';
import { normalizeObject, readSecretValue, resolveCallbackUrl } from './shared';
import type {
  BillingProviderAdapter,
  PaymentRefundResult,
  PaymentRefundQueryResult,
  PaymentNotificationResult,
  PaymentQueryResult,
  PaymentCloseResult,
  PreparedPayment,
  ProviderContext,
  ProviderNotificationContext,
  ProviderRefundQueryContext,
  ProviderRefundContext,
  ProviderQueryContext,
} from './types';

const WECHAT_REFUND_API_PATH = '/v3/refund/domestic/refunds';
const WECHAT_REFUND_QUERY_API_PATH = WECHAT_REFUND_API_PATH;
const transactionSchema = z.object({
  appid: z.string().min(1),
  mchid: z.string().min(1),
  out_trade_no: z.string().min(1),
  transaction_id: z.string().optional(),
  trade_state: z.string().min(1),
  success_time: z.iso.datetime({ offset: true }).optional(),
  amount: z.object({ total: z.number().int().positive(), currency: z.literal('CNY') }),
});
const notificationSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource_type: z.literal('encrypt-resource'),
  resource: z.object({
    algorithm: z.literal('AEAD_AES_256_GCM'),
    ciphertext: z.string().min(24),
    nonce: z.string().length(12),
    associated_data: z.string().optional(),
  }),
});

/** Direct-merchant V3, following Retail Native payment and Edu signature verification. */
export class WechatPayProvider implements BillingProviderAdapter {
  code = 'wechat_pay' as const;
  isConfigured(env?: ProviderContext['env']) {
    if (!env) return false;
    return Boolean(
      env.WECHAT_PAY_MCH_ID &&
      env.WECHAT_PAY_APP_ID &&
      env.WECHAT_PAY_API_V3_KEY &&
      Buffer.byteLength(env.WECHAT_PAY_API_V3_KEY) === 32 &&
      env.WECHAT_PAY_CERT_SERIAL_NO &&
      (env.WECHAT_PAY_PRIVATE_KEY || env.WECHAT_PAY_PRIVATE_KEY_PATH) &&
      (env.WECHAT_PAY_PLATFORM_CERT || env.WECHAT_PAY_PLATFORM_CERT_PATH) &&
      env.WECHAT_PAY_PUBLIC_KEY_ID,
    );
  }
  private getApiBaseUrl(env: ProviderContext['env']) {
    return env.WECHAT_PAY_API_BASE_URL?.trim() || 'https://api.mch.weixin.qq.com';
  }
  private getNotifyUrl(env: ProviderContext['env']) {
    return resolveCallbackUrl(
      env.WECHAT_PAY_NOTIFY_URL,
      env.PUBLIC_BASE_URL,
      '/v1/billing/providers/wechat/notify',
    );
  }
  private getMerchantPrivateKey(env: ProviderContext['env']) {
    return readSecretValue({
      inlineValue: env.WECHAT_PAY_PRIVATE_KEY?.replaceAll('\\n', '\n'),
      filePath: env.WECHAT_PAY_PRIVATE_KEY_PATH,
      label: 'WECHAT_PAY_PRIVATE_KEY',
    });
  }
  private verificationKey(env: ProviderContext['env']) {
    return readSecretValue({
      inlineValue: env.WECHAT_PAY_PLATFORM_CERT?.replaceAll('\\n', '\n'),
      filePath: env.WECHAT_PAY_PLATFORM_CERT_PATH,
      label: 'WECHAT_PAY_PLATFORM_CERT',
    });
  }
  private verifyResponse(env: ProviderContext['env'], headers: Headers, body: string) {
    const expected = env.WECHAT_PAY_PUBLIC_KEY_ID?.trim();
    if (!expected || headers.get('wechatpay-serial') !== expected)
      throw httpError(400, 'WeChat Pay verification key ID mismatch');
    verifyWechatRefundSignature(headers, body, this.verificationKey(env));
  }
  private buildV3Authorization(input: {
    env: ProviderContext['env'];
    method: 'GET' | 'POST';
    pathname: string;
    body: string;
  }) {
    const nonce = randomBytes(16).toString('hex'),
      timestamp = String(Math.floor(Date.now() / 1000));
    const signer = createSign('RSA-SHA256');
    signer.update(`${input.method}\n${input.pathname}\n${timestamp}\n${nonce}\n${input.body}\n`);
    signer.end();
    return `WECHATPAY2-SHA256-RSA2048 mchid="${input.env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",signature="${signer.sign(this.getMerchantPrivateKey(input.env), 'base64')}",timestamp="${timestamp}",serial_no="${input.env.WECHAT_PAY_CERT_SERIAL_NO}"`;
  }
  private async request(
    env: ProviderContext['env'],
    method: 'GET' | 'POST',
    pathname: string,
    value?: unknown,
  ) {
    if (!this.isConfigured(env)) throw httpError(422, 'WeChat Pay V3 is not configured');
    const body = value === undefined ? '' : JSON.stringify(value);
    const response = await fetch(new URL(pathname, this.getApiBaseUrl(env)), {
      method,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: this.buildV3Authorization({ env, method, pathname, body }),
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    this.verifyResponse(env, response.headers, text);
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = z.record(z.string(), z.unknown()).parse(JSON.parse(text));
      } catch {
        throw httpError(502, 'Invalid WeChat Pay response');
      }
    }
    return { status: response.status, ok: response.ok, payload };
  }
  private transaction(
    env: ProviderContext['env'],
    payload: unknown,
    order?: ProviderQueryContext['order'],
  ) {
    const result = transactionSchema.safeParse(payload);
    if (!result.success) throw httpError(400, 'Invalid WeChat Pay transaction');
    const data = result.data;
    if (data.appid !== env.WECHAT_PAY_APP_ID || data.mchid !== env.WECHAT_PAY_MCH_ID)
      throw httpError(400, 'WeChat Pay merchant or app mismatch');
    if (
      order &&
      (data.out_trade_no !== order.orderNo ||
        data.amount.total !== order.amount ||
        data.amount.currency !== order.currency ||
        (order.providerOrderId &&
          data.transaction_id &&
          order.providerOrderId !== data.transaction_id))
    )
      throw httpError(400, 'WeChat Pay order mismatch');
    if (data.trade_state === 'SUCCESS' && (!data.transaction_id || !data.success_time))
      throw httpError(400, 'Missing WeChat Pay success fields');
    return data;
  }
  async preparePayment(context: ProviderContext): Promise<PreparedPayment> {
    if (
      context.order.currency !== 'CNY' ||
      !Number.isSafeInteger(context.order.amount) ||
      context.order.amount <= 0
    )
      throw httpError(422, 'Invalid WeChat Pay amount or currency');
    const notifyUrl = this.getNotifyUrl(context.env);
    const response = await this.request(context.env, 'POST', '/v3/pay/transactions/native', {
      appid: context.env.WECHAT_PAY_APP_ID,
      mchid: context.env.WECHAT_PAY_MCH_ID,
      description: context.order.subject.trim().slice(0, 120) || 'Lingcoo order',
      out_trade_no: context.order.orderNo,
      notify_url: notifyUrl,
      amount: { total: context.order.amount, currency: context.order.currency },
    });
    if (
      !response.ok ||
      typeof response.payload.code_url !== 'string' ||
      !response.payload.code_url.startsWith('weixin://wxpay/')
    )
      throw httpError(502, 'WeChat Pay create order failed');
    return {
      provider: this.code,
      orderNo: context.order.orderNo,
      amount: context.order.amount,
      currency: context.order.currency,
      mode: 'native_qr',
      configured: true,
      integrationStatus: 'live',
      notifyUrl,
      nextStep: 'Scan the QR code to pay.',
      payload: {
        codeUrl: response.payload.code_url,
        qrCodeText: response.payload.code_url,
        apiVersion: 'v3',
      },
    };
  }
  async parseNotification(
    context: ProviderNotificationContext,
  ): Promise<PaymentNotificationResult> {
    if (!this.isConfigured(context.env)) throw httpError(422, 'WeChat Pay V3 is not configured');
    const raw =
      typeof context.rawBody === 'string' ? context.rawBody : context.rawBody?.toString('utf8');
    if (!raw) throw httpError(400, 'Missing WeChat Pay callback body');
    const headers = new Headers();
    for (const [name, value] of Object.entries(context.headers))
      if (typeof value === 'string') headers.set(name, value);
    this.verifyResponse(context.env, headers, raw);
    let notification: z.infer<typeof notificationSchema>;
    try {
      notification = notificationSchema.parse(JSON.parse(raw));
    } catch {
      throw httpError(400, 'Invalid WeChat Pay notification');
    }
    let payload: Record<string, unknown>;
    try {
      const resource = notification.resource,
        ciphertext = Buffer.from(resource.ciphertext, 'base64');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(context.env.WECHAT_PAY_API_V3_KEY!),
        Buffer.from(resource.nonce),
      );
      decipher.setAuthTag(ciphertext.subarray(-16));
      decipher.setAAD(Buffer.from(resource.associated_data ?? ''));
      payload = z
        .record(z.string(), z.unknown())
        .parse(
          JSON.parse(
            Buffer.concat([
              decipher.update(ciphertext.subarray(0, -16)),
              decipher.final(),
            ]).toString('utf8'),
          ),
        );
    } catch {
      throw httpError(400, 'Invalid WeChat Pay encrypted resource');
    }
    if (notification.event_type !== 'TRANSACTION.SUCCESS')
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId: notification.id,
        payload,
        reason: 'Unsupported authenticated WeChat event',
      };
    const data = this.transaction(context.env, payload);
    if (data.trade_state !== 'SUCCESS') throw httpError(400, 'WeChat Pay event state mismatch');
    return {
      kind: 'paid',
      provider: this.code,
      providerEventId: notification.id,
      orderNo: data.out_trade_no,
      providerOrderId: data.transaction_id!,
      amount: data.amount.total,
      currency: data.amount.currency,
      paidAt: new Date(data.success_time!),
      payload: normalizeObject(payload),
    };
  }
  async queryPayment(context: ProviderQueryContext): Promise<PaymentQueryResult> {
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(context.order.orderNo)}?mchid=${encodeURIComponent(context.env.WECHAT_PAY_MCH_ID ?? '')}`;
    const response = await this.request(context.env, 'GET', path);
    const base = { provider: this.code, orderNo: context.order.orderNo, payload: response.payload };
    if (response.status === 404 && response.payload.code === 'ORDER_NOT_EXIST')
      return { ...base, kind: 'not_found', reason: 'Order not found in WeChat Pay' };
    if (!response.ok) throw httpError(502, 'WeChat Pay query failed');
    const data = this.transaction(context.env, response.payload, context.order);
    if (data.trade_state === 'SUCCESS')
      return {
        ...base,
        kind: 'paid',
        providerOrderId: data.transaction_id!,
        amount: data.amount.total,
        currency: data.amount.currency,
        paidAt: new Date(data.success_time!),
      };
    if (['NOTPAY', 'USERPAYING'].includes(data.trade_state))
      return { ...base, kind: 'pending', reason: data.trade_state };
    if (['CLOSED', 'REVOKED', 'PAYERROR', 'REFUND'].includes(data.trade_state))
      return { ...base, kind: 'closed', reason: data.trade_state };
    throw httpError(502, 'Unknown WeChat Pay state requires reconciliation');
  }
  async closePayment(context: ProviderQueryContext): Promise<PaymentCloseResult> {
    const response = await this.request(
      context.env,
      'POST',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(context.order.orderNo)}/close`,
      { mchid: context.env.WECHAT_PAY_MCH_ID },
    );
    const base = {
      provider: this.code,
      orderNo: context.order.orderNo,
      providerOrderId: context.order.providerOrderId,
      payload: response.payload,
    };
    if (response.status === 204 || response.payload.code === 'ORDER_CLOSED')
      return { ...base, kind: 'closed', reason: 'Order closed in WeChat Pay' };
    if (response.payload.code === 'ORDER_NOT_EXIST')
      return { ...base, kind: 'not_found', reason: 'Order not found in WeChat Pay' };
    if (response.payload.code === 'ORDER_PAID')
      return { ...base, kind: 'not_closable', reason: 'Order already paid' };
    throw httpError(502, 'WeChat Pay close failed');
  }
  async refundPayment(context: ProviderRefundContext): Promise<PaymentRefundResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'WeChat Pay only supports CNY refunds in this build');
    }

    const refund = resolveRefund(context);
    const outRefundNo = refund.refundRequestNo;
    const requestBody = JSON.stringify({
      out_trade_no: context.order.orderNo,
      out_refund_no: outRefundNo,
      reason: `Refund for ${context.order.orderNo}`,
      amount: {
        refund: refund.amount,
        total: context.order.amount,
        currency: context.order.currency,
      },
    });

    const response = await fetch(new URL(WECHAT_REFUND_API_PATH, this.getApiBaseUrl(context.env)), {
      method: 'POST',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: this.buildV3Authorization({
          env: context.env,
          method: 'POST',
          pathname: WECHAT_REFUND_API_PATH,
          body: requestBody,
        }),
      },
      body: requestBody,
      signal: AbortSignal.timeout(10_000),
    });

    const rawText = await response.text();
    this.verifyResponse(context.env, response.headers, rawText);
    let payload: Record<string, unknown> = {};
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw httpError(502, 'Invalid WeChat Pay refund response');
      }
    }

    if (response.status === 404) {
      return {
        kind: 'not_found',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId: context.order.providerOrderId ?? null,
        payload,
        reason: 'Order not found in WeChat Pay',
      };
    }

    if (!response.ok) {
      throw httpError(502, 'WeChat Pay refund request failed');
    }

    const refundStatus =
      typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';
    const refundId = typeof payload.refund_id === 'string' ? payload.refund_id : null;
    const providerOrderId =
      typeof payload.transaction_id === 'string'
        ? payload.transaction_id
        : (context.order.providerOrderId ?? null);

    if (['SUCCESS', 'PROCESSING', 'CLOSED'].includes(refundStatus))
      verifyWechatRefund(context, refund, payload);
    else throw httpError(502, 'WeChat refund state requires reconciliation');

    if (refundStatus === 'SUCCESS') {
      return {
        kind: 'refunded',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId,
        refundId,
        refundRequestNo: outRefundNo,
        amount: refund.amount,
        currency: context.order.currency,
        refundedAt: new Date(),
        payload,
        reason: 'Order refunded in WeChat Pay',
      };
    }

    if (refundStatus === 'PROCESSING') {
      return {
        kind: 'processing',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId,
        refundId,
        refundRequestNo: outRefundNo,
        amount: refund.amount,
        currency: context.order.currency,
        payload,
        reason: 'Refund accepted by WeChat Pay and is processing',
      };
    }

    return {
      kind: 'not_refundable',
      provider: this.code,
      orderNo: context.order.orderNo,
      providerOrderId,
      refundId,
      refundRequestNo: outRefundNo,
      payload,
      reason: 'Order is not refundable',
    };
  }

  async queryRefundPayment(context: ProviderRefundQueryContext): Promise<PaymentRefundQueryResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }
    if (context.order.currency !== 'CNY')
      throw httpError(422, 'WeChat Pay only supports CNY refunds in this build');

    const refund = resolveRefund(context);
    const outRefundNo = refund.refundRequestNo;
    const pathname = `${WECHAT_REFUND_QUERY_API_PATH}/${encodeURIComponent(outRefundNo)}`;
    const response = await fetch(new URL(pathname, this.getApiBaseUrl(context.env)), {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: this.buildV3Authorization({
          env: context.env,
          method: 'GET',
          pathname,
          body: '',
        }),
      },
      signal: AbortSignal.timeout(10_000),
    });

    const rawText = await response.text();
    this.verifyResponse(context.env, response.headers, rawText);
    let payload: Record<string, unknown> = {};
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw httpError(502, 'Invalid WeChat Pay refund response');
      }
    }

    const refundId =
      typeof payload.refund_id === 'string' ? payload.refund_id : (context.refund.refundId ?? null);
    const providerOrderId =
      typeof payload.transaction_id === 'string'
        ? payload.transaction_id
        : (context.order.providerOrderId ?? null);

    if (response.status === 404) {
      return {
        kind: 'not_found',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId,
        refundId,
        refundRequestNo: outRefundNo,
        payload,
        reason: 'Refund not found in WeChat Pay',
      };
    }

    if (!response.ok) {
      throw httpError(502, 'WeChat Pay refund query failed');
    }

    const refundStatus =
      typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';

    if (['SUCCESS', 'PROCESSING', 'CLOSED'].includes(refundStatus))
      verifyWechatRefund(context, refund, payload);
    else throw httpError(502, 'WeChat refund state requires reconciliation');

    if (refundStatus === 'SUCCESS') {
      return {
        kind: 'refunded',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId,
        refundId,
        refundRequestNo: outRefundNo,
        amount: refund.amount,
        currency: context.order.currency,
        refundedAt: new Date(),
        payload,
        reason: 'WeChat Pay confirmed refund success',
      };
    }

    if (refundStatus === 'PROCESSING') {
      return {
        kind: 'processing',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId,
        refundId,
        refundRequestNo: outRefundNo,
        amount: refund.amount,
        currency: context.order.currency,
        payload,
        reason: 'WeChat Pay refund is still processing',
      };
    }

    return {
      kind: 'failed',
      provider: this.code,
      orderNo: context.order.orderNo,
      providerOrderId,
      refundId,
      refundRequestNo: outRefundNo,
      payload,
      reason: 'WeChat Pay refund failed',
    };
  }
}
