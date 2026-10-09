import assert from 'node:assert/strict';
import { createCipheriv, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { validateEnv } from '../src/lib/env';
import { WechatPayProvider } from '../src/modules/billing/providers/wechat-pay';
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const env = validateEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused/unused_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'wechat-test-key-only',
  WECHAT_PAY_APP_ID: 'wx_fixture',
  WECHAT_PAY_MCH_ID: 'mch_fixture',
  WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
  WECHAT_PAY_CERT_SERIAL_NO: 'merchant_serial',
  WECHAT_PAY_PRIVATE_KEY: keys.privateKey,
  WECHAT_PAY_PLATFORM_CERT: keys.publicKey,
  WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_fixture',
});
const order = { orderNo: 'FD202610090001', subject: 'Test', amount: 100, currency: 'CNY' };
const transaction = {
  appid: env.WECHAT_PAY_APP_ID,
  mchid: env.WECHAT_PAY_MCH_ID,
  out_trade_no: order.orderNo,
  transaction_id: 'wx_transaction',
  trade_state: 'SUCCESS',
  success_time: '2026-10-09T10:00:00+08:00',
  amount: { total: 100, currency: 'CNY' },
};
function signed(body: string, age = 0) {
  const timestamp = String(Math.floor(Date.now() / 1000) + age),
    nonce = 'response-nonce';
  const signer = createSign('RSA-SHA256');
  signer.update(`${timestamp}\n${nonce}\n${body}\n`);
  signer.end();
  return {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': nonce,
    'wechatpay-serial': 'PUB_KEY_ID_fixture',
    'wechatpay-signature': signer.sign(keys.privateKey, 'base64'),
  };
}
function response(payload: unknown, status = 200) {
  const body = status === 204 ? '' : JSON.stringify(payload);
  return new Response(status === 204 ? null : body, { status, headers: signed(body) });
}
function notification(data: unknown = transaction) {
  const nonce = '123456789012',
    associated_data = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(env.WECHAT_PAY_API_V3_KEY!),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(associated_data));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
  const rawBody = JSON.stringify({
    id: 'notification-001',
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data, ciphertext },
  });
  return { env, rawBody, body: { ignored: true }, headers: signed(rawBody) };
}
test('V3 Native uses signed JSON; query and close use merchant endpoints', async (t) => {
  const requests: { url: URL; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    requests.push({ url: new URL(input), init });
    return requests.length === 1
      ? response({ code_url: 'weixin://wxpay/bizpayurl?pr=fixture' })
      : requests.length === 2
        ? response(transaction)
        : response(null, 204);
  });
  const provider = new WechatPayProvider();
  const prepared = await provider.preparePayment({ env, order });
  assert.equal(prepared.mode, 'native_qr');
  assert.equal((await provider.queryPayment({ env, order })).kind, 'paid');
  assert.equal((await provider.closePayment({ env, order })).kind, 'closed');
  assert.equal(requests[0]!.url.pathname, '/v3/pay/transactions/native');
  assert.equal(requests[1]!.init.method, 'GET');
  assert.match(requests[2]!.url.pathname, /\/close$/);
  for (const { url, init } of requests) {
    const auth = new Headers(init.headers).get('Authorization')!;
    const attrs = Object.fromEntries(
      [...auth.matchAll(/(\w+)="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    const verifier = createVerify('RSA-SHA256');
    verifier.update(
      `${init.method}\n${url.pathname + url.search}\n${attrs.timestamp}\n${attrs.nonce_str}\n${init.body ?? ''}\n`,
    );
    verifier.end();
    assert(verifier.verify(keys.publicKey, attrs.signature, 'base64'));
    assert.equal(init.redirect, 'error');
  }
  assert.deepEqual(JSON.parse(String(requests[0]!.init.body)).amount, {
    total: 100,
    currency: 'CNY',
  });
});
test('V3 notification verifies original bytes, decrypts resource and preserves event identity', async () => {
  const p = new WechatPayProvider(),
    input = notification();
  const result = await p.parseNotification(input);
  assert.equal(result.kind, 'paid');
  assert.equal(result.providerEventId, 'notification-001');
  assert.deepEqual(await p.parseNotification(input), result);
  await assert.rejects(p.parseNotification({ ...input, rawBody: input.rawBody + ' ' }));
  await assert.rejects(
    p.parseNotification({ ...input, headers: { ...input.headers, 'wechatpay-serial': 'other' } }),
  );
  await assert.rejects(p.parseNotification({ ...input, headers: signed(input.rawBody, -301) }));
  await assert.rejects(
    p.parseNotification({
      ...input,
      env: { ...env, WECHAT_PAY_API_V3_KEY: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    }),
  );
  for (const data of [
    { ...transaction, mchid: 'foreign' },
    { ...transaction, appid: 'foreign' },
    { ...transaction, amount: { total: -1, currency: 'CNY' } },
    { ...transaction, trade_state: 'NOTPAY' },
    { ...transaction, success_time: undefined },
  ])
    await assert.rejects(p.parseNotification(notification(data)));
});
test('V3 responses reject unsigned, foreign key, tampering and mismatched transaction amounts', async (t) => {
  const p = new WechatPayProvider();
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify(transaction)),
  );
  await assert.rejects(p.queryPayment({ env, order }));
  fetch.mock.mockImplementation(async () =>
    response({ ...transaction, amount: { total: 99, currency: 'CNY' } }),
  );
  await assert.rejects(p.queryPayment({ env, order }));
  fetch.mock.mockImplementation(async () => response({ ...transaction, out_trade_no: 'OTHER' }));
  await assert.rejects(p.queryPayment({ env, order }));
  fetch.mock.mockImplementation(async () =>
    response({ ...transaction, trade_state: 'UNRECOGNIZED' }),
  );
  await assert.rejects(p.queryPayment({ env, order }));
  assert.equal(
    p.isConfigured({ ...env, WECHAT_PAY_API_V3_KEY: undefined, WECHAT_PAY_KEY: 'old-v2-key' }),
    false,
  );
});
