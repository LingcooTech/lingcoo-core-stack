import { httpError } from '../../../lib/errors';
import { OpenRouterProvider } from './openrouter';
import type { AiProviderAdapter, AiProviderCode, AiProviderContext } from './types';

function buildProviders(): AiProviderAdapter[] {
  return [new OpenRouterProvider()];
}

export async function listAiProviders(context: AiProviderContext) {
  const providers = buildProviders();
  return Promise.all(providers.map((provider) => provider.getStatus(context)));
}

export function getAiProviderAdapter(code: AiProviderCode) {
  const provider = buildProviders().find((item) => item.code === code);

  if (!provider) {
    throw httpError(400, `Unsupported AI provider: ${code}`);
  }

  return provider;
}
