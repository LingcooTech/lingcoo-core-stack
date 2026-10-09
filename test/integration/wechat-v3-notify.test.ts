import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createCipheriv, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { orders, billingWebhookEvents } from '../../src/db/schema';
import { testDatabase, seedPurchase } from './helpers';
const { db, pool, env } = testDatabase();
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const runtime = {
  ...env,
  WECHAT_PAY_APP_ID: 'wx_notify_fixture',
  WECHAT_PAY_MCH_ID: 'mch_fixture',
  WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
  WECHAT_PAY_CERT_SERIAL_NO: 'merchant_serial',
  WECHAT_PAY_PRIVATE_KEY: keys.privateKey,
  WECHAT_PAY_PLATFORM_CERT: keys.publicKey,
  WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_notify',
};
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(runtime);
});
after(async () => {
  await app.close();
  await pool.end();
});
function event(orderNo: string, amount = 100) {
  const id = randomUUID(),
    nonce = '123456789012',
    associated_data = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(runtime.WECHAT_PAY_API_V3_KEY),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(associated_data));
  const payload = {
    appid: runtime.WECHAT_PAY_APP_ID,
    mchid: runtime.WECHAT_PAY_MCH_ID,
    out_trade_no: orderNo,
    transaction_id: 'wx_' + orderNo,
    trade_state: 'SUCCESS',
    success_time: new Date().toISOString(),
    amount: { total: amount, currency: 'CNY' },
  };
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
  const raw = JSON.stringify({
    id,
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data, ciphertext },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signer = createSign('RSA-SHA256');
  signer.update(`${timestamp}\n${nonce}\n${raw}\n`);
  signer.end();
  return {
    id,
    request: {
      method: 'POST' as const,
      url: '/v1/billing/providers/wechat/notify',
      payload: raw,
      headers: {
        'content-type': 'application/json',
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-serial': runtime.WECHAT_PAY_PUBLIC_KEY_ID,
        'wechatpay-signature': signer.sign(keys.privateKey, 'base64'),
      },
    },
  };
}
test('V3 HTTP notification acknowledges committed payment and safely replays; mismatched amount rolls back', async () => {
  const f = await seedPurchase(db),
    notification = event(f.order.orderNo, f.order.amount);
  for (let i = 0; i < 2; i++) {
    const response = await app.inject(notification.request);
    assert.equal(response.statusCode, 204, response.body);
    assert.equal(response.body, '');
  }
  assert.equal(
    (await db.select().from(orders).where(eq(orders.id, f.order.id)))[0]?.status,
    'paid',
  );
  assert.equal(
    (
      await db
        .select()
        .from(billingWebhookEvents)
        .where(eq(billingWebhookEvents.providerEventId, notification.id))
    ).length,
    1,
  );
  const other = await seedPurchase(db),
    bad = event(other.order.orderNo, other.order.amount + 1);
  const response = await app.inject(bad.request);
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().code, 'FAIL');
  assert.equal(
    (await db.select().from(orders).where(eq(orders.id, other.order.id)))[0]?.status,
    'pending',
  );
  assert.equal(
    (
      await db
        .select()
        .from(billingWebhookEvents)
        .where(eq(billingWebhookEvents.providerEventId, bad.id))
    ).length,
    0,
  );
  const tampered = await app.inject({
    ...notification.request,
    payload: notification.request.payload + ' ',
  });
  assert.equal(tampered.statusCode, 500);
});
