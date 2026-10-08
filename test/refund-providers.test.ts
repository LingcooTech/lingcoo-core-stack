import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import test from 'node:test';
import { AlipaySdk } from 'alipay-sdk';
import { validateEnv } from '../src/lib/env';
import { AlipayProvider } from '../src/modules/billing/providers/alipay';
import { WechatPayProvider } from '../src/modules/billing/providers/wechat-pay';
import {
  resolveRefund,
  verifyWechatRefundSignature,
} from '../src/modules/billing/providers/refunds';
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const env = validateEnv({
  NODE_ENV: 'test',
  REDIS_URL: 'redis://127.0.0.1:16379/15',
  DATABASE_URL: 'postgres://unused/unused_test',
  JWT_SECRET: 'test-only-refund-signing-secret',
  ALIPAY_APP_ID: 'test_app',
  ALIPAY_PRIVATE_KEY: keys.privateKey,
  ALIPAY_PUBLIC_KEY: keys.publicKey,
  WECHAT_PAY_APP_ID: 'test_app',
  WECHAT_PAY_APP_SECRET: 'test_secret',
  WECHAT_PAY_MCH_ID: 'test_mch',
  WECHAT_PAY_KEY: 'test_key',
  WECHAT_PAY_PRIVATE_KEY: keys.privateKey,
  WECHAT_PAY_PLATFORM_CERT: keys.publicKey,
  WECHAT_PAY_CERT_SERIAL_NO: 'test_serial',
});
const order = {
  orderNo: 'FD202610080001',
  providerOrderId: 'provider_transaction',
  amount: 10000,
  currency: 'CNY',
};
const refund = { refundRequestNo: 'RF_hosting_line_001', amount: 2500 };
const base = { env, order };
const querySuccess = {
  code: '10000',
  refundStatus: 'REFUND_SUCCESS',
  outTradeNo: order.orderNo,
  tradeNo: order.providerOrderId,
  outRequestNo: refund.refundRequestNo,
  refundAmount: '25.00',
  totalAmount: '100.00',
};
const wxPayload = {
  out_trade_no: order.orderNo,
  transaction_id: order.providerOrderId,
  out_refund_no: refund.refundRequestNo,
  refund_id: 'wx_refund',
  status: 'SUCCESS',
  amount: { total: order.amount, refund: refund.amount, currency: 'CNY' },
};

function signedResponse(payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000)),
    nonce = 'fixture-nonce';
  const signer = createSign('RSA-SHA256');
  signer.update(`${timestamp}\n${nonce}\n${body}\n`);
  signer.end();
  return new Response(body, {
    status: 200,
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signer.sign(keys.privateKey, 'base64'),
    },
  });
}

test('refund selection preserves legacy full refund identity and validates partial amounts before network calls', () => {
  assert.deepEqual(resolveRefund(base), {
    refundRequestNo: order.orderNo + '_refund',
    amount: order.amount,
  });
  assert.deepEqual(resolveRefund({ ...base, refund }), refund);
  for (const amount of [0, -1, 1.2, NaN, Infinity, 10001, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(
      () => resolveRefund({ ...base, refund: { ...refund, amount } }),
      /Invalid refund amount/,
    );
  assert.throws(() => resolveRefund({ ...base, refund: { amount: 1 } }), /independent/);
  assert.throws(
    () => resolveRefund({ ...base, refund: { ...refund, refundRequestNo: '../bad' } }),
    /request number/,
  );
});

test('Alipay partial refund and query carry the same independent ID and actual refund amount', async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(AlipaySdk.prototype, 'exec', async (...args: unknown[]) => {
    calls.push(args);
    if (args[0] === 'alipay.trade.refund')
      return {
        code: '10000',
        outTradeNo: order.orderNo,
        tradeNo: order.providerOrderId,
        refundFee: '25.00',
      };
    return querySuccess;
  });
  const provider = new AlipayProvider();
  const result = await provider.refundPayment({ ...base, refund });
  assert.equal(result.kind, 'refunded');
  if (result.kind === 'refunded') assert.equal(result.amount, 2500);
  const request = calls[0]![1] as { bizContent: { refundAmount: string; outRequestNo: string } };
  assert.equal(request.bizContent.refundAmount, '25.00');
  assert.equal(request.bizContent.outRequestNo, refund.refundRequestNo);
  assert.deepEqual(calls[0]![2], { validateSign: true });
  const query = await provider.queryRefundPayment({ ...base, refund });
  assert.deepEqual(calls[1]![2], { validateSign: true });
  assert.equal(query.kind, 'refunded');
  if (query.kind === 'refunded') assert.equal(query.amount, 2500);
});

for (const status of [undefined, '', 'WAITING']) {
  test(`Alipay query 10000 with status ${String(status)} must not report refund success`, async (t) => {
    t.mock.method(AlipaySdk.prototype, 'exec', async () => ({
      code: '10000',
      refundStatus: status,
    }));
    const result = await new AlipayProvider().queryRefundPayment({ ...base, refund });
    assert.equal(result.kind, 'processing');
  });
}
for (const mismatch of [
  { refundAmount: '100.00' },
  { refundAmount: 'bad' },
  { refundAmount: undefined },
  { outTradeNo: 'other_order' },
  { outRequestNo: 'other_refund' },
  { totalAmount: '99.00' },
]) {
  test(
    'Alipay refuses a mismatched successful refund response ' + JSON.stringify(mismatch),
    async (t) => {
      t.mock.method(AlipaySdk.prototype, 'exec', async () => ({ ...querySuccess, ...mismatch }));
      await assert.rejects(
        new AlipayProvider().queryRefundPayment({ ...base, refund }),
        /refund|Refund/,
      );
    },
  );
}

test('WeChat partial refund preserves original total and reuses identity during query and retries', async (t) => {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return signedResponse(wxPayload);
  });
  const provider = new WechatPayProvider();
  for (let i = 0; i < 2; i++) {
    const result = await provider.refundPayment({ ...base, refund });
    assert.equal(result.kind, 'refunded');
    if (result.kind === 'refunded') assert.equal(result.amount, 2500);
  }
  assert.deepEqual(bodies[0]?.amount, { refund: 2500, total: 10000, currency: 'CNY' });
  assert.equal(bodies[0]?.out_refund_no, refund.refundRequestNo);
  assert.deepEqual(bodies[0], bodies[1]);
  const result = await provider.queryRefundPayment({ ...base, refund });
  assert.equal(result.kind, 'refunded');
  assert.ok(urls[2]?.endsWith('/' + refund.refundRequestNo));
});
for (const mismatch of [
  { out_refund_no: 'wrong' },
  { out_trade_no: 'wrong' },
  { transaction_id: 'wrong' },
  { amount: { total: 10000, refund: 10000, currency: 'CNY' } },
  { amount: { total: 10000, refund: 2500, currency: 'USD' } },
  { amount: undefined },
]) {
  test('WeChat rejects a mismatched refund response ' + JSON.stringify(mismatch), async (t) => {
    t.mock.method(globalThis, 'fetch', async () => signedResponse({ ...wxPayload, ...mismatch }));
    await assert.rejects(
      new WechatPayProvider().refundPayment({ ...base, refund }),
      /does not match/,
    );
    await assert.rejects(
      new WechatPayProvider().queryRefundPayment({ ...base, refund }),
      /does not match/,
    );
  });
}

test('WeChat refund signatures reject missing, tampered and expired evidence', async () => {
  const response = signedResponse(wxPayload),
    body = await response.text();
  verifyWechatRefundSignature(response.headers, body, keys.publicKey);
  assert.throws(
    () => verifyWechatRefundSignature(new Headers(), body, keys.publicKey),
    /signature/,
  );
  assert.throws(
    () => verifyWechatRefundSignature(response.headers, body + ' ', keys.publicKey),
    /signature/,
  );
  assert.throws(
    () => verifyWechatRefundSignature(response.headers, body, keys.publicKey, Date.now() + 301000),
    /expired/,
  );
});

test('legacy full refunds remain compatible with provider request and query formats', async (t) => {
  const legacyId = order.orderNo + '_refund';
  t.mock.method(AlipaySdk.prototype, 'exec', async (method: string) =>
    method === 'alipay.trade.refund'
      ? {
          code: '10000',
          out_trade_no: order.orderNo,
          trade_no: order.providerOrderId,
          refund_fee: '100.00',
        }
      : {
          code: '10000',
          out_trade_no: order.orderNo,
          trade_no: order.providerOrderId,
          refund_status: 'REFUND_SUCCESS',
          out_request_no: legacyId,
          refund_amount: '100.00',
          total_amount: '100.00',
        },
  );
  const alipay = new AlipayProvider();
  assert.equal((await alipay.refundPayment(base)).kind, 'refunded');
  assert.equal((await alipay.queryRefundPayment({ ...base, refund: {} })).kind, 'refunded');
  let n = 0;
  t.mock.method(globalThis, 'fetch', async () =>
    signedResponse({
      ...wxPayload,
      out_refund_no: legacyId,
      status: ++n === 1 ? 'PROCESSING' : 'SUCCESS',
      amount: { total: order.amount, refund: order.amount, currency: 'CNY' },
    }),
  );
  const wechat = new WechatPayProvider();
  const processing = await wechat.refundPayment(base);
  assert.equal(processing.kind, 'processing');
  if (processing.kind === 'processing') assert.equal(processing.amount, order.amount);
  assert.equal((await wechat.queryRefundPayment({ ...base, refund: {} })).kind, 'refunded');
});

test('domestic refund adapters reject unsupported currencies before contacting providers', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected network');
  });
  const sdk = t.mock.method(AlipaySdk.prototype, 'exec', async () => {
    throw new Error('Unexpected network');
  });
  const foreign = { ...base, order: { ...order, currency: 'USD' }, refund };
  for (const provider of [new AlipayProvider(), new WechatPayProvider()]) {
    await assert.rejects(provider.refundPayment(foreign), /only supports CNY/);
    await assert.rejects(provider.queryRefundPayment(foreign), /only supports CNY/);
  }
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(sdk.mock.callCount(), 0);
});
