import type { DbClient } from '../../../db/types';
import type { AppEnv } from '../../../lib/env';

export type AiProviderCode = 'openrouter';

export type AiProviderStatus = {
  code: AiProviderCode;
  label: string;
  configured: boolean;
  source: 'database' | 'env' | 'none';
};

export type AiModelSummary = {
  id: string;
  name: string;
  description: string | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  promptPricing: string | null;
  completionPricing: string | null;
  modality: string | null;
  inputModalities: string[];
  outputModalities: string[];
};

export type AiChatCompletionInput = {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
};

export type AiChatCompletionResult = {
  provider: AiProviderCode;
  model: string;
  content: string;
  finishReason: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  meta: {
    id: string | null;
    created: number | null;
  };
};

export type AiProviderContext = {
  db: DbClient;
  env: AppEnv;
};

export interface AiProviderAdapter {
  code: AiProviderCode;
  label: string;
  getStatus(context: AiProviderContext): Promise<AiProviderStatus>;
  listModels(context: AiProviderContext): Promise<AiModelSummary[]>;
  createChatCompletion(context: AiProviderContext, input: AiChatCompletionInput): Promise<AiChatCompletionResult>;
}
