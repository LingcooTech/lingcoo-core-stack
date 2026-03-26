import type { AppEnv } from '../../../lib/env';
import { httpError } from '../../../lib/errors';
import { AlipayProvider } from './alipay';
import type { BillingProviderAdapter } from './types';
import { WechatPayProvider } from './wechat-pay';

function buildProviders(): BillingProviderAdapter[] {
  return [new WechatPayProvider(), new AlipayProvider()];
}

export function listBillingProviders(env: AppEnv) {
  return buildProviders().map((provider) => ({
    code: provider.code,
    configured: provider.isConfigured(env)
  }));
}

export function getBillingProviderAdapter(code: 'wechat_pay' | 'alipay') {
  const provider = buildProviders().find((item) => item.code === code);

  if (!provider) {
    throw httpError(400, `Unsupported billing provider: ${code}`);
  }

  return provider;
}
