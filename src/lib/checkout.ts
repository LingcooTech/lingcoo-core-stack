import { randomBytes } from 'node:crypto';

import type { PreparedPayment } from '../modules/billing/providers/types';
import { httpError } from './errors';

export type CheckoutAction =
  | {
      type: 'qr_code';
      qrCodeText: string;
      codeUrl?: string;
    }
  | {
      type: 'redirect_url';
      url: string;
    };

export function createCheckoutSessionCode(date = new Date()) {
  return `chk_${date.getTime().toString(36)}${randomBytes(6).toString('hex')}`;
}

export function normalizePreparedPaymentToCheckoutAction(payment: PreparedPayment): CheckoutAction {
  if (payment.mode === 'native_qr') {
    const qrCodeText = String(
      payment.payload.qrCodeText ?? payment.payload.codeUrl ?? payment.payload.qrCode ?? '',
    ).trim();

    if (!qrCodeText) {
      throw httpError(500, 'Payment provider did not return a QR code');
    }

    return {
      type: 'qr_code',
      qrCodeText,
      codeUrl: String(payment.payload.codeUrl ?? qrCodeText),
    };
  }

  const url = String(payment.payload.checkoutUrl ?? '').trim();
  if (!url) {
    throw httpError(500, 'Payment provider did not return a redirect URL');
  }

  return {
    type: 'redirect_url',
    url,
  };
}
