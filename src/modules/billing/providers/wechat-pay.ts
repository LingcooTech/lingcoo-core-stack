import { resolveRefund, verifyWechatRefund, verifyWechatRefundSignature } from './refunds';
import { createHash, createHmac, createSign, randomBytes } from 'node:crypto';

import { httpError } from '../../../lib/errors';
import { normalizeObject, readSecretValue, resolveCallbackUrl } from './shared';
import type {
  BillingProviderAdapter,
  PaymentRefundResult,
  PaymentRefundQueryResult,
  PaymentNotificationResult,
  PaymentQueryResult,
  PreparedPayment,
  ProviderContext,
  ProviderNotificationContext,
  ProviderRefundQueryContext,
  ProviderRefundContext,
  ProviderQueryContext,
} from './types';

type WechatXmlPayload = Record<string, string>;

const WECHAT_NATIVE_API_PATH = '/pay/unifiedorder';
const WECHAT_ORDER_QUERY_API_PATH = '/pay/orderquery';
const WECHAT_ORDER_CLOSE_API_PATH = '/pay/closeorder';
const WECHAT_REFUND_API_PATH = '/v3/refund/domestic/refunds';
const WECHAT_REFUND_QUERY_API_PATH = '/v3/refund/domestic/refunds';
const WECHAT_NOTIFY_PATH = '/v1/billing/providers/wechat/notify';

export class WechatPayProvider implements BillingProviderAdapter {
  code = 'wechat_pay' as const;

  isConfigured(context?: ProviderContext['env']) {
    if (!context) {
      return false;
    }

    return Boolean(
      context.WECHAT_PAY_MCH_ID &&
      context.WECHAT_PAY_APP_ID &&
      context.WECHAT_PAY_APP_SECRET &&
      (context.WECHAT_PAY_KEY || context.WECHAT_PAY_API_V3_KEY),
    );
  }

  private getApiBaseUrl(context: ProviderContext['env']) {
    return context.WECHAT_PAY_API_BASE_URL?.trim() || 'https://api.mch.weixin.qq.com';
  }

  private getApiKey(context: ProviderContext['env']) {
    const value = context.WECHAT_PAY_KEY?.trim() || context.WECHAT_PAY_API_V3_KEY?.trim();

    if (!value) {
      throw httpError(422, 'WECHAT_PAY_KEY is not configured');
    }

    return value;
  }

  private getNotifyUrl(context: ProviderContext['env']) {
    return resolveCallbackUrl(
      context.WECHAT_PAY_NOTIFY_URL,
      context.PUBLIC_BASE_URL,
      WECHAT_NOTIFY_PATH,
    );
  }

  private getMerchantSerialNo(context: ProviderContext['env']) {
    const serialNo = context.WECHAT_PAY_CERT_SERIAL_NO?.trim();
    if (!serialNo) {
      throw httpError(422, 'WECHAT_PAY_CERT_SERIAL_NO is not configured');
    }
    return serialNo;
  }

  private getMerchantPrivateKey(context: ProviderContext['env']) {
    return readSecretValue({
      inlineValue: context.WECHAT_PAY_PRIVATE_KEY,
      filePath: context.WECHAT_PAY_PRIVATE_KEY_PATH,
      label: 'WECHAT_PAY_PRIVATE_KEY',
    });
  }

  private buildV3Authorization(input: {
    env: ProviderContext['env'];
    method: 'GET' | 'POST';
    pathname: string;
    body: string;
  }) {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${input.method}\n${input.pathname}\n${timestamp}\n${nonce}\n${input.body}\n`;
    const signer = createSign('RSA-SHA256');
    signer.update(message);
    signer.end();
    const signature = signer.sign(this.getMerchantPrivateKey(input.env), 'base64');

    return `WECHATPAY2-SHA256-RSA2048 mchid="${input.env.WECHAT_PAY_MCH_ID!.trim()}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.getMerchantSerialNo(input.env)}"`;
  }

  private buildXml(values: Record<string, string | number>) {
    const body = Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        if (typeof value === 'number') {
          return `<${key}>${value}</${key}>`;
        }

        const escaped = value.replace(/]]>/g, ']]]]><![CDATA[>');
        return `<${key}><![CDATA[${escaped}]]></${key}>`;
      })
      .join('');

    return `<xml>${body}</xml>`;
  }

  private parseXml(xml: string) {
    const trimmed = xml.trim();

    if (!trimmed) {
      throw httpError(400, 'Empty WeChat Pay XML payload');
    }

    const inner = trimmed.replace(/^\s*<xml>/i, '').replace(/<\/xml>\s*$/i, '');
    const result: WechatXmlPayload = {};
    const pattern = /<([a-zA-Z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;

    for (const match of inner.matchAll(pattern)) {
      const [, key, cdataValue, plainValue] = match;
      if (!key) continue;
      result[key] = (cdataValue ?? plainValue ?? '').trim();
    }

    if (Object.keys(result).length === 0) {
      throw httpError(400, 'Failed to parse WeChat Pay XML payload');
    }

    return result;
  }

  private buildSignContent(values: Record<string, string | number>) {
    return Object.entries(values)
      .filter(
        ([key, value]) => key !== 'sign' && value !== undefined && value !== null && value !== '',
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }

  private createSignature(
    values: Record<string, string | number>,
    key: string,
    signType: 'MD5' | 'HMAC-SHA256',
  ) {
    const signContent = `${this.buildSignContent(values)}&key=${key}`;

    if (signType === 'MD5') {
      return createHash('md5').update(signContent, 'utf8').digest('hex').toUpperCase();
    }

    return createHmac('sha256', key).update(signContent, 'utf8').digest('hex').toUpperCase();
  }

  private verifySignature(values: WechatXmlPayload, key: string) {
    const sign = values.sign?.trim().toUpperCase();

    if (!sign) {
      throw httpError(400, 'Missing WeChat Pay signature');
    }

    const signType =
      values.sign_type?.trim().toUpperCase() === 'MD5'
        ? 'MD5'
        : values.sign_type?.trim().toUpperCase() === 'HMAC-SHA256'
          ? 'HMAC-SHA256'
          : sign.length > 32
            ? 'HMAC-SHA256'
            : 'MD5';
    const expected = this.createSignature(values, key, signType);

    if (expected !== sign) {
      throw httpError(400, 'Invalid WeChat Pay callback signature');
    }
  }

  private truncateBody(value: string) {
    const normalized = value.trim() || 'fd-core-stack order';
    return normalized.length <= 120 ? normalized : normalized.slice(0, 120);
  }

  private extractIpv4(value: string | undefined) {
    if (!value) {
      return '';
    }

    const normalized = value.trim();

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
      return normalized;
    }

    const mapped = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    return mapped?.[1] ?? '';
  }

  private resolveClientIp(context: ProviderContext) {
    const requestIp = this.extractIpv4(context.clientIp);
    if (requestIp) {
      return requestIp;
    }

    try {
      const publicHost = new URL(context.env.PUBLIC_BASE_URL).hostname;
      const hostIp = this.extractIpv4(publicHost);
      if (hostIp) {
        return hostIp;
      }
    } catch {
      // ignore invalid PUBLIC_BASE_URL, env parsing should already prevent this
    }

    return '127.0.0.1';
  }

  private parsePaidAt(value: string | undefined) {
    if (!value || !/^\d{14}$/.test(value)) {
      return new Date();
    }

    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const hour = value.slice(8, 10);
    const minute = value.slice(10, 12);
    const second = value.slice(12, 14);

    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  }

  async preparePayment(context: ProviderContext): Promise<PreparedPayment> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'WeChat Pay only supports CNY in this MVP');
    }

    const notifyUrl = this.getNotifyUrl(context.env);
    const requestPayload: Record<string, string | number> = {
      appid: context.env.WECHAT_PAY_APP_ID!.trim(),
      mch_id: context.env.WECHAT_PAY_MCH_ID!.trim(),
      nonce_str: randomBytes(16).toString('hex'),
      sign_type: 'HMAC-SHA256',
      body: this.truncateBody(context.order.subject),
      out_trade_no: context.order.orderNo,
      total_fee: context.order.amount,
      fee_type: context.order.currency,
      spbill_create_ip: this.resolveClientIp(context),
      notify_url: notifyUrl,
      trade_type: 'NATIVE',
      product_id: context.order.orderNo,
    };

    requestPayload.sign = this.createSignature(
      requestPayload,
      this.getApiKey(context.env),
      'HMAC-SHA256',
    );

    const response = await fetch(new URL(WECHAT_NATIVE_API_PATH, this.getApiBaseUrl(context.env)), {
      method: 'POST',
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: this.buildXml(requestPayload),
      signal: AbortSignal.timeout(10_000),
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw httpError(
        502,
        `WeChat Pay create order failed: ${response.status} ${responseText || 'empty response'}`,
      );
    }

    const responsePayload = this.parseXml(responseText);

    if (responsePayload.return_code === 'SUCCESS' && responsePayload.sign) {
      this.verifySignature(responsePayload, this.getApiKey(context.env));
    }

    if (responsePayload.return_code !== 'SUCCESS') {
      throw httpError(
        502,
        `WeChat Pay create order failed: ${responsePayload.return_msg ?? 'unknown return error'}`,
      );
    }

    if (responsePayload.result_code !== 'SUCCESS' || !responsePayload.code_url) {
      throw httpError(
        502,
        `WeChat Pay create order failed: ${responsePayload.err_code_des ?? responsePayload.return_msg ?? 'empty response'}`,
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
        codeUrl: responsePayload.code_url,
        qrCodeText: responsePayload.code_url,
        prepayId: responsePayload.prepay_id ?? '',
      },
    };
  }

  async parseNotification(
    context: ProviderNotificationContext,
  ): Promise<PaymentNotificationResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    const rawBody =
      typeof context.rawBody === 'string'
        ? context.rawBody
        : (context.rawBody?.toString('utf8') ?? '');
    if (!rawBody) {
      throw httpError(400, 'Missing WeChat Pay callback body');
    }

    const payload = this.parseXml(rawBody);

    if (payload.return_code !== 'SUCCESS') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId: payload.out_trade_no || `wechat_${Date.now()}`,
        payload,
        reason: `Unhandled WeChat return_code: ${payload.return_code ?? 'unknown'}`,
      };
    }

    this.verifySignature(payload, this.getApiKey(context.env));

    if (payload.appid && payload.appid !== context.env.WECHAT_PAY_APP_ID) {
      throw httpError(400, 'WeChat Pay app id mismatch');
    }

    if (payload.mch_id && payload.mch_id !== context.env.WECHAT_PAY_MCH_ID) {
      throw httpError(400, 'WeChat Pay merchant id mismatch');
    }

    if (payload.result_code !== 'SUCCESS') {
      return {
        kind: 'ignored',
        provider: this.code,
        providerEventId: payload.transaction_id || payload.out_trade_no || `wechat_${Date.now()}`,
        payload,
        reason: `Unhandled WeChat result_code: ${payload.result_code ?? 'unknown'}`,
      };
    }

    if (!payload.out_trade_no || !payload.transaction_id || !payload.total_fee) {
      throw httpError(400, 'Missing WeChat Pay payment fields');
    }

    const amount = Number.parseInt(payload.total_fee, 10);
    if (!Number.isFinite(amount)) {
      throw httpError(400, 'Invalid WeChat Pay total_fee');
    }

    return {
      kind: 'paid',
      provider: this.code,
      providerEventId: payload.transaction_id,
      orderNo: payload.out_trade_no,
      providerOrderId: payload.transaction_id,
      amount,
      currency: payload.fee_type || 'CNY',
      paidAt: this.parsePaidAt(payload.time_end),
      payload: normalizeObject(payload),
    };
  }

  async queryPayment(context: ProviderQueryContext): Promise<PaymentQueryResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    const requestPayload: Record<string, string> = {
      appid: context.env.WECHAT_PAY_APP_ID!.trim(),
      mch_id: context.env.WECHAT_PAY_MCH_ID!.trim(),
      nonce_str: randomBytes(16).toString('hex'),
      sign_type: 'HMAC-SHA256',
      out_trade_no: context.order.orderNo,
    };

    if (context.order.providerOrderId?.trim()) {
      requestPayload.transaction_id = context.order.providerOrderId.trim();
    }

    requestPayload.sign = this.createSignature(
      requestPayload,
      this.getApiKey(context.env),
      'HMAC-SHA256',
    );

    const response = await fetch(
      new URL(WECHAT_ORDER_QUERY_API_PATH, this.getApiBaseUrl(context.env)),
      {
        method: 'POST',
        headers: {
          Accept: 'application/xml, text/xml, */*',
          'Content-Type': 'text/xml; charset=utf-8',
        },
        body: this.buildXml(requestPayload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const responseText = await response.text();

    if (!response.ok) {
      throw httpError(
        502,
        `WeChat Pay query order failed: ${response.status} ${responseText || 'empty response'}`,
      );
    }

    const payload = this.parseXml(responseText);

    if (payload.return_code === 'SUCCESS' && payload.sign) {
      this.verifySignature(payload, this.getApiKey(context.env));
    }

    if (payload.return_code !== 'SUCCESS') {
      throw httpError(
        502,
        `WeChat Pay query order failed: ${payload.return_msg ?? 'unknown return error'}`,
      );
    }

    if (payload.result_code !== 'SUCCESS') {
      const errorCode = payload.err_code?.trim().toUpperCase();
      if (errorCode === 'ORDERNOTEXIST') {
        return {
          kind: 'not_found',
          provider: this.code,
          orderNo: context.order.orderNo,
          payload: normalizeObject(payload),
          reason: payload.err_code_des ?? 'Order not found in WeChat Pay',
        };
      }

      throw httpError(
        502,
        `WeChat Pay query order failed: ${payload.err_code_des ?? payload.return_msg ?? 'empty response'}`,
      );
    }

    const tradeState = payload.trade_state?.trim().toUpperCase() || 'UNKNOWN';
    const normalizedPayload = normalizeObject(payload);

    if (tradeState === 'SUCCESS') {
      if (!payload.transaction_id || !payload.total_fee) {
        throw httpError(400, 'Missing WeChat Pay query payment fields');
      }

      const amount = Number.parseInt(payload.total_fee, 10);
      if (!Number.isFinite(amount)) {
        throw httpError(400, 'Invalid WeChat Pay total_fee');
      }

      return {
        kind: 'paid',
        provider: this.code,
        orderNo: payload.out_trade_no || context.order.orderNo,
        providerOrderId: payload.transaction_id,
        amount,
        currency: payload.fee_type || context.order.currency,
        paidAt: this.parsePaidAt(payload.time_end),
        payload: normalizedPayload,
      };
    }

    if (tradeState === 'NOTPAY' || tradeState === 'USERPAYING') {
      return {
        kind: 'pending',
        provider: this.code,
        orderNo: payload.out_trade_no || context.order.orderNo,
        providerOrderId: payload.transaction_id ?? null,
        payload: normalizedPayload,
        reason: payload.trade_state_desc ?? tradeState,
      };
    }

    return {
      kind: 'closed',
      provider: this.code,
      orderNo: payload.out_trade_no || context.order.orderNo,
      providerOrderId: payload.transaction_id ?? null,
      payload: normalizedPayload,
      reason: payload.trade_state_desc ?? tradeState,
    };
  }

  async closePayment(context: ProviderQueryContext) {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    const requestPayload: Record<string, string> = {
      appid: context.env.WECHAT_PAY_APP_ID!.trim(),
      mch_id: context.env.WECHAT_PAY_MCH_ID!.trim(),
      nonce_str: randomBytes(16).toString('hex'),
      sign_type: 'HMAC-SHA256',
      out_trade_no: context.order.orderNo,
    };
    requestPayload.sign = this.createSignature(
      requestPayload,
      this.getApiKey(context.env),
      'HMAC-SHA256',
    );

    const response = await fetch(
      new URL(WECHAT_ORDER_CLOSE_API_PATH, this.getApiBaseUrl(context.env)),
      {
        method: 'POST',
        headers: {
          Accept: 'application/xml, text/xml, */*',
          'Content-Type': 'text/xml; charset=utf-8',
        },
        body: this.buildXml(requestPayload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const responseText = await response.text();

    if (!response.ok) {
      throw httpError(
        502,
        `WeChat Pay close order failed: ${response.status} ${responseText || 'empty response'}`,
      );
    }

    const payload = this.parseXml(responseText);

    if (payload.return_code === 'SUCCESS' && payload.sign) {
      this.verifySignature(payload, this.getApiKey(context.env));
    }

    if (payload.return_code !== 'SUCCESS') {
      throw httpError(
        502,
        `WeChat Pay close order failed: ${payload.return_msg ?? 'unknown return error'}`,
      );
    }

    if (payload.result_code === 'SUCCESS') {
      return {
        kind: 'closed' as const,
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId: context.order.providerOrderId ?? null,
        payload: normalizeObject(payload),
        reason: 'Order closed in WeChat Pay',
      };
    }

    const errorCode = payload.err_code?.trim().toUpperCase();
    if (errorCode === 'ORDERNOTEXIST') {
      return {
        kind: 'not_found' as const,
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId: context.order.providerOrderId ?? null,
        payload: normalizeObject(payload),
        reason: payload.err_code_des ?? 'Order not found in WeChat Pay',
      };
    }

    return {
      kind: 'not_closable' as const,
      provider: this.code,
      orderNo: context.order.orderNo,
      providerOrderId: context.order.providerOrderId ?? null,
      payload: normalizeObject(payload),
      reason: payload.err_code_des ?? payload.return_msg ?? errorCode ?? 'Order is not closable',
    };
  }

  async refundPayment(context: ProviderRefundContext): Promise<PaymentRefundResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }

    if (context.order.currency !== 'CNY') {
      throw httpError(422, 'WeChat Pay only supports CNY refunds in this build');
    }

    const verificationKey = readSecretValue({
      inlineValue: context.env.WECHAT_PAY_PLATFORM_CERT,
      filePath: context.env.WECHAT_PAY_PLATFORM_CERT_PATH,
      label: 'WECHAT_PAY_PLATFORM_CERT',
    });
    const refund = resolveRefund(context);
    const outRefundNo = refund.refundRequestNo;
    const requestBody = JSON.stringify({
      out_trade_no: context.order.orderNo,
      out_refund_no: outRefundNo,
      reason: `Refund for ${context.order.orderNo}`,
      notify_url: this.getNotifyUrl(context.env),
      amount: {
        refund: refund.amount,
        total: context.order.amount,
        currency: context.order.currency,
      },
    });

    const response = await fetch(new URL(WECHAT_REFUND_API_PATH, this.getApiBaseUrl(context.env)), {
      method: 'POST',
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
    verifyWechatRefundSignature(response.headers, rawText, verificationKey);
    let payload: Record<string, unknown> = {};
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        payload = { raw: rawText };
      }
    }

    if (response.status === 404) {
      return {
        kind: 'not_found',
        provider: this.code,
        orderNo: context.order.orderNo,
        providerOrderId: context.order.providerOrderId ?? null,
        payload,
        reason: String(payload.message ?? 'Order not found in WeChat Pay'),
      };
    }

    if (!response.ok) {
      throw httpError(
        502,
        `WeChat Pay refund failed: ${response.status} ${String(payload.message ?? (rawText || 'empty response'))}`,
      );
    }

    const refundStatus =
      typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';
    const refundId = typeof payload.refund_id === 'string' ? payload.refund_id : null;
    const providerOrderId =
      typeof payload.transaction_id === 'string'
        ? payload.transaction_id
        : (context.order.providerOrderId ?? null);

    if (refundStatus === 'SUCCESS' || refundStatus === 'PROCESSING')
      verifyWechatRefund(context, refund, payload);

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
      reason: String(payload.message ?? payload.status ?? 'Order is not refundable'),
    };
  }

  async queryRefundPayment(context: ProviderRefundQueryContext): Promise<PaymentRefundQueryResult> {
    if (!this.isConfigured(context.env)) {
      throw httpError(422, 'WeChat Pay is not configured');
    }
    if (context.order.currency !== 'CNY')
      throw httpError(422, 'WeChat Pay only supports CNY refunds in this build');

    const verificationKey = readSecretValue({
      inlineValue: context.env.WECHAT_PAY_PLATFORM_CERT,
      filePath: context.env.WECHAT_PAY_PLATFORM_CERT_PATH,
      label: 'WECHAT_PAY_PLATFORM_CERT',
    });
    const refund = resolveRefund(context);
    const outRefundNo = refund.refundRequestNo;
    const pathname = `${WECHAT_REFUND_QUERY_API_PATH}/${encodeURIComponent(outRefundNo)}`;
    const response = await fetch(new URL(pathname, this.getApiBaseUrl(context.env)), {
      method: 'GET',
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
    verifyWechatRefundSignature(response.headers, rawText, verificationKey);
    let payload: Record<string, unknown> = {};
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        payload = { raw: rawText };
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
        reason: String(payload.message ?? 'Refund not found in WeChat Pay'),
      };
    }

    if (!response.ok) {
      throw httpError(
        502,
        `WeChat Pay refund query failed: ${response.status} ${String(payload.message ?? (rawText || 'empty response'))}`,
      );
    }

    const refundStatus =
      typeof payload.status === 'string' ? payload.status.trim().toUpperCase() : '';

    if (refundStatus === 'SUCCESS' || refundStatus === 'PROCESSING')
      verifyWechatRefund(context, refund, payload);

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
      reason: String(payload.message ?? payload.status ?? 'WeChat Pay refund failed'),
    };
  }
}
