import { z } from 'zod';

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalUrlString = z
  .union([z.string().trim().url(), z.literal('')])
  .optional()
  .transform((value) => (value ? value : undefined));

export const aiProviderCodeSchema = z.enum(['openrouter']);

export const aiProviderParamsSchema = z.object({
  provider: aiProviderCodeSchema
});

export const aiAppCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64)
});

export const aiAppProviderParamsSchema = z.object({
  appCode: aiAppCodeParamsSchema.shape.appCode,
  provider: aiProviderCodeSchema
});

export const openrouterSettingsSchema = z.object({
  apiKey: optionalTrimmedString(255),
  baseUrl: optionalUrlString,
  siteUrl: optionalUrlString,
  siteName: optionalTrimmedString(120),
  defaultModel: optionalTrimmedString(255)
});

export const aiChatCompletionSchema = z.object({
  model: z.string().trim().min(1).max(255).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string().trim().min(1).max(100_000)
      })
    )
    .min(1)
    .max(100),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(1).max(32_000).optional()
});

export const openrouterPreviewChatSchema = openrouterSettingsSchema.merge(aiChatCompletionSchema);

export const aiProxyChatCompletionSchema = aiChatCompletionSchema.extend({
  operation: z.enum(['chat', 'translation', 'proofreading']).optional()
});
