import { z } from 'zod';

export const AiProviderStatusSchema = z.object({
  code: z.string(),
  label: z.string(),
  configured: z.boolean(),
  source: z.union([z.literal('database'), z.literal('env'), z.literal('none')]),
});

export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

export const AiProviderListResponseSchema = z.object({ items: z.array(AiProviderStatusSchema) });

export type AiProviderListResponse = z.infer<typeof AiProviderListResponseSchema>;

export const AiModelSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.union([z.string(), z.null()]),
  contextLength: z.union([z.number(), z.null()]),
  maxCompletionTokens: z.union([z.number(), z.null()]),
  promptPricing: z.union([z.string(), z.null()]),
  completionPricing: z.union([z.string(), z.null()]),
  modality: z.union([z.string(), z.null()]),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
});

export type AiModelSummary = z.infer<typeof AiModelSummarySchema>;

export const AiProviderModelsResponseSchema = z.object({
  provider: z.string(),
  items: z.array(AiModelSummarySchema),
});

export type AiProviderModelsResponse = z.infer<typeof AiProviderModelsResponseSchema>;

export const AiChatCompletionResultSchema = z.object({
  provider: z.string(),
  model: z.string(),
  content: z.string(),
  finishReason: z.union([z.string(), z.null()]),
  usage: z.object({
    promptTokens: z.union([z.number(), z.null()]),
    completionTokens: z.union([z.number(), z.null()]),
    totalTokens: z.union([z.number(), z.null()]),
  }),
  meta: z.object({ id: z.union([z.string(), z.null()]), created: z.union([z.number(), z.null()]) }),
});

export type AiChatCompletionResult = z.infer<typeof AiChatCompletionResultSchema>;
