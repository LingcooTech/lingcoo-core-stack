import { createVerify } from 'node:crypto';
import { httpError } from '../../../lib/errors';
import { amountYuanStringToFen, normalizeObject } from './shared';
import type { ProviderQueryContext } from './types';

type RefundSelection = {
  amount?: number;
  refundRequestNo?: string | null;
  refundId?: string | null;
};
/** The order amount always stays the original payment total; refund amounts are independent. */
export function resolveRefund(context: ProviderQueryContext & { refund?: RefundSelection }) {
  const amount = context.refund?.amount ?? context.order.amount;
  const explicitId = context.refund?.refundRequestNo?.trim();
  const refundRequestNo = explicitId || `${context.order.orderNo}_refund`;
  if (
    !Number.isSafeInteger(context.order.amount) ||
    context.order.amount <= 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > context.order.amount
  )
    throw httpError(422, 'Invalid refund amount');
  if (amount < context.order.amount && !explicitId)
    throw httpError(422, 'Partial refunds require an independent refund request number');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(refundRequestNo))
    throw httpError(422, 'Invalid refund request number');
  return { amount, refundRequestNo };
}
function yuan(value: unknown) {
  if (typeof value !== 'string') throw httpError(502, 'Refund response amount is missing');
  try {
    const amount = amountYuanStringToFen(value);
    if (!Number.isSafeInteger(amount)) throw new Error('Unsafe amount');
    return amount;
  } catch {
    throw httpError(502, 'Invalid refund response amount');
  }
}
export function verifyAlipayRefund(
  context: ProviderQueryContext,
  expected: ReturnType<typeof resolveRefund>,
  payload: Record<string, unknown>,
  query: boolean,
) {
  const orderNo = payload.outTradeNo ?? payload.out_trade_no;
  const tradeNo = payload.tradeNo ?? payload.trade_no;
  const amount = yuan(
    query
      ? (payload.refundAmount ?? payload.refund_amount)
      : (payload.refundFee ?? payload.refund_fee),
  );
  if (
    orderNo !== context.order.orderNo ||
    amount !== expected.amount ||
    (context.order.providerOrderId && tradeNo !== context.order.providerOrderId) ||
    (query && (payload.outRequestNo ?? payload.out_request_no) !== expected.refundRequestNo)
  )
    throw httpError(502, 'Alipay refund response does not match the request');
  if (query && yuan(payload.totalAmount ?? payload.total_amount) !== context.order.amount)
    throw httpError(502, 'Alipay refund order total does not match');
}
export function verifyWechatRefund(
  context: ProviderQueryContext & { refund?: RefundSelection },
  expected: ReturnType<typeof resolveRefund>,
  payload: Record<string, unknown>,
) {
  const amounts = normalizeObject(payload.amount);
  if (
    payload.out_trade_no !== context.order.orderNo ||
    payload.out_refund_no !== expected.refundRequestNo ||
    (context.order.providerOrderId && payload.transaction_id !== context.order.providerOrderId) ||
    (context.refund?.refundId && payload.refund_id !== context.refund.refundId) ||
    amounts.refund !== expected.amount ||
    amounts.total !== context.order.amount ||
    amounts.currency !== context.order.currency
  )
    throw httpError(502, 'WeChat refund response does not match the request');
}

export function verifyWechatRefundSignature(
  headers: Headers,
  body: string,
  verificationKey: string,
  now = Date.now(),
) {
  const timestamp = headers.get('wechatpay-timestamp') ?? '';
  const nonce = headers.get('wechatpay-nonce') ?? '';
  const signature = headers.get('wechatpay-signature') ?? '';
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !nonce ||
    nonce.length > 128 ||
    !signature
  )
    throw httpError(502, 'Missing or expired WeChat refund response signature');
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${timestamp}\n${nonce}\n${body}\n`);
    verifier.end();
    if (!verifier.verify(verificationKey, signature, 'base64'))
      throw new Error('Signature mismatch');
  } catch {
    throw httpError(502, 'Invalid WeChat refund response signature');
  }
}
