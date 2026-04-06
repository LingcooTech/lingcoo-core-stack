import {
  OpenRouterSettingsService,
  type OpenRouterModelSummary
} from '../../../lib/openrouter-settings';
import type {
  AiChatCompletionInput,
  AiChatCompletionResult,
  AiModelSummary,
  AiProviderAdapter,
  AiProviderContext,
  AiProviderStatus
} from './types';

function mapModel(item: OpenRouterModelSummary): AiModelSummary {
  return {
    id: item.id,
    name: item.name,
    contextLength: item.contextLength,
    maxCompletionTokens: item.maxCompletionTokens,
    promptPricing: item.promptPricing,
    completionPricing: item.completionPricing,
    modality: item.modality
  };
}

export class OpenRouterProvider implements AiProviderAdapter {
  readonly code = 'openrouter' as const;
  readonly label = 'OpenRouter';

  async getStatus(context: AiProviderContext): Promise<AiProviderStatus> {
    const overview = await new OpenRouterSettingsService(context.db, context.env).getOverview();

    return {
      code: this.code,
      label: this.label,
      configured: overview.configured,
      source: overview.source
    };
  }

  async listModels(context: AiProviderContext): Promise<AiModelSummary[]> {
    const models = await new OpenRouterSettingsService(context.db, context.env).listModels();
    return models.map(mapModel);
  }

  async createChatCompletion(
    context: AiProviderContext,
    input: AiChatCompletionInput
  ): Promise<AiChatCompletionResult> {
    return new OpenRouterSettingsService(context.db, context.env).createChatCompletion(input);
  }
}
